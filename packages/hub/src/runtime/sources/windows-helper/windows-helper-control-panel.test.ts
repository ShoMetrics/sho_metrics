import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildRegistryQueryArguments,
    createWindowsHelperControlPanelLauncher,
    parseWindowsHelperAppPath,
    parseWindowsHelperInstallLocation,
} from "./windows-helper-control-panel";

test("Windows Helper Control Panel launcher uses the installer's configured directory", async () => {
    const launchedExecutablePathList: string[] = [];
    const launcher = createWindowsHelperControlPanelLauncher({
        platform: "win32",
        readAppPath: async () => undefined,
        readInstallLocation: async () => "D:\\Tools\\ShoMetrics Helper\\",
        launchExecutable: async (executablePath) => {
            launchedExecutablePathList.push(executablePath);
        },
    });

    await launcher.open();

    assert.deepEqual(launchedExecutablePathList, [
        "D:\\Tools\\ShoMetrics Helper\\ControlPanel\\ShoMetricsHelper.exe",
    ]);
});

test("Windows Helper Control Panel launcher rejects a missing installation", async () => {
    const launcher = createWindowsHelperControlPanelLauncher({
        platform: "win32",
        readAppPath: async () => undefined,
        readInstallLocation: async () => undefined,
        launchExecutable: async () => {
            assert.fail("A missing install must not launch an executable.");
        },
    });

    await assert.rejects(launcher.open(), /not installed/u);
});

test("Windows Helper Control Panel launcher prefers the installer App Paths entry", async () => {
    const launchedExecutablePathList: string[] = [];
    const launcher = createWindowsHelperControlPanelLauncher({
        platform: "win32",
        readAppPath: async () => "D:\\Moved\\ShoMetricsHelper.exe",
        readInstallLocation: async () => {
            assert.fail("App Paths should avoid the compatibility fallback.");
        },
        launchExecutable: async (executablePath) => {
            launchedExecutablePathList.push(executablePath);
        },
    });

    await launcher.open();

    assert.deepEqual(launchedExecutablePathList, ["D:\\Moved\\ShoMetricsHelper.exe"]);
});

test("Windows Helper Control Panel launcher rejects non-Windows platforms", async () => {
    const launcher = createWindowsHelperControlPanelLauncher({
        platform: "linux",
        readAppPath: async () => {
            assert.fail("A non-Windows platform must not read the registry.");
        },
        readInstallLocation: async () => {
            assert.fail("A non-Windows platform must not read the registry.");
        },
        launchExecutable: async () => {
            assert.fail("A non-Windows platform must not launch an executable.");
        },
    });

    await assert.rejects(launcher.open(), /only available on Windows/u);
});

test("Windows Helper registry queries always read the 64-bit view", () => {
    // The helper installs 64-bit. Without /reg:64 a 32-bit host process would be
    // redirected to the 32-bit view, where the uninstall key does not exist, and
    // every installation predating the App Paths entry would look uninstalled.
    assert.deepEqual(
        buildRegistryQueryArguments("HKLM\\SOFTWARE\\Example", "InstallLocation"),
        ["query", "HKLM\\SOFTWARE\\Example", "/v", "InstallLocation", "/reg:64"],
    );
    assert.deepEqual(
        buildRegistryQueryArguments("HKLM\\SOFTWARE\\Example", ""),
        ["query", "HKLM\\SOFTWARE\\Example", "/ve", "/reg:64"],
    );
});

test("Windows Helper install location parser reads Inno's uninstall value", () => {
    assert.equal(
        parseWindowsHelperInstallLocation(
            "InstallLocation    REG_SZ    C:\\Program Files\\ShoMetrics\\ShoMetrics Helper\\\r\n",
        ),
        "C:\\Program Files\\ShoMetrics\\ShoMetrics Helper\\",
    );
});

test("Windows Helper App Paths parser reads the default executable value", () => {
    assert.equal(
        parseWindowsHelperAppPath(
            "(Default)    REG_SZ    C:\\Program Files\\ShoMetrics\\ShoMetrics Helper\\ControlPanel\\ShoMetricsHelper.exe\r\n",
        ),
        "C:\\Program Files\\ShoMetrics\\ShoMetrics Helper\\ControlPanel\\ShoMetricsHelper.exe",
    );
    assert.equal(
        parseWindowsHelperAppPath(
            "(默认)    REG_SZ    C:\\Program Files\\ShoMetrics\\ShoMetrics Helper\\ControlPanel\\ShoMetricsHelper.exe\r\n",
        ),
        "C:\\Program Files\\ShoMetrics\\ShoMetrics Helper\\ControlPanel\\ShoMetricsHelper.exe",
    );
});
