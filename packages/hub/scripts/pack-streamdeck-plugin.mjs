import { access, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLUGIN_DIRECTORY_NAME = "com.ez.sho-metrics.sdPlugin";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const packageDirectory = join(scriptDirectory, "..");
const repositoryDirectory = join(packageDirectory, "..", "..");
const pluginDirectory = join(packageDirectory, PLUGIN_DIRECTORY_NAME);
const outputDirectory = join(repositoryDirectory, "artifacts", "hub", "streamdeck-plugin");
const stagingRootDirectory = join(outputDirectory, "staging");
const stagingPluginDirectory = join(stagingRootDirectory, PLUGIN_DIRECTORY_NAME);
const packageOutputDirectory = join(outputDirectory, "package");
const legacyPackagePath = join(outputDirectory, "com.ez.sho-metrics.streamDeckPlugin");
const streamdeckCliPath = join(packageDirectory, "node_modules", "@elgato", "cli", "bin", "streamdeck.mjs");
const packageLockPath = join(packageDirectory, "package-lock.json");
const npmCommand = createNpmCommand();
const runtimeDependencyPackageNames = [
    "resvg-js",
    "resvg-js-win32-x64-msvc",
    "resvg-js-win32-arm64-msvc",
    "resvg-js-darwin-x64",
    "resvg-js-darwin-arm64",
];

await packStreamDeckPlugin(process.argv.slice(2));

async function packStreamDeckPlugin(argumentList) {
    await rm(stagingRootDirectory, { recursive: true, force: true });
    await rm(packageOutputDirectory, { recursive: true, force: true });
    await rm(legacyPackagePath, { force: true });
    await mkdir(stagingRootDirectory, { recursive: true });
    await mkdir(packageOutputDirectory, { recursive: true });

    await cp(pluginDirectory, stagingPluginDirectory, {
        recursive: true,
        filter: sourcePath => shouldStagePluginPath(sourcePath),
    });
    await stageRuntimeDependencies();

    await runStreamDeckPack(argumentList);
}

async function stageRuntimeDependencies() {
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
