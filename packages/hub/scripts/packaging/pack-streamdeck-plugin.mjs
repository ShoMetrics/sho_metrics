import { existsSync } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
    assertNodeHidDependencyPinned,
    assertStagedNodeHidNativeAddons,
    NODE_HID_PACKAGE_NAME,
    resolveHostNodeHidNativeAddonTarget,
    resolveSupportedNodeHidNativeAddonTarget,
    stageNodeHidRuntimeDependency,
} from "./node-hid-native-addons.mjs";

const PLUGIN_DIRECTORY_NAME = "com.ez.sho-metrics.sdPlugin";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const packageDirectory = join(scriptDirectory, "..", "..");
const repositoryDirectory = join(packageDirectory, "..", "..");
const pluginDirectory = join(packageDirectory, PLUGIN_DIRECTORY_NAME);
const outputDirectory = join(repositoryDirectory, "artifacts", "hub", "streamdeck-plugin");
const stagingRootDirectory = join(outputDirectory, "staging");
const stagingPluginDirectory = join(stagingRootDirectory, PLUGIN_DIRECTORY_NAME);
const packageOutputDirectory = join(outputDirectory, "package");
const legacyPackagePath = join(outputDirectory, "com.ez.sho-metrics.streamDeckPlugin");
const streamdeckCliPath = join(packageDirectory, "node_modules", "@elgato", "cli", "bin", "streamdeck.mjs");
const packageJsonPath = join(packageDirectory, "package.json");
const packageLockPath = join(packageDirectory, "package-lock.json");
const npmCommand = createNpmCommand();
const supportedNativeRuntimeDependencyPackageNames = [
    "resvg-js-win32-x64-msvc",
    "resvg-js-win32-arm64-msvc",
    "resvg-js-darwin-x64",
    "resvg-js-darwin-arm64",
];
const runtimeDependencyPackageNames = [
    "resvg-js",
    ...supportedNativeRuntimeDependencyPackageNames,
];
const hostNativeRuntimeDependencyPackageName = resolveHostNativeRuntimeDependencyPackageName();

await packStreamDeckPlugin(process.argv.slice(2));

async function packStreamDeckPlugin(argumentList) {
    const packOptions = parsePackOptions(argumentList);

    await rm(stagingRootDirectory, { recursive: true, force: true });
    await rm(packageOutputDirectory, { recursive: true, force: true });
    await rm(legacyPackagePath, { force: true });
    await mkdir(stagingRootDirectory, { recursive: true });
    await mkdir(packageOutputDirectory, { recursive: true });

    await cp(pluginDirectory, stagingPluginDirectory, {
        recursive: true,
        filter: sourcePath => shouldStagePluginPath(sourcePath),
    });
    await assertNodeHidDependencyPinned({ packageJsonPath, packageLockPath });
    await stageRuntimeDependencies({ nativeAddonTarget: packOptions.nativeAddonTarget });
    await assertRuntimeDependenciesComplete({ nativeAddonTarget: packOptions.nativeAddonTarget });
    assertHostRuntimeDependencyCanLoad();
    assertHostNodeHidRuntimeDependencyCanLoad(packOptions.nativeAddonTarget);

    await runStreamDeckPack(packOptions.streamDeckPackArgumentList);
}

async function stageRuntimeDependencies(options) {
    await stageResvgRuntimeDependencies();
    await stageNodeHidRuntimeDependency({
        packageDirectory,
        stagingPluginDirectory,
        nativeAddonTarget: options.nativeAddonTarget,
    });
}

async function stageResvgRuntimeDependencies() {
    const sourceScopeDirectory = join(packageDirectory, "node_modules", "@resvg");
    const targetScopeDirectory = join(stagingPluginDirectory, "bin", "node_modules", "@resvg");
    const packageLock = await readPackageLock();

    await mkdir(targetScopeDirectory, { recursive: true });

    for (const packageName of runtimeDependencyPackageNames) {
        const sourcePackageDirectory = join(sourceScopeDirectory, packageName);
        const targetPackageDirectory = join(targetScopeDirectory, packageName);

        if (await pathExists(sourcePackageDirectory)) {
            await copyRuntimeDependencyPackage(sourcePackageDirectory, targetPackageDirectory);
            continue;
        }

        await downloadRuntimeDependencyPackage(packageLock, packageName, targetPackageDirectory);
    }
}

async function copyRuntimeDependencyPackage(sourcePackageDirectory, targetPackageDirectory) {
    await cp(sourcePackageDirectory, targetPackageDirectory, {
        recursive: true,
        filter: sourcePath => !sourcePath.endsWith(".d.ts"),
    });
}

async function downloadRuntimeDependencyPackage(packageLock, packageName, targetPackageDirectory) {
    const version = readLockedPackageVersion(packageLock, packageName);
    const temporaryDirectory = await mkdtemp(join(tmpdir(), `sho-metrics-${packageName}-`));

    try {
        const npmPackOutput = await runCommand(npmCommand.command, [
            ...npmCommand.argumentPrefix,
            "pack",
            `@resvg/${packageName}@${version}`,
            "--ignore-scripts",
            "--json",
            "--pack-destination",
            temporaryDirectory,
        ], { stdout: "pipe" });
        const packResultList = JSON.parse(npmPackOutput);
        const tarballFileName = packResultList[0]?.filename;
        if (typeof tarballFileName !== "string") {
            throw new Error(`npm pack did not return a tarball file for @resvg/${packageName}.`);
        }

        await mkdir(targetPackageDirectory, { recursive: true });
        await runCommand("tar", [
            "-xzf",
            join(temporaryDirectory, tarballFileName),
            "-C",
            targetPackageDirectory,
            "--strip-components",
            "1",
        ]);
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}

async function readPackageLock() {
    return JSON.parse(await readFile(packageLockPath, "utf8"));
}

async function assertRuntimeDependenciesComplete(options) {
    await assertResvgRuntimeDependenciesComplete();
    await assertStagedNodeHidNativeAddons({
        stagingPluginDirectory,
        nativeAddonTarget: options.nativeAddonTarget,
    });
}

async function assertResvgRuntimeDependenciesComplete() {
    const targetScopeDirectory = join(stagingPluginDirectory, "bin", "node_modules", "@resvg");

    for (const packageName of supportedNativeRuntimeDependencyPackageNames) {
        const packageDirectoryPath = join(targetScopeDirectory, packageName);
        if (!await pathExists(packageDirectoryPath)) {
            throw new Error(`Missing staged @resvg native runtime package: ${packageName}.`);
        }

        if (!await directoryContainsNodeNativeModule(packageDirectoryPath)) {
            throw new Error(`Staged @resvg native runtime package has no .node binary: ${packageName}.`);
        }
    }
}

async function directoryContainsNodeNativeModule(directoryPath) {
    for (const directoryEntry of await readdir(directoryPath, { withFileTypes: true })) {
        const entryPath = join(directoryPath, directoryEntry.name);
        if (directoryEntry.isDirectory() && await directoryContainsNodeNativeModule(entryPath)) {
            return true;
        }

        if (directoryEntry.isFile() && directoryEntry.name.endsWith(".node")) {
            return true;
        }
    }

    return false;
}

function assertHostRuntimeDependencyCanLoad() {
    if (hostNativeRuntimeDependencyPackageName === undefined) {
        return;
    }

    const hostPackageDirectory = join(
        stagingPluginDirectory,
        "bin",
        "node_modules",
        "@resvg",
        hostNativeRuntimeDependencyPackageName,
    );
    if (!existsSync(hostPackageDirectory)) {
        throw new Error(`Missing host @resvg native runtime package: ${hostNativeRuntimeDependencyPackageName}.`);
    }

    const stagingPluginRequire = createRequire(join(stagingPluginDirectory, "bin", "plugin.js"));
    const resvgNativeModule = stagingPluginRequire("@resvg/resvg-js");
    if (typeof resvgNativeModule.Resvg !== "function") {
        throw new Error("Staged @resvg/resvg-js did not expose a Resvg constructor.");
    }
}

function assertHostNodeHidRuntimeDependencyCanLoad(nativeAddonTarget) {
    if (nativeAddonTarget !== resolveHostNodeHidNativeAddonTarget()) {
        return;
    }

    const stagingPluginRequire = createRequire(join(stagingPluginDirectory, "bin", "plugin.js"));
    const nativeHidModule = stagingPluginRequire(NODE_HID_PACKAGE_NAME);
    if (typeof nativeHidModule.HID !== "function" || typeof nativeHidModule.devices !== "function") {
        throw new Error(`Staged ${NODE_HID_PACKAGE_NAME} did not expose the expected module surface.`);
    }
}

function resolveHostNativeRuntimeDependencyPackageName() {
    if (process.platform === "win32" && process.arch === "x64") {
        return "resvg-js-win32-x64-msvc";
    }

    if (process.platform === "win32" && process.arch === "arm64") {
        return "resvg-js-win32-arm64-msvc";
    }

    if (process.platform === "darwin" && process.arch === "x64") {
        return "resvg-js-darwin-x64";
    }

    if (process.platform === "darwin" && process.arch === "arm64") {
        return "resvg-js-darwin-arm64";
    }

    return undefined;
}

function parsePackOptions(argumentList) {
    const streamDeckPackArgumentList = [];
    let nativeAddonTarget = resolveHostNodeHidNativeAddonTarget();

    for (let argumentIndex = 0; argumentIndex < argumentList.length; argumentIndex += 1) {
        const argument = argumentList[argumentIndex];
        if (argument === "--native-addon-target") {
            const value = argumentList[argumentIndex + 1];
            if (typeof value !== "string" || value.startsWith("--")) {
                throw new Error("--native-addon-target requires a target value.");
            }

            nativeAddonTarget = resolveSupportedNodeHidNativeAddonTarget(value);
            argumentIndex += 1;
            continue;
        }

        const nativeAddonTargetPrefix = "--native-addon-target=";
        if (argument.startsWith(nativeAddonTargetPrefix)) {
            nativeAddonTarget = resolveSupportedNodeHidNativeAddonTarget(argument.slice(nativeAddonTargetPrefix.length));
            continue;
        }

        streamDeckPackArgumentList.push(argument);
    }

    return {
        nativeAddonTarget,
        streamDeckPackArgumentList,
    };
}

function readLockedPackageVersion(packageLock, packageName) {
    const packageEntry = packageLock.packages?.[`node_modules/@resvg/${packageName}`];
    if (typeof packageEntry?.version !== "string") {
        throw new Error(`package-lock.json does not contain @resvg/${packageName}.`);
    }

    return packageEntry.version;
}

async function pathExists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

function createNpmCommand() {
    if (process.env.npm_execpath) {
        return {
            command: process.execPath,
            argumentPrefix: [process.env.npm_execpath],
        };
    }

    return {
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        argumentPrefix: [],
    };
}

function shouldStagePluginPath(sourcePath) {
    const relativeSourcePath = relative(pluginDirectory, sourcePath).replaceAll("\\", "/");
    if (relativeSourcePath === "") {
        return true;
    }

    if (relativeSourcePath === "logs" || relativeSourcePath.startsWith("logs/")) {
        return false;
    }

    return true;
}

async function runStreamDeckPack(extraArgumentList) {
    const argumentList = [
        "pack",
        stagingPluginDirectory,
        "--force",
        "--no-update-check",
        "--output",
        packageOutputDirectory,
        ...extraArgumentList,
    ];

    await runCommand(process.execPath, [streamdeckCliPath, ...argumentList]);
}

async function runCommand(command, argumentList, options = {}) {
    const stdoutMode = options.stdout ?? "inherit";

    return await new Promise((resolve, reject) => {
        let stdout = "";
        const childProcess = spawn(command, argumentList, {
            cwd: packageDirectory,
            stdio: ["inherit", stdoutMode, "inherit"],
        });
        if (childProcess.stdout) {
            childProcess.stdout.on("data", chunk => {
                stdout += chunk.toString();
            });
        }

        childProcess.on("error", reject);
        childProcess.on("exit", exitCode => {
            if (exitCode === 0) {
                resolve(stdout);
                return;
            }

            reject(new Error(`${command} failed with exit code ${String(exitCode)}.`));
        });
    });
}
