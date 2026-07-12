import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WINDOWS_HELPER_UNINSTALL_REGISTRY_KEY =
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{36A3A687-9B6A-4F81-9343-6683FF2CC3C2}_is1";
const WINDOWS_HELPER_APP_PATHS_REGISTRY_KEY =
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ShoMetricsHelper.exe";
const CONTROL_PANEL_RELATIVE_EXECUTABLE_PATH = ["ControlPanel", "ShoMetricsHelper.exe"] as const;

/** Launches the installed Windows Helper Control Panel for a user-initiated PI request. */
export interface WindowsHelperControlPanelLauncher {
    open(): Promise<void>;
}

interface WindowsHelperControlPanelLauncherDependencies {
    readAppPath(): Promise<string | undefined>;
    readInstallLocation(): Promise<string | undefined>;
    launchExecutable(executablePath: string): Promise<void>;
}

/**
 * Reads the installer's registry entries from the 64-bit view.
 *
 * The helper installs 64-bit, so both entries are written to the 64-bit view.
 * App Paths happens to be a shared key that resolves from either view, but the
 * uninstall key is redirected per view: a 32-bit host process reading it
 * without this switch sees nothing and reports the helper as not installed.
 * That would silently break the fallback for installations predating App Paths,
 * which is the only reason the fallback exists.
 */
const REGISTRY_64_BIT_VIEW_ARGUMENT = "/reg:64";

/** Opens the installed Windows Helper Control Panel. */
export const windowsHelperControlPanelLauncher = createWindowsHelperControlPanelLauncher({
    readAppPath: readWindowsHelperAppPath,
    readInstallLocation: readWindowsHelperInstallLocation,
    launchExecutable: launchDetachedExecutable,
});

/** Creates a Windows Helper Control Panel launcher with an OS-process seam for tests. */
export function createWindowsHelperControlPanelLauncher(
    dependencies: WindowsHelperControlPanelLauncherDependencies,
): WindowsHelperControlPanelLauncher {
    return {
        async open(): Promise<void> {
            if (process.platform !== "win32") {
                throw new Error("ShoMetrics Helper Control Panel is only available on Windows.");
            }

            const registeredExecutablePath = await dependencies.readAppPath();
            if (registeredExecutablePath !== undefined) {
                await dependencies.launchExecutable(registeredExecutablePath);
                return;
            }

            const installLocation = await dependencies.readInstallLocation();
            if (installLocation === undefined) {
                throw new Error("ShoMetrics Helper is not installed.");
            }

            await dependencies.launchExecutable(
                path.join(installLocation, ...CONTROL_PANEL_RELATIVE_EXECUTABLE_PATH),
            );
        },
    };
}

async function readWindowsHelperInstallLocation(): Promise<string | undefined> {
    return readRegistryStringValue(
        WINDOWS_HELPER_UNINSTALL_REGISTRY_KEY,
        "InstallLocation",
        parseWindowsHelperInstallLocation,
    );
}

async function readWindowsHelperAppPath(): Promise<string | undefined> {
    return readRegistryStringValue(
        WINDOWS_HELPER_APP_PATHS_REGISTRY_KEY,
        "",
        parseWindowsHelperAppPath,
    );
}

/** Builds the reg.exe query arguments; an empty value name reads the default value. */
export function buildRegistryQueryArguments(registryKey: string, valueName: string): readonly string[] {
    const valueArguments = valueName === "" ? ["/ve"] : ["/v", valueName];

    return ["query", registryKey, ...valueArguments, REGISTRY_64_BIT_VIEW_ARGUMENT];
}

async function readRegistryStringValue(
    registryKey: string,
    valueName: string,
    parseValue: (registryQueryOutput: string) => string | undefined,
): Promise<string | undefined> {
    try {
        const { stdout } = await execFileAsync(
            "reg.exe",
            [...buildRegistryQueryArguments(registryKey, valueName)],
            { windowsHide: true },
        );
        return parseValue(stdout);
    } catch (error) {
        if (readProcessExitCode(error) === 1) {
            // reg.exe uses exit code 1 when the requested key or value is absent.
            // Treat it as a normal lookup miss so App Paths can fall back to the
            // uninstall entry and an absent installation gets a clear PI result.
            return undefined;
        }

        throw new Error(`Failed to read ShoMetrics Helper registry entry: ${String(error)}`);
    }
}

export function parseWindowsHelperInstallLocation(registryQueryOutput: string): string | undefined {
    const match = /^\s*InstallLocation\s+REG_SZ\s+(.+?)\s*$/imu.exec(registryQueryOutput);
    return match?.[1] || undefined;
}

export function parseWindowsHelperAppPath(registryQueryOutput: string): string | undefined {
    // `reg query /ve` localizes the default-value label, but the value type is
    // stable. Only parse the REG_SZ field and its executable path.
    const match = /^\s*\S.*?\s+REG_SZ\s+(.+?)\s*$/imu.exec(registryQueryOutput);
    return match?.[1] || undefined;
}

function readProcessExitCode(error: unknown): number | undefined {
    if (!error || typeof error !== "object" || !("code" in error)) {
        return undefined;
    }

    const code = error.code;
    return typeof code === "number" ? code : undefined;
}

function launchDetachedExecutable(executablePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const childProcess = spawn(executablePath, [], {
            cwd: path.dirname(executablePath),
            detached: true,
            stdio: "ignore",
            windowsHide: false,
        });

        childProcess.once("error", reject);
        childProcess.once("spawn", () => {
            childProcess.unref();
            resolve();
        });
    });
}
