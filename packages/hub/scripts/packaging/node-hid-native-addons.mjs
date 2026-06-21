import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const NODE_HID_PACKAGE_NAME = "node-hid";
export const NODE_HID_PACKAGE_VERSION = "3.3.0";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const packageDirectory = join(scriptDirectory, "..", "..");
const packageJsonPath = join(packageDirectory, "package.json");
const packageLockPath = join(packageDirectory, "package-lock.json");

const nodeHidRuntimeFileList = [
    "binding-options.js",
    "LICENSE-bsd.txt",
    "nodehid.js",
    "package.json",
    "README.md",
];

const pkgPrebuildsRuntimeFileList = [
    "bindings.js",
    "LICENSE",
    "package.json",
    "README.md",
    "lib/prebuild.js",
];

export const nodeHidNativeAddonSha256ByRelativePath = {
    "prebuilds/HID-darwin-arm64/node-napi-v4.node": "BA4EEE95E5B6226F19758ADDC1F03113D47698A5B0104804E94E66420F05496C",
    "prebuilds/HID-darwin-x64/node-napi-v4.node": "064AE57826FC518797664867FEE70AF583E6FC190199E802A68CBDB74F1CC464",
    "prebuilds/HID-win32-arm64/node-napi-v4.node": "F828702F8079540D7EE9E576CA1D7461424302E2064B425A3118CBBE3A9D2C7E",
    "prebuilds/HID-win32-x64/node-napi-v4.node": "C1781ADCE3FBF61A4D7ADDD8AEA052A6CC162DA6BBC48E476086A9E2B4EA43F8",
};

export const nodeHidNativeAddonRelativePathByTarget = {
    "darwin-arm64": "prebuilds/HID-darwin-arm64/node-napi-v4.node",
    "darwin-x64": "prebuilds/HID-darwin-x64/node-napi-v4.node",
    "win32-arm64": "prebuilds/HID-win32-arm64/node-napi-v4.node",
    "win32-x64": "prebuilds/HID-win32-x64/node-napi-v4.node",
};

export async function assertNodeHidDependencyPinned(options = {}) {
    const packageJson = await readJson(options.packageJsonPath ?? packageJsonPath);
    const packageLock = await readJson(options.packageLockPath ?? packageLockPath);

    const packageJsonVersion = packageJson.dependencies?.[NODE_HID_PACKAGE_NAME];
    if (packageJsonVersion !== NODE_HID_PACKAGE_VERSION) {
        throw new Error(`${NODE_HID_PACKAGE_NAME} must be pinned to ${NODE_HID_PACKAGE_VERSION} in package.json.`);
    }

    const lockfileVersion = packageLock.packages?.[`node_modules/${NODE_HID_PACKAGE_NAME}`]?.version;
    if (lockfileVersion !== NODE_HID_PACKAGE_VERSION) {
        throw new Error(`${NODE_HID_PACKAGE_NAME} must be pinned to ${NODE_HID_PACKAGE_VERSION} in package-lock.json.`);
    }
}

export async function stageNodeHidRuntimeDependency(options) {
    const nativeAddonRelativePath = resolveNodeHidNativeAddonRelativePath(
        options.nativeAddonTarget ?? resolveHostNodeHidNativeAddonTarget(),
    );
    const sourceNodeModulesDirectory = join(options.packageDirectory, "node_modules");
    const targetNodeModulesDirectory = join(options.stagingPluginDirectory, "bin", "node_modules");

    await copyPackageFileList({
        sourcePackageDirectory: join(sourceNodeModulesDirectory, NODE_HID_PACKAGE_NAME),
        targetPackageDirectory: join(targetNodeModulesDirectory, NODE_HID_PACKAGE_NAME),
        relativeFileList: [
            ...nodeHidRuntimeFileList,
            nativeAddonRelativePath,
        ],
    });

    await copyPackageFileList({
        sourcePackageDirectory: join(sourceNodeModulesDirectory, "pkg-prebuilds"),
        targetPackageDirectory: join(targetNodeModulesDirectory, "pkg-prebuilds"),
        relativeFileList: pkgPrebuildsRuntimeFileList,
    });
}

export async function assertStagedNodeHidNativeAddons(options) {
    const expectedNativeAddonRelativePath = resolveNodeHidNativeAddonRelativePath(
        options.nativeAddonTarget ?? resolveHostNodeHidNativeAddonTarget(),
    );
    const nodeHidPackageDirectory = join(
        options.stagingPluginDirectory,
        "bin",
        "node_modules",
        NODE_HID_PACKAGE_NAME,
    );
    const expectedPathSet = new Set([expectedNativeAddonRelativePath]);
    const actualPathList = await findNodeNativeModuleRelativePaths(nodeHidPackageDirectory);

    for (const expectedPath of expectedPathSet) {
        if (!actualPathList.includes(expectedPath)) {
            throw new Error(`Missing staged ${NODE_HID_PACKAGE_NAME} native addon: ${expectedPath}.`);
        }
    }

    for (const actualPath of actualPathList) {
        if (!expectedPathSet.has(actualPath)) {
            throw new Error(`Unexpected staged ${NODE_HID_PACKAGE_NAME} native addon: ${actualPath}.`);
        }

        const expectedHash = nodeHidNativeAddonSha256ByRelativePath[actualPath];
        const actualHash = await sha256File(join(nodeHidPackageDirectory, actualPath));
        if (actualHash !== expectedHash) {
            throw new Error(
                `Unexpected SHA-256 for staged ${NODE_HID_PACKAGE_NAME} native addon ${actualPath}: ${actualHash}.`,
            );
        }
    }
}

export function resolveHostNodeHidNativeAddonTarget() {
    return resolveSupportedNodeHidNativeAddonTarget(`${process.platform}-${process.arch}`);
}

export function resolveSupportedNodeHidNativeAddonTarget(nativeAddonTarget) {
    assertNodeHidNativeAddonTargetHashesComplete();

    if (Object.hasOwn(nodeHidNativeAddonRelativePathByTarget, nativeAddonTarget)) {
        return nativeAddonTarget;
    }

    throw new Error(
        `Unsupported ${NODE_HID_PACKAGE_NAME} native addon target: ${nativeAddonTarget}. ` +
        `Supported targets: ${Object.keys(nodeHidNativeAddonRelativePathByTarget).join(", ")}.`,
    );
}

function resolveNodeHidNativeAddonRelativePath(nativeAddonTarget) {
    const supportedNativeAddonTarget = resolveSupportedNodeHidNativeAddonTarget(nativeAddonTarget);
    return nodeHidNativeAddonRelativePathByTarget[supportedNativeAddonTarget];
}

function assertNodeHidNativeAddonTargetHashesComplete() {
    for (const [nativeAddonTarget, nativeAddonRelativePath] of Object.entries(nodeHidNativeAddonRelativePathByTarget)) {
        if (!Object.hasOwn(nodeHidNativeAddonSha256ByRelativePath, nativeAddonRelativePath)) {
            throw new Error(
                `${NODE_HID_PACKAGE_NAME} native addon target ${nativeAddonTarget} is missing ` +
                `a SHA-256 allowlist entry for ${nativeAddonRelativePath}.`,
            );
        }
    }
}

async function copyPackageFileList(options) {
    for (const relativeFilePath of options.relativeFileList) {
        const sourcePath = join(options.sourcePackageDirectory, relativeFilePath);
        const targetPath = join(options.targetPackageDirectory, relativeFilePath);
        await mkdir(dirname(targetPath), { recursive: true });
        await copyFile(sourcePath, targetPath);
    }
}

async function findNodeNativeModuleRelativePaths(rootDirectory) {
    const relativePathList = [];
    await collectNodeNativeModuleRelativePaths(rootDirectory, rootDirectory, relativePathList);
    return relativePathList.sort();
}

async function collectNodeNativeModuleRelativePaths(rootDirectory, currentDirectory, relativePathList) {
    for (const directoryEntry of await readdir(currentDirectory, { withFileTypes: true })) {
        const entryPath = join(currentDirectory, directoryEntry.name);
        if (directoryEntry.isDirectory()) {
            await collectNodeNativeModuleRelativePaths(rootDirectory, entryPath, relativePathList);
            continue;
        }

        if (directoryEntry.isFile() && directoryEntry.name.endsWith(".node")) {
            relativePathList.push(relative(rootDirectory, entryPath).replaceAll("\\", "/"));
        }
    }
}

async function sha256File(path) {
    return createHash("sha256")
        .update(await readFile(path))
        .digest("hex")
        .toUpperCase();
}

async function readJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
    const stagingPluginDirectory = process.argv[2];
    if (typeof stagingPluginDirectory !== "string" || stagingPluginDirectory.length === 0) {
        throw new Error("Usage: node scripts/packaging/node-hid-native-addons.mjs <staging-plugin-directory> [native-addon-target]");
    }

    const nativeAddonTarget = process.argv[3] ?? resolveHostNodeHidNativeAddonTarget();
    await access(stagingPluginDirectory);
    await assertNodeHidDependencyPinned();
    await assertStagedNodeHidNativeAddons({ stagingPluginDirectory, nativeAddonTarget });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
