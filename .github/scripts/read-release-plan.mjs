import { existsSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootPath = path.resolve(scriptDirectoryPath, "../..");
const releasePlanPath = path.join(repositoryRootPath, ".github/release-plan.yml");
const changelogPath = path.join(repositoryRootPath, "CHANGELOG.md");

const argumentMap = readArgumentMap(process.argv.slice(2));
const releasePlan = readReleasePlan();

if (argumentMap.has("check")) {
    assertUniqueTags(releasePlan);
    for (const release of releasePlan) {
        assertReleaseChangelog(release.tag);
    }

    console.log(`Release plan checks passed for ${releasePlan.length} planned release(s).`);
    process.exit(0);
}

const tag = argumentMap.get("tag");
if (!tag) {
    throw new Error("Missing required --tag argument.");
}

const release = releasePlan.find((candidate) => candidate.tag === tag);
if (!release) {
    throw new Error(`Release plan does not contain tag: ${tag}`);
}

assertReleaseChangelog(release.tag);

const githubOutputPath = argumentMap.get("github-output");
if (githubOutputPath) {
    appendFileSync(
        githubOutputPath,
        [
            `streamdeck_plugin_version=${release.streamdeckPluginVersion ?? ""}`,
            `tag_name=${release.tag}`,
            `windows_version=${release.windowsVersion ?? ""}`,
            "",
        ].join("\n"),
        "utf8",
    );
} else {
    console.log(JSON.stringify(release, null, 2));
}

function readArgumentMap(argumentList) {
    const result = new Map();

    for (let index = 0; index < argumentList.length; index += 1) {
        const argument = argumentList[index];
        if (!argument.startsWith("--")) {
            throw new Error(`Unexpected positional argument: ${argument}`);
        }

        const name = argument.slice(2);
        const nextArgument = argumentList[index + 1];
        if (!nextArgument || nextArgument.startsWith("--")) {
            result.set(name, "true");
            continue;
        }

        result.set(name, nextArgument);
        index += 1;
    }

    return result;
}

function readReleasePlan() {
    const releasePlanText = readTextFile(releasePlanPath);
    const releases = [];
    let sawRoot = false;
    let currentRelease = undefined;

    for (const rawLine of releasePlanText.split(/\r?\n/u)) {
        const line = stripYamlComment(rawLine).trimEnd();
        if (line.trim() === "") {
            continue;
        }

        if (line === "releases: []") {
            sawRoot = true;
            continue;
        }

        if (line === "releases:") {
            sawRoot = true;
            continue;
        }

        if (!sawRoot) {
            throw new Error("Release plan must start with `releases:`.");
        }

        const releaseStart = line.match(/^  - tag: (.+)$/u);
        if (releaseStart) {
            currentRelease = { tag: parseScalar(releaseStart[1]) };
            releases.push(currentRelease);
            continue;
        }

        const propertyMatch = line.match(/^    ([A-Za-z]+): (.+)$/u);
        if (!propertyMatch || !currentRelease) {
            throw new Error(`Unsupported release-plan line: ${rawLine}`);
        }

        const [, propertyName, propertyValue] = propertyMatch;
        switch (propertyName) {
            case "streamdeckVersion":
                throw new Error("Use streamdeckPluginVersion instead of streamdeckVersion.");
            case "streamdeckPluginVersion":
                currentRelease.streamdeckPluginVersion = parseScalar(propertyValue);
                break;
            case "windowsVersion":
                currentRelease.windowsVersion = parseScalar(propertyValue);
                break;
            default:
                throw new Error(`Unsupported release-plan property: ${propertyName}`);
        }
    }

    for (const release of releases) {
        validateRelease(release);
    }

    return releases;
}

function stripYamlComment(line) {
    const commentIndex = line.indexOf("#");
    return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function parseScalar(rawValue) {
    const value = rawValue.trim();
    if (value.startsWith("\"") && value.endsWith("\"")) {
        return value.slice(1, -1);
    }

    if (value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1);
    }

    return value;
}

function validateRelease(release) {
    if (!/^[A-Za-z0-9._/-]+$/u.test(release.tag)) {
        throw new Error(`Release tag may only contain letters, numbers, dot, underscore, slash, and hyphen: ${release.tag}`);
    }

    if (!release.streamdeckPluginVersion && !release.windowsVersion) {
        throw new Error(`Release ${release.tag} must include streamdeckPluginVersion or windowsVersion.`);
    }

    if (release.streamdeckPluginVersion && !/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/u.test(release.streamdeckPluginVersion)) {
        throw new Error(`Release ${release.tag} has invalid streamdeckPluginVersion: ${release.streamdeckPluginVersion}`);
    }

    if (release.windowsVersion && !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(release.windowsVersion)) {
        throw new Error(`Release ${release.tag} has invalid windowsVersion: ${release.windowsVersion}`);
    }
}

function assertUniqueTags(releasePlan) {
    const tags = new Set();
    for (const release of releasePlan) {
        if (tags.has(release.tag)) {
            throw new Error(`Release plan contains duplicate tag: ${release.tag}`);
        }

        tags.add(release.tag);
    }
}

function assertReleaseChangelog(tag) {
    const changelogText = readTextFile(changelogPath);
    const releaseNotes = extractChangelogSection(changelogText, tag);
    if (!/\S/u.test(releaseNotes)) {
        throw new Error(`CHANGELOG.md must contain non-empty release notes under heading: ## ${tag}`);
    }
}

function extractChangelogSection(changelogText, tag) {
    const lines = changelogText.split(/\r?\n/u);
    const heading = `## ${tag}`;
    const startIndex = lines.findIndex((line) => line === heading);
    if (startIndex === -1) {
        return "";
    }

    const result = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.startsWith("## ")) {
            break;
        }

        result.push(line);
    }

    return result.join("\n");
}

function readTextFile(filePath) {
    if (!existsSync(filePath)) {
        throw new Error(`File does not exist: ${path.relative(repositoryRootPath, filePath)}`);
    }

    return readFileSync(filePath, "utf8");
}
