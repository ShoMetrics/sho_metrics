import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_JQ_WASM_VERSION = "1.1.0-jq-1.8.1";
const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const packageDirectory = join(scriptDirectory, "..");
const jqWasmPackagePath = join(packageDirectory, "node_modules", "jq-wasm", "package.json");
const jqWasmRuntimePath = join(packageDirectory, "node_modules", "jq-wasm", "dist", "build", "jq.js");

const replacements = [
    {
        label: "stdin offset state",
        oldText: "let stdinBuffer = new Uint8Array(0);\n        let stdoutBuffer = [];",
        newText: "let stdinBuffer = new Uint8Array(0);\n        let stdinBufferOffset = 0;\n        let stdoutBuffer = [];",
    },
    {
        label: "stdin offset reset",
        oldText: "function runJq(jsonString, query, flags) { stdinBuffer = toByteArray(jsonString); if (!flags.includes(\"-M\")) {",
        newText: "function runJq(jsonString, query, flags) { stdinBuffer = toByteArray(jsonString); stdinBufferOffset = 0; if (!flags.includes(\"-M\")) {",
    },
    {
        label: "stdin byte reader",
        oldText: "if (stdinBuffer.length === 0)\n                return null; const byte = stdinBuffer[0]; stdinBuffer = stdinBuffer.slice(1); return byte !== null && byte !== void 0 ? byte : null;",
        newText: "if (stdinBufferOffset >= stdinBuffer.length)\n                return null; const byte = stdinBuffer[stdinBufferOffset++]; return byte !== null && byte !== void 0 ? byte : null;",
    },
];

await patchJqWasmStdin();

async function patchJqWasmStdin() {
    const packageText = await readRequiredFile(jqWasmPackagePath, "jq-wasm package metadata");
    const packageJson = JSON.parse(packageText);
    if (packageJson.version !== EXPECTED_JQ_WASM_VERSION) {
        fail(`Expected jq-wasm ${EXPECTED_JQ_WASM_VERSION}, found ${String(packageJson.version)}.`);
    }

    const runtimeText = await readRequiredFile(jqWasmRuntimePath, "jq-wasm bundled runtime");
    if (hasAll(runtimeText, "newText") && hasNone(runtimeText, "oldText")) {
        process.stdout.write("jq-wasm stdin patch already applied.\n");
        return;
    }

    if (!hasAll(runtimeText, "oldText") || hasAny(runtimeText, "newText")) {
        const details = replacements
            .map(replacement => `${replacement.label}: old=${runtimeText.includes(replacement.oldText)} new=${runtimeText.includes(replacement.newText)}`)
            .join("; ");
        fail(`jq-wasm runtime did not match the expected unpatched shape. ${details}`);
    }

    let patchedRuntimeText = runtimeText;
    for (const replacement of replacements) {
        patchedRuntimeText = patchedRuntimeText.replace(replacement.oldText, replacement.newText);
    }

    if (!hasAll(patchedRuntimeText, "newText") || hasAny(patchedRuntimeText, "oldText")) {
        fail("jq-wasm stdin patch verification failed after replacement.");
    }

    await writeFile(jqWasmRuntimePath, patchedRuntimeText);
    process.stdout.write("Applied jq-wasm stdin offset patch.\n");
}

async function readRequiredFile(filePath, description) {
    try {
        return await readFile(filePath, "utf8");
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        fail(`Could not read ${description}. Run npm install in packages/hub first. ${detail}`);
    }
}

function hasAll(runtimeText, propertyName) {
    return replacements.every(replacement => runtimeText.includes(replacement[propertyName]));
}

function hasAny(runtimeText, propertyName) {
    return replacements.some(replacement => runtimeText.includes(replacement[propertyName]));
}

function hasNone(runtimeText, propertyName) {
    return !hasAny(runtimeText, propertyName);
}

function fail(message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}
