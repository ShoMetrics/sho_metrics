import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Source of truth: the Stream Deck plugin manifest's Nodejs.Version is the Node
// major the Stream Deck host downloads and runs the plugin on. The plugin must
// be built, tested, and packed with that same major, so every setup-node
// `node-version` across the CI workflows and the current runtime guidance must
// agree with it. If they drift, the artifact or support instructions can name
// one Node major while the manifest ships another.

const scriptDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootPath = path.resolve(scriptDirectoryPath, "../..");
const manifestRelativePath = "packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json";
const workflowsRelativeDirectory = ".github/workflows";
const runtimeDocumentationReferenceList = [
    {
        description: "Brand asset Node requirement",
        relativePath: "packages/assets/brand/README.md",
        majorPattern: /Use Node (\d+)\./gu,
    },
    {
        description: "Plugin runtime FAQ folder guidance",
        relativePath: "site/content/faq/plugin-engine-not-responding.md",
        majorPattern: /(?:Look for a|ShoMetrics needs a|If there is no) `(\d+)\.x\.y`/gu,
    },
    {
        description: "Plugin runtime FAQ executable examples",
        relativePath: "site/content/faq/plugin-engine-not-responding.md",
        majorPattern: /NodeJS(?:\\|\/)(\d+)\.\d+\.\d+(?:\\|\/)node(?:\.exe)?/gu,
    },
];

const manifest = JSON.parse(readFileSync(path.join(repositoryRootPath, manifestRelativePath), "utf8"));
const manifestNodeMajor = String(manifest?.Nodejs?.Version ?? "");
if (!/^\d+$/u.test(manifestNodeMajor)) {
    throw new Error(
        `${manifestRelativePath} Nodejs.Version must be a bare major version, got: "${manifestNodeMajor}"`,
    );
}

const workflowsDirectoryPath = path.join(repositoryRootPath, workflowsRelativeDirectory);
const problems = [];
let checkedCount = 0;
let checkedDocumentationReferenceCount = 0;

for (const documentationReference of runtimeDocumentationReferenceList) {
    const documentationText = readFileSync(
        path.join(repositoryRootPath, documentationReference.relativePath),
        "utf8",
    );
    const matchList = [...documentationText.matchAll(documentationReference.majorPattern)];

    if (matchList.length === 0) {
        problems.push(
            `${documentationReference.relativePath}: ${documentationReference.description} `
            + "did not contain a Node major reference to check",
        );
        continue;
    }

    checkedDocumentationReferenceCount += matchList.length;
    for (const match of matchList) {
        if (match[1] === manifestNodeMajor) {
            continue;
        }

        const lineNumber = documentationText.slice(0, match.index).split(/\r?\n/u).length;
        problems.push(
            `${documentationReference.relativePath}:${lineNumber}: ${documentationReference.description} `
            + `Node major ${match[1]} does not match ${manifestRelativePath} Nodejs.Version ${manifestNodeMajor}`,
        );
    }
}

for (const fileName of readdirSync(workflowsDirectoryPath)) {
    if (!fileName.endsWith(".yml") && !fileName.endsWith(".yaml")) {
        continue;
    }

    const workflowText = readFileSync(path.join(workflowsDirectoryPath, fileName), "utf8");
    workflowText.split(/\r?\n/u).forEach((line, index) => {
        // Matches `node-version: 24`, `node-version: 24.x`, `node-version: "24.13.1"`.
        const match = /node-version:\s*["']?(\d+)(?:\.[0-9x.]+)?["']?/iu.exec(line);
        if (match === null) {
            return;
        }

        checkedCount += 1;
        if (match[1] !== manifestNodeMajor) {
            problems.push(
                `${workflowsRelativeDirectory}/${fileName}:${index + 1}: node-version major ${match[1]} `
                + `does not match ${manifestRelativePath} Nodejs.Version ${manifestNodeMajor}`,
            );
        }
    });
}

if (checkedCount === 0) {
    throw new Error(
        "No node-version entries were found in .github/workflows; the drift check would be a silent no-op.",
    );
}

if (problems.length > 0) {
    console.error(
        "Node runtime version drift from the plugin manifest "
        + `(source of truth: ${manifestRelativePath} Nodejs.Version = ${manifestNodeMajor}):`,
    );
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    process.exit(1);
}

console.log(
    `Node runtime version check passed: manifest Nodejs.Version ${manifestNodeMajor} matches all `
    + `${checkedCount} workflow node-version entries and ${checkedDocumentationReferenceCount} `
    + "runtime documentation references.",
);
