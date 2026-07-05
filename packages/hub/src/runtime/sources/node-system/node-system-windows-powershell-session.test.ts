import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "vitest";
import {
    JANITOR_SIGNATURE_PATTERNS,
    type WindowsPowerShellQueryName,
    WindowsPowerShellSessionSupervisor,
} from "./node-system-windows-powershell-session";

// The orphan janitor identifies systeminformation's persistent PowerShell child by
// its spawn-argument signature. Those args are an internal detail of the dependency
// with no stability guarantee, and a mismatch silently degrades the janitor to a
// no-op (a signature miss kills nothing and logs nothing). Pin si's real spawn
// command against our signature so a version bump that changes it fails here
// instead of in the field.
test("orphan janitor signature matches systeminformation's persistent PowerShell spawn command", () => {
    const require = createRequire(import.meta.url);
    const utilSource = readFileSync(require.resolve("systeminformation/lib/util.js"), "utf8");
    const spawnArgs = extractPowerShellStartSpawnArgs(utilSource);
    const spawnCommandLine = `powershell.exe ${spawnArgs.join(" ")}`;

    for (const pattern of JANITOR_SIGNATURE_PATTERNS) {
        assert.match(
            spawnCommandLine,
            new RegExp(pattern, "iu"),
            `systeminformation's persistent PowerShell spawn command "${spawnCommandLine}" no longer matches janitor signature `
                + `/${pattern}/. Update JANITOR_SIGNATURE_PATTERNS (and the orphan janitor) to si's new startup command.`,
        );
    }
});

/**
 * Why each systeminformation method may be called from node-system sources
 * without hanging a Windows machine whose persistent PowerShell child died.
 * si's persistent branch never resolves pending queries after the child dies,
 * so every method that reaches util.powerShell() on win32 must go through
 * NodeSystemSource.readWindowsPowerShellQuery (which adds the timeout that
 * feeds the supervisor). Adding a new si call fails this test until the call
 * is either wrapped or verified against si's source to not spawn PowerShell
 * on win32.
 */
const SYSTEM_INFORMATION_METHOD_HANG_CLASSIFICATION: Record<string, string> = {
    battery: "wrapped in readWindowsPowerShellQuery",
    blockDevices: "wrapped in readWindowsPowerShellQuery",
    bluetoothDevices: "win32 bluetooth uses its own per-call execFile PowerShell path; si only reached off-win32",
    cpu: "wrapped in readWindowsPowerShellQuery",
    currentLoad: "si derives it from os.cpus(); no PowerShell on win32",
    diskLayout: "wrapped in readWindowsPowerShellQuery",
    fsSize: "wrapped in readWindowsPowerShellQuery",
    fsStats: "call site is darwin-only (pollDiskThroughput)",
    graphics: "win32 GPU polls nvidia-smi or the helper service; si.graphics only reached off-win32",
    mem: "win32 memory reads readWindowsPhysicalMemory (node:os); si.mem only reached off-win32",
    networkInterfaces: "wrapped in readWindowsPowerShellQuery",
    networkStats: "wrapped in readWindowsPowerShellQuery",
};

const SYSTEM_INFORMATION_CALLING_SOURCE_FILES = [
    "./node-system-source.ts",
    "./node-system-gpu.ts",
    "./bluetooth-battery/bluetooth-battery.ts",
] as const;

test("every systeminformation call in node-system sources is classified for Windows PowerShell hang safety", () => {
    for (const sourceFilePath of SYSTEM_INFORMATION_CALLING_SOURCE_FILES) {
        const source = readFileSync(new URL(sourceFilePath, import.meta.url), "utf8");
        for (const callMatch of source.matchAll(/\bsystemInformation\.(\w+)\(/gu)) {
            const methodName = callMatch[1] ?? "";
            assert.ok(
                methodName in SYSTEM_INFORMATION_METHOD_HANG_CLASSIFICATION,
                `${sourceFilePath} calls systemInformation.${methodName}() which is not classified against the `
                    + "Windows dead-persistent-PowerShell hang. Wrap it in readWindowsPowerShellQuery, or verify in "
                    + "systeminformation's source that it never reaches util.powerShell() on win32, then add it to "
                    + "SYSTEM_INFORMATION_METHOD_HANG_CLASSIFICATION with the reason.",
            );
        }
    }
});

test("supervisor gives a restarted session a fresh empty-result window", async () => {
    const events: string[] = [];
    const supervisor = new WindowsPowerShellSessionSupervisor({
        now: () => 1000,
        restartDelaysMilliseconds: [0],
        session: {
            start: () => events.push("start"),
            restart: () => events.push("restart"),
            release: () => events.push("release"),
        },
    });

    supervisor.start();
    supervisor.recordEmptyResult("networkStats");
    supervisor.recordEmptyResult("networkStats");
    supervisor.recordEmptyResult("networkStats");
    await waitForQueuedSupervisorRestart();

    // One straggler empty from a query that raced the session swap must not
    // burn another restart from the hourly budget; the threshold starts over.
    supervisor.recordEmptyResult("networkStats");
    supervisor.recordEmptyResult("networkStats");
    await waitForQueuedSupervisorRestart();
    assert.deepEqual(events, ["start", "restart"]);

    supervisor.recordEmptyResult("networkStats");
    await waitForQueuedSupervisorRestart();
    assert.deepEqual(events, ["start", "restart", "restart"]);
    supervisor.dispose();
});

test("supervisor backs off restarts and coalesces a pending restart", () => {
    const events: string[] = [];
    const scheduler = new FakeTimeoutScheduler();
    const supervisor = new WindowsPowerShellSessionSupervisor({
        now: () => 1000,
        restartDelaysMilliseconds: [10, 50, 90],
        timeoutScheduler: scheduler,
        session: {
            start: () => events.push("start"),
            restart: () => events.push("restart"),
            release: () => events.push("release"),
        },
    });

    supervisor.start();
    triggerEmptyThreshold(supervisor, "fsSize");
    triggerEmptyThreshold(supervisor, "fsSize");

    assert.deepEqual(scheduler.delaysMilliseconds, [10]);
    assert.deepEqual(events, ["start"]);

    scheduler.runNext();
    triggerEmptyThreshold(supervisor, "fsSize");
    scheduler.runNext();
    triggerEmptyThreshold(supervisor, "fsSize");

    assert.deepEqual(scheduler.delaysMilliseconds, [10, 50, 90]);
    assert.deepEqual(events, ["start", "restart", "restart"]);

    supervisor.recordSuccessfulResult();
    scheduler.runNext();
    triggerEmptyThreshold(supervisor, "fsSize");

    assert.deepEqual(scheduler.delaysMilliseconds, [10, 50, 90, 10]);
    supervisor.dispose();
});

test("supervisor clears a pending restart on dispose", () => {
    const events: string[] = [];
    const scheduler = new FakeTimeoutScheduler();
    const supervisor = new WindowsPowerShellSessionSupervisor({
        now: () => 1000,
        restartDelaysMilliseconds: [10],
        timeoutScheduler: scheduler,
        session: {
            start: () => events.push("start"),
            restart: () => events.push("restart"),
            release: () => events.push("release"),
        },
    });

    supervisor.start();
    triggerEmptyThreshold(supervisor, "networkStats");
    supervisor.dispose();

    assert.deepEqual(events, ["start", "release"]);
    assert.equal(scheduler.clearedTimeoutCount, 1);
    assert.equal(scheduler.pendingTimeoutCount, 0);
});

test("supervisor falls back to per-call PowerShell after persistent restart limit", async () => {
    const events: string[] = [];
    const supervisor = new WindowsPowerShellSessionSupervisor({
        now: () => 1000,
        restartDelaysMilliseconds: [0],
        session: {
            start: () => events.push("start"),
            restart: () => events.push("restart"),
            release: () => events.push("release"),
        },
    });

    supervisor.start();

    for (let restartIndex = 0; restartIndex < 10; restartIndex += 1) {
        supervisor.recordEmptyResult("fsSize");
        supervisor.recordEmptyResult("fsSize");
        supervisor.recordEmptyResult("fsSize");
        await waitForQueuedSupervisorRestart();
    }

    supervisor.recordEmptyResult("fsSize");
    supervisor.recordEmptyResult("fsSize");
    supervisor.recordEmptyResult("fsSize");
    await waitForQueuedSupervisorRestart();

    supervisor.recordEmptyResult("networkStats");
    supervisor.recordEmptyResult("networkStats");
    supervisor.recordEmptyResult("networkStats");
    supervisor.recordSuccessfulResult();
    await waitForQueuedSupervisorRestart();
    // A start() after the fallback latch must not re-create an unsupervised
    // persistent session (for example from a future idle-gating resume path).
    supervisor.start();
    supervisor.dispose();

    assert.deepEqual(events, [
        "start",
        "restart",
        "restart",
        "restart",
        "restart",
        "restart",
        "restart",
        "restart",
        "restart",
        "restart",
        "restart",
        "release",
    ]);
});

/** Extracts the argument vector passed to `spawn(_powerShell, [...])` in si's powerShellStart. */
function extractPowerShellStartSpawnArgs(utilSource: string): readonly string[] {
    const functionIndex = utilSource.indexOf("function powerShellStart(");
    assert.notEqual(functionIndex, -1, "powerShellStart not found in systeminformation util.js");

    const spawnMatch = /spawn\(_powerShell,\s*\[([^\]]*)\]/u.exec(utilSource.slice(functionIndex));
    assert.notEqual(spawnMatch, null, "powerShellStart spawn argument array not found in systeminformation util.js");

    return (spawnMatch?.[1] ?? "")
        .split(",")
        .map(token => token.trim().replace(/^['"]|['"]$/gu, ""))
        .filter(token => token.length > 0);
}

async function waitForQueuedSupervisorRestart(): Promise<void> {
    await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
    });
}

function triggerEmptyThreshold(
    supervisor: WindowsPowerShellSessionSupervisor,
    queryName: WindowsPowerShellQueryName,
): void {
    supervisor.recordEmptyResult(queryName);
    supervisor.recordEmptyResult(queryName);
    supervisor.recordEmptyResult(queryName);
}

interface FakeScheduledTimeout {
    readonly timeout: NodeJS.Timeout;
    readonly callback: () => void;
    isCleared: boolean;
}

class FakeTimeoutScheduler {
    readonly delaysMilliseconds: number[] = [];
    private readonly scheduledTimeouts: FakeScheduledTimeout[] = [];
    clearedTimeoutCount = 0;

    setTimeout(callback: () => void, delayMilliseconds: number): NodeJS.Timeout {
        this.delaysMilliseconds.push(delayMilliseconds);
        const timeout = globalThis.setTimeout(() => undefined, 2 ** 31 - 1);
        timeout.unref();
        const scheduledTimeout: FakeScheduledTimeout = {
            timeout,
            callback,
            isCleared: false,
        };
        this.scheduledTimeouts.push(scheduledTimeout);
        return timeout;
    }

    clearTimeout(timeout: NodeJS.Timeout): void {
        globalThis.clearTimeout(timeout);
        const scheduledTimeout = this.scheduledTimeouts.find(candidate => candidate.timeout === timeout);
        if (scheduledTimeout !== undefined && !scheduledTimeout.isCleared) {
            scheduledTimeout.isCleared = true;
            this.clearedTimeoutCount += 1;
        }
    }

    get pendingTimeoutCount(): number {
        return this.scheduledTimeouts.filter(candidate => !candidate.isCleared).length;
    }

    runNext(): void {
        const scheduledTimeout = this.scheduledTimeouts.find(candidate => !candidate.isCleared);
        if (scheduledTimeout === undefined) {
            assert.fail("No pending timeout to run");
        }
        globalThis.clearTimeout(scheduledTimeout.timeout);
        scheduledTimeout.isCleared = true;
        scheduledTimeout.callback();
    }
}
