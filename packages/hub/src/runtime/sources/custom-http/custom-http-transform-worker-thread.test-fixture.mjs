import { raw as runJqRaw } from "jq-wasm";
import * as workerpool from "workerpool";

// Vitest runs source files directly, so there is no precompiled worker entry
// entry for workerpool to launch. This fixture mirrors the production worker's
// public workerpool method so pool lifecycle tests can stay source-based.
async function runCustomHttpTransform(inputJson, jqTransform, outputLimitBytes, outputMode = "singleJsonValue") {
    try {
        const result = await runJqRaw(normalizeJqInput(inputJson), jqTransform, ["-c"]);
        if (result.exitCode !== 0 || result.stderr.trim().length > 0) {
            return {
                ok: false,
                reason: "jqFailure",
                detail: limitDetail(result.stderr || "jq transform failed."),
            };
        }

        if (Buffer.byteLength(result.stdout, "utf8") > outputLimitBytes) {
            return {
                ok: false,
                reason: "outputTooLarge",
                detail: "Transform output exceeded byte limit.",
            };
        }

        if (outputMode === "rawStdout") {
            return {
                ok: true,
                output: result.stdout,
            };
        }

        const lines = result.stdout
            .split(/\r?\n/u)
            .map(line => line.trim())
            .filter(line => line.length > 0);
        if (lines.length !== 1) {
            return {
                ok: false,
                reason: "malformedOutput",
                detail: "jq transform must emit exactly one JSON value.",
            };
        }

        return {
            ok: true,
            output: JSON.parse(lines[0]),
        };
    } catch (error) {
        return {
            ok: false,
            reason: "jqFailure",
            detail: limitDetail(error instanceof Error ? error.message : String(error)),
        };
    }
}

function normalizeJqInput(inputJson) {
    return typeof inputJson === "object" && inputJson !== null
        ? inputJson
        : JSON.stringify(inputJson);
}

function limitDetail(detail) {
    return detail.length > 300 ? `${detail.slice(0, 300)}...` : detail;
}

workerpool.worker({
    runCustomHttpTransform,
});
