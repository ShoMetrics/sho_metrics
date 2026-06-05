import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
    scripts: Readonly<Record<string, string>>;
}

const scriptDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootPath = path.resolve(scriptDirectoryPath, "../..");
const playbookRelativePath = "docs/development/command-playbook.md";
const playbookText = readRepositoryText(playbookRelativePath);
const failures: string[] = [];

function readRepositoryText(repositoryRelativePath: string): string {
    return readFileSync(path.join(repositoryRootPath, repositoryRelativePath), "utf8");
}

function readPackageJson(repositoryRelativePath: string): PackageJson {
    const rawPackageJson: unknown = JSON.parse(readRepositoryText(repositoryRelativePath));
    if (!isPackageJson(rawPackageJson)) {
        throw new Error(`Package JSON does not contain a valid scripts object: ${repositoryRelativePath}`);
    }

    return rawPackageJson;
}

function isPackageJson(value: unknown): value is PackageJson {
    if (!isRecord(value)) {
        return false;
    }

    const scripts = value.scripts;
    if (!isRecord(scripts)) {
        return false;
    }

    return Object.values(scripts).every((scriptValue) => typeof scriptValue === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertTextIncludes(name: string, text: string, expectedText: string): void {
    if (!text.includes(expectedText)) {
        failures.push(name);
    }
}

function assertReferencedFile(name: string, repositoryRelativePath: string): void {
    const fullPath = path.join(repositoryRootPath, repositoryRelativePath);
    if (!existsSync(fullPath)) {
        failures.push(`${name} path exists`);
        return;
    }

    assertTextIncludes(`${name} is referenced by playbook`, playbookText, repositoryRelativePath);
}

function assertInstallCommand(
    name: string,
    packageLockRelativePath: string,
    installCommand: string,
): void {
    const fullPath = path.join(repositoryRootPath, packageLockRelativePath);
    if (!existsSync(fullPath)) {
        failures.push(`${name} lockfile exists`);
        return;
    }

    assertTextIncludes(`${name} install command is referenced by playbook`, playbookText, installCommand);
}

function assertPackageScript(
    name: string,
    packageScripts: Readonly<Record<string, string>>,
    scriptName: string,
): void {
    if (!(scriptName in packageScripts)) {
        failures.push(`${name} script exists`);
        return;
    }

    assertTextIncludes(`${name} command is referenced by playbook`, playbookText, `npm.cmd run ${scriptName}`);
}

function assertScriptExists(
    name: string,
    packageScripts: Readonly<Record<string, string>>,
    scriptName: string,
): void {
    if (!(scriptName in packageScripts)) {
        failures.push(`${name} script exists`);
    }
}

// This is a command playbook check, not a release smoke. It keeps the playbook
// aligned with stable command entry points and package script names without
// re-running them.
const hubPackageJson = readPackageJson("packages/hub/package.json");
const brandPackageJson = readPackageJson("packages/assets/brand/package.json");
const repositoryScriptsPackageJson = readPackageJson(".github/scripts/package.json");

assertReferencedFile("Command playbook lint script", ".github/scripts/test-command-playbook.ts");
assertReferencedFile("Windows installer build script", "packages/installer/windows/Build-WindowsInstaller.ps1");
assertReferencedFile(
    "Windows installer invariant script",
    "packages/installer/windows/scripts/Test-WindowsInstallerInvariants.ps1",
);
assertReferencedFile("Brand asset script", "packages/assets/brand/sync-brand-assets.ts");
assertReferencedFile("Source Windows lint script", "packages/source-windows/scripts/Test-SourceWindowsLint.ps1");
assertReferencedFile("Site preview smoke script", ".github/scripts/Test-SitePreview.ps1");
assertReferencedFile("Manual release checklist", "docs/release/manual-verification-checklist.md");

assertScriptExists(
    "Command playbook lint implementation",
    repositoryScriptsPackageJson.scripts,
    "check-command-playbook",
);
assertTextIncludes(
    "Command playbook lint command is referenced by playbook",
    playbookText,
    "npm.cmd --prefix .github/scripts run check-command-playbook",
);
assertInstallCommand(
    "Brand tooling",
    "packages/assets/brand/package-lock.json",
    "npm.cmd ci --prefix packages/assets/brand",
);
assertInstallCommand(
    "Hub",
    "packages/hub/package-lock.json",
    "npm.cmd ci --prefix packages/hub",
);

assertPackageScript("Hub build", hubPackageJson.scripts, "build");
assertPackageScript("Hub unit tests", hubPackageJson.scripts, "test:unit");
assertPackageScript("Hub Property Inspector tests", hubPackageJson.scripts, "test:pi");
assertPackageScript("Hub lint", hubPackageJson.scripts, "lint");
assertPackageScript("Hub watch", hubPackageJson.scripts, "watch");
assertPackageScript("Proto format", hubPackageJson.scripts, "proto:format");
assertPackageScript("Proto lint", hubPackageJson.scripts, "proto:lint");
assertPackageScript("Proto build", hubPackageJson.scripts, "proto:build");
assertPackageScript("Proto generation", hubPackageJson.scripts, "generate:proto");
assertPackageScript("Hub brand sync facade", hubPackageJson.scripts, "brand:sync");
assertPackageScript("Hub brand verify facade", hubPackageJson.scripts, "brand:verify");
assertScriptExists("Brand sync implementation", brandPackageJson.scripts, "sync");
assertScriptExists("Brand verify implementation", brandPackageJson.scripts, "verify");

if (failures.length > 0) {
    throw new Error(`Command playbook check failed:\n- ${failures.join("\n- ")}`);
}

process.stdout.write("Command playbook checks passed.\n");
