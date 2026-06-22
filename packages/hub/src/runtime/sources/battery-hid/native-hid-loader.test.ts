import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "vitest";

import { loadNativeHidModuleWithRequire } from "./native-hid-loader-internal";

const TEST_NODE_HID_NATIVE_ADDON_TARGET = "win32-x64";
const TEST_NODE_HID_NATIVE_ADDON_PATH = "prebuilds/HID-win32-x64/node-napi-v4.node";
const NON_TARGET_NODE_HID_NATIVE_ADDON_PATH = "prebuilds/HID-darwin-x64/node-napi-v4.node";

test("native HID module is requested only by the lazy loader", async () => {
    const productionFileList = await listProductionSourceFiles(resolve("src"));
    const violatingFileList = [];

    for (const filePath of productionFileList) {
        const source = await readFile(filePath, "utf8");
        if (!source.includes("node-hid")) {
            continue;
        }

        const relativeSourcePath = relative(resolve("src"), filePath).replaceAll("\\", "/");
        if (relativeSourcePath === "runtime/sources/battery-hid/native-hid-loader.ts" ||
            relativeSourcePath === "runtime/sources/battery-hid/native-hid-loader-internal.ts") {
            continue;
        }

        violatingFileList.push(relative(process.cwd(), filePath));
    }

    assert.deepEqual(violatingFileList, []);
});

test("native HID loader anchors native package resolution to this module", async () => {
    const source = await readFile(resolve("src/runtime/sources/battery-hid/native-hid-loader.ts"), "utf8");

    assert.match(source, /createRequire\(import\.meta\.url\)/u);
    assert.doesNotMatch(source, /process\.argv|process\.cwd/u);
});

test("native HID loader returns unavailable when node-hid cannot load", () => {
    const loadError = new Error("native addon failed");

    const result = loadNativeHidModuleWithRequire(() => {
        throw loadError;
    });

    assert.deepEqual(result, {
        state: "unavailable",
        error: loadError,
    });
});

test("native HID loader returns unavailable when node-hid exports the wrong shape", () => {
    const result = loadNativeHidModuleWithRequire(() => ({
        HID: class {},
    }));

    assert.equal(result.state, "unavailable");
    assert.match(String(result.error), /node-hid did not export devices\(\)/u);
});

test("native HID loader exposes the expected node-hid surface", () => {
    class HidDevice {}
    const deviceList = [{ path: "hid-path", vendorId: 0x046D, productId: 0xC548 }];

    const result = loadNativeHidModuleWithRequire(() => ({
        HID: HidDevice,
        devices: () => deviceList,
    }));

    assert.equal(result.state, "loaded");
    assert.equal(result.module.HID, HidDevice);
    assert.equal(result.module.devices(), deviceList);
});

test("node-hid dependency stays exactly pinned", () => {
    const version = execFileSync(
        process.execPath,
        ["-e", "process.stdout.write(require('./package.json').dependencies['node-hid'])"],
        { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(version, "3.3.0");
});

test("node-hid staged native addon validation accepts expected binaries", async () => {
    const temporaryDirectory = await createStagedNodeHidFixture();

    try {
        execFileSync(process.execPath, [
            "scripts/packaging/node-hid-native-addons.mjs",
            join(temporaryDirectory, "com.ez.sho-metrics.sdPlugin"),
            TEST_NODE_HID_NATIVE_ADDON_TARGET,
        ], { cwd: process.cwd(), stdio: "pipe" });
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
});

test("node-hid staged native addon validation rejects unexpected binaries", async () => {
    const temporaryDirectory = await createStagedNodeHidFixture();

    try {
        const unexpectedNativeAddonPath = join(
            temporaryDirectory,
            "com.ez.sho-metrics.sdPlugin",
            "bin",
            "node_modules",
            "node-hid",
            NON_TARGET_NODE_HID_NATIVE_ADDON_PATH,
        );
        await mkdir(dirname(unexpectedNativeAddonPath), { recursive: true });
        await writeFile(unexpectedNativeAddonPath, "unexpected");

        assert.throws(
            () => execFileSync(process.execPath, [
                "scripts/packaging/node-hid-native-addons.mjs",
                join(temporaryDirectory, "com.ez.sho-metrics.sdPlugin"),
                TEST_NODE_HID_NATIVE_ADDON_TARGET,
            ], { cwd: process.cwd(), stdio: "pipe" }),
            /Unexpected staged node-hid native addon/u,
        );
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
});

test("node-hid native addon target validation rejects Object prototype names", async () => {
    const temporaryDirectory = await createStagedNodeHidFixture();

    try {
        assert.throws(
            () => execFileSync(process.execPath, [
                "scripts/packaging/node-hid-native-addons.mjs",
                join(temporaryDirectory, "com.ez.sho-metrics.sdPlugin"),
                "toString",
            ], { cwd: process.cwd(), stdio: "pipe" }),
            /Unsupported node-hid native addon target/u,
        );
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
});

test("node-hid native addon target map points only to hash-allowlisted binaries", () => {
    const serializedResult = execFileSync(process.execPath, [
        "--input-type=module",
        "-e",
        [
            "import {",
            "nodeHidNativeAddonRelativePathByTarget,",
            "nodeHidNativeAddonSha256ByRelativePath",
            "} from './scripts/packaging/node-hid-native-addons.mjs';",
            "const missing = Object.entries(nodeHidNativeAddonRelativePathByTarget)",
            ".filter(([, relativePath]) => !Object.hasOwn(nodeHidNativeAddonSha256ByRelativePath, relativePath));",
            "process.stdout.write(JSON.stringify(missing));",
        ].join(" "),
    ], { cwd: process.cwd(), encoding: "utf8" });

    assert.deepEqual(JSON.parse(serializedResult), []);
});

test("node-hid staged native addon validation rejects changed hashes", async () => {
    const temporaryDirectory = await createStagedNodeHidFixture();

    try {
        await writeFile(
            join(
                temporaryDirectory,
                "com.ez.sho-metrics.sdPlugin",
                "bin",
                "node_modules",
                "node-hid",
                TEST_NODE_HID_NATIVE_ADDON_PATH,
            ),
            "changed",
        );

        assert.throws(
            () => execFileSync(process.execPath, [
                "scripts/packaging/node-hid-native-addons.mjs",
                join(temporaryDirectory, "com.ez.sho-metrics.sdPlugin"),
                TEST_NODE_HID_NATIVE_ADDON_TARGET,
            ], { cwd: process.cwd(), stdio: "pipe" }),
            /Unexpected SHA-256/u,
        );
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
});

async function createStagedNodeHidFixture(): Promise<string> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "sho-metrics-node-hid-test-"));
    const stagedNodeHidDirectory = join(
        temporaryDirectory,
        "com.ez.sho-metrics.sdPlugin",
        "bin",
        "node_modules",
        "node-hid",
    );

    const sourcePath = join("node_modules", "node-hid", TEST_NODE_HID_NATIVE_ADDON_PATH);
    const targetPath = join(stagedNodeHidDirectory, TEST_NODE_HID_NATIVE_ADDON_PATH);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);

    return temporaryDirectory;
}

async function listProductionSourceFiles(directoryPath: string): Promise<string[]> {
    const fileList: string[] = [];

    for (const directoryEntry of await readdir(directoryPath, { withFileTypes: true })) {
        const entryPath = join(directoryPath, directoryEntry.name);
        if (directoryEntry.isDirectory()) {
            fileList.push(...await listProductionSourceFiles(entryPath));
            continue;
        }

        if (directoryEntry.isFile() &&
            (entryPath.endsWith(".ts") || entryPath.endsWith(".mjs")) &&
            !entryPath.endsWith(".test.ts") &&
            !entryPath.endsWith(".d.ts") &&
            !entryPath.endsWith(".d.mts")) {
            fileList.push(entryPath);
        }
    }

    return fileList;
}
