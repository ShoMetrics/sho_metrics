import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const isWindows = process.platform === "win32";
const bufExecutable = join(
    packageRoot,
    "node_modules",
    ".bin",
    isWindows ? "buf.cmd" : "buf",
);

const env = { ...process.env };
const pathEnvironmentKey = resolvePathEnvironmentKey(env);

if (isWindows && !pathHasExecutable("diff.exe", env[pathEnvironmentKey] ?? "")) {
    const gitDiffDirectory = findFirstExistingDirectory([
        join(env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin"),
        join(env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Git", "usr", "bin"),
        join(env.LOCALAPPDATA ?? "", "Programs", "Git", "usr", "bin"),
        join(env.USERPROFILE ?? "", "scoop", "apps", "git", "current", "usr", "bin"),
        "C:\\ProgramData\\chocolatey\\bin",
        join(env.USERPROFILE ?? "", "scoop", "shims"),
    ]);

    if (gitDiffDirectory) {
        env[pathEnvironmentKey] = [gitDiffDirectory, env[pathEnvironmentKey]].filter(Boolean).join(delimiter);
    }
}

const args = process.argv.slice(2);

if (isWindows && !args.includes("--disable-symlinks")) {
    args.push("--disable-symlinks");
}

const result = spawnSync(isWindows ? quoteWindowsCommandPath(bufExecutable) : bufExecutable, args, {
    env,
    shell: isWindows,
    stdio: "inherit",
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);

function pathHasExecutable(executableName, pathValue) {
    return pathValue
        .split(delimiter)
        .some((directory) => existsSync(join(directory, executableName)));
}

function resolvePathEnvironmentKey(env) {
    return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function quoteWindowsCommandPath(commandPath) {
    return `"${commandPath}"`;
}

function findFirstExistingDirectory(directories) {
    return directories.find((directory) => directory && existsSync(directory));
}
