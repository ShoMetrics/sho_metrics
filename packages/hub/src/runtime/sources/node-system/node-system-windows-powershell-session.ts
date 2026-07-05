import { execFile } from "node:child_process";
import { promisify } from "node:util";
import si from "systeminformation";
import { logger } from "../../../logging/node-logger";
import { resolveWindowsPowerShellExecutablePath } from "./windows-powershell-executable";

const log = logger.for("Source:NodeSystem:PowerShell");
const execFileAsync = promisify(execFile);

const POWERSHELL_SESSION_RESTART_EMPTY_RESULT_THRESHOLD = 3;
const POWERSHELL_SESSION_RESTART_WINDOW_MILLISECONDS = 60 * 60 * 1000;
const POWERSHELL_SESSION_MAX_RESTARTS_PER_WINDOW = 10;
const POWERSHELL_SESSION_RESTART_DELAYS_MILLISECONDS = [1000, 5000, 30000] as const;

export type WindowsPowerShellQueryName =
    | "battery"
    | "blockDevices"
    | "cpu"
    | "diskLayout"
    | "fsSize"
    | "networkInterfaces"
    | "networkStats";

/**
 * Command-line signature of systeminformation v5's process-wide persistent
 * PowerShell child (spawned by powerShellStart in
 * node_modules/systeminformation/lib/util.js). The orphan janitor matches every
 * pattern to avoid touching a user's own PowerShell windows. This is an internal
 * detail of the dependency with no stability guarantee, so
 * node-system-windows-powershell-session.test.ts pins it against si's real source
 * to make a version bump that changes it fail loudly instead of silently turning
 * the janitor into a no-op.
 */
export const JANITOR_SIGNATURE_PATTERNS = [
    "-NoProfile",
    "-NoLogo",
    "-InputFormat\\s+Text",
    "-NoExit",
    "-Command\\s+-\\s*$",
] as const;

const JANITOR_SKIP_UNMATCHED_CONDITION = JANITOR_SIGNATURE_PATTERNS
    .map(pattern => `$commandLine -notmatch '(?i)${pattern}'`)
    .join(" -or ");

interface PowerShellSessionApi {
    powerShellStart(): void;
    powerShellRelease(): void;
}

interface TimeoutScheduler {
    setTimeout(callback: () => void, delayMilliseconds: number): NodeJS.Timeout;
    clearTimeout(timeout: NodeJS.Timeout): void;
}

const defaultTimeoutScheduler: TimeoutScheduler = {
    setTimeout,
    clearTimeout,
};

/** Manages systeminformation's process-wide persistent PowerShell session. */
export interface NodeSystemWindowsPowerShellSession {
    start(): void;
    restart(): void;
    release(): void;
}

export interface WindowsPowerShellSessionSupervisorOptions {
    readonly session: NodeSystemWindowsPowerShellSession;
    readonly now: () => number;
    readonly restartDelaysMilliseconds?: readonly number[];
    readonly timeoutScheduler?: TimeoutScheduler;
}

/**
 * Restarts systeminformation's persistent PowerShell session when Windows queries
 * repeatedly return impossible empty results.
 *
 * systeminformation v5 keeps the persistent PowerShell child in module-global
 * state. If the child dies, later calls can return empty strings instead of
 * restarting it, so ShoMetrics supervises the session from the source boundary.
 */
export class WindowsPowerShellSessionSupervisor {
    private readonly timeoutScheduler: TimeoutScheduler;
    private readonly restartDelaysMilliseconds: readonly number[];
    private readonly restartTimestamps: number[] = [];
    private pendingRestartTimeout: NodeJS.Timeout | undefined;
    private consecutiveEmptyResultCount = 0;
    private restartBackoffIndex = 0;
    private isDisposed = false;
    private isPersistentSessionDisabled = false;

    constructor(private readonly options: WindowsPowerShellSessionSupervisorOptions) {
        this.timeoutScheduler = options.timeoutScheduler ?? defaultTimeoutScheduler;
        this.restartDelaysMilliseconds = options.restartDelaysMilliseconds
            ?? POWERSHELL_SESSION_RESTART_DELAYS_MILLISECONDS;
    }

    start(): void {
        // The fallback latch must also block start(): a future caller that
        // stops and restarts the session lifecycle (for example idle gating on
        // device disconnect) would otherwise re-create a persistent session
        // that this latched supervisor no longer watches.
        if (this.isDisposed || this.isPersistentSessionDisabled) {
            return;
        }

        this.options.session.start();
    }

    dispose(): void {
        this.isDisposed = true;
        if (this.pendingRestartTimeout !== undefined) {
            this.timeoutScheduler.clearTimeout(this.pendingRestartTimeout);
            this.pendingRestartTimeout = undefined;
        }

        if (!this.isPersistentSessionDisabled) {
            this.options.session.release();
        }
    }

    recordSuccessfulResult(): void {
        if (this.isPersistentSessionDisabled) {
            return;
        }

        this.consecutiveEmptyResultCount = 0;
        this.restartBackoffIndex = 0;
    }

    recordEmptyResult(queryName: WindowsPowerShellQueryName): void {
        if (this.isDisposed || this.isPersistentSessionDisabled) {
            return;
        }

        this.consecutiveEmptyResultCount += 1;
        if (this.consecutiveEmptyResultCount < POWERSHELL_SESSION_RESTART_EMPTY_RESULT_THRESHOLD) {
            return;
        }

        this.scheduleRestart(queryName);
    }

    private scheduleRestart(queryName: WindowsPowerShellQueryName): void {
        if (this.pendingRestartTimeout !== undefined) {
            return;
        }

        this.pruneRestartWindow();
        if (this.restartTimestamps.length >= POWERSHELL_SESSION_MAX_RESTARTS_PER_WINDOW) {
            this.disablePersistentSession(queryName);
            return;
        }

        const delayMilliseconds = this.restartDelaysMilliseconds[
            Math.min(this.restartBackoffIndex, this.restartDelaysMilliseconds.length - 1)
        ] ?? 0;
        this.restartBackoffIndex += 1;
        this.pendingRestartTimeout = this.timeoutScheduler.setTimeout(() => {
            this.pendingRestartTimeout = undefined;
            if (this.isDisposed) {
                return;
            }

            this.restartTimestamps.push(this.options.now());
            this.options.session.restart();
            // Give the fresh session a full evaluation window. Queries still in
            // flight against the killed child can resolve as spurious empty results
            // during the swap; without this reset, the count already sits at the
            // threshold, so a transition straggler can burn another restart from the
            // hourly budget and falsely latch a healthy machine into the slower
            // per-call fallback. A genuinely broken session will still re-qualify
            // after another full empty-result threshold.
            this.consecutiveEmptyResultCount = 0;
            log.warn(() => [
                "windowsPowerShellSessionRestarted",
                `query=${queryName}`,
                `restartCount=${this.restartTimestamps.length}`,
                `delayMs=${delayMilliseconds}`,
            ].join(" "));
        }, delayMilliseconds);
    }

    private pruneRestartWindow(): void {
        const oldestAllowedTimestamp = this.options.now() - POWERSHELL_SESSION_RESTART_WINDOW_MILLISECONDS;
        while (this.restartTimestamps.length > 0 && (this.restartTimestamps[0] ?? 0) < oldestAllowedTimestamp) {
            this.restartTimestamps.shift();
        }
    }

    private disablePersistentSession(queryName: WindowsPowerShellQueryName): void {
        this.isPersistentSessionDisabled = true;
        this.consecutiveEmptyResultCount = 0;
        // Releasing the session returns systeminformation to its older
        // spawn-per-call path. That is slower, but keeps metrics available on
        // machines where EDR, policy, or PowerShell itself keeps killing the
        // long-lived stdin bridge.
        this.options.session.release();
        log.warn(() => [
            "windowsPowerShellPersistentSessionDisabled",
            `query=${queryName}`,
            `restartCount=${this.restartTimestamps.length}`,
            `windowMs=${POWERSHELL_SESSION_RESTART_WINDOW_MILLISECONDS}`,
            "fallback=per-call-powershell",
        ].join(" "));
    }
}

export function createSystemInformationPowerShellSession(): NodeSystemWindowsPowerShellSession {
    return new SystemInformationPowerShellSession(si);
}

class SystemInformationPowerShellSession implements NodeSystemWindowsPowerShellSession {
    private isStarted = false;

    constructor(private readonly powerShellApi: PowerShellSessionApi) {}

    start(): void {
        if (this.isStarted) {
            return;
        }

        this.isStarted = true;
        cleanupOrphanSystemInformationPowerShellProcesses();
        this.powerShellApi.powerShellStart();
        log.info(() => "windowsPowerShellPersistentSessionStarted");
    }

    restart(): void {
        this.powerShellApi.powerShellRelease();
        this.powerShellApi.powerShellStart();
    }

    release(): void {
        if (!this.isStarted) {
            return;
        }

        this.isStarted = false;
        this.powerShellApi.powerShellRelease();
        log.info(() => "windowsPowerShellPersistentSessionReleased");
    }
}

function cleanupOrphanSystemInformationPowerShellProcesses(): void {
    void killOrphanSystemInformationPowerShellProcesses()
        .then(killedProcessIds => {
            // A non-empty kill list means the stdin-EOF exit layer failed for a
            // previous plugin process; that is unexpected enough to surface.
            if (killedProcessIds.length > 0) {
                log.warn(() => `windowsPowerShellOrphanJanitorKilledProcesses pids=${killedProcessIds.join(",")}`);
            }
        })
        .catch(error => {
            // The janitor is a best-effort backstop and runs once per session
            // start, so a machine that blocks it (spawn failure, policy,
            // timeout) is worth one warn rather than a silent debug line.
            log.warn(() => `windowsPowerShellOrphanJanitorFailed error=${String(error)}`);
        });
}

async function killOrphanSystemInformationPowerShellProcesses(): Promise<readonly string[]> {
    const { stdout } = await execFileAsync(resolveWindowsPowerShellExecutablePath(), [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        [
            "$killedProcessIds = @()",
            "$processes = Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" -ErrorAction SilentlyContinue",
            "foreach ($process in $processes) {",
            "  $commandLine = [string]$process.CommandLine",
            // Match only the persistent systeminformation shell shape
            // (JANITOR_SIGNATURE_PATTERNS). The missing-parent check below is what
            // makes the janitor safe to run at startup without touching a user's
            // own PowerShell windows.
            `  if (${JANITOR_SKIP_UNMATCHED_CONDITION}) { continue }`,
            "  $parent = Get-CimInstance Win32_Process -Filter \"ProcessId = $($process.ParentProcessId)\" -ErrorAction SilentlyContinue",
            "  if ($null -ne $parent) { continue }",
            // Kill through the live process handle instead of Stop-Process -Id so a
            // PID reused between enumeration and kill cannot be hit, and re-verify
            // process name and start time so only the exact matched instance dies.
            // The start-time check needs a tolerance: CIM CreationDate is truncated
            // to DMTF microseconds while .NET StartTime keeps full 100ns ticks, so
            // exact -eq is almost always false for the same process. Keep the math
            // expression PowerShell-native: locally simulating Constrained
            // Language Mode with
            // `$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'`
            // made `[Math]::Abs(-1)` fail with "Cannot invoke method...".
            "  try {",
            "    $target = Get-Process -Id $process.ProcessId -ErrorAction Stop",
            "    $startTimeDeltaSeconds = ($target.StartTime - $process.CreationDate).TotalSeconds",
            "    if ($target.ProcessName -eq 'powershell' -and $startTimeDeltaSeconds -gt -1 -and $startTimeDeltaSeconds -lt 1) { $target.Kill(); $killedProcessIds += $process.ProcessId }",
            "  } catch { }",
            "}",
            "Write-Output ($killedProcessIds -join ' ')",
        ].join("; "),
    ], {
        timeout: 5000,
        windowsHide: true,
    });

    return stdout.split(/\s+/u).filter(token => token.length > 0);
}
