#!/usr/bin/env node
// Historical Stage 1 POC tooling. This checker validates the original
// multi-output `metrics[]` experiment, not the final V1 runtime schema.
// Do not use it as the Custom HTTP production validator without first
// migrating it to the single top-level `metric` output contract.
import { readFile } from "node:fs/promises";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_INPUT_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024;
const METRIC_ID_POLICIES = new Set(["require", "assign"]);

if (isMainThread) {
    await runMain();
} else {
    await runWorker();
}

async function runMain() {
    let options;

    try {
        options = parseCommandLine(process.argv.slice(2));
    } catch (error) {
        writeResult({
            ok: false,
            engine: "unknown",
            stage: "arguments",
            message: toBoundedMessage(error),
        });
        process.exitCode = 2;
        return;
    }

    if (options.help) {
        printUsage();
        process.exitCode = 0;
        return;
    }

    if (!options.engine || !options.inputPath || !options.transformPath) {
        writeResult({
            ok: false,
            engine: options.engine ?? "unknown",
            stage: "arguments",
            message: "Missing --engine, --input, or --transform.",
        });
        process.exitCode = 2;
        return;
    }

    if (options.engine !== "jq-wasm" && options.engine !== "jsonata") {
        writeResult({
            ok: false,
            engine: options.engine,
            stage: "arguments",
            message: "Unsupported engine. Use jq-wasm or jsonata.",
        });
        process.exitCode = 2;
        return;
    }

    if (!METRIC_ID_POLICIES.has(options.metricIdPolicy)) {
        writeResult({
            ok: false,
            engine: options.engine,
            stage: "arguments",
            message: "Unsupported --metric-id-policy. Use require or assign.",
        });
        process.exitCode = 2;
        return;
    }

    let inputText;
    let transformText;
    let expectedText;

    try {
        inputText = await readUtf8Bounded(options.inputPath, options.inputLimitBytes, "input");
        transformText = await readUtf8Bounded(options.transformPath, 128 * 1024, "transform");
        expectedText = options.expectedPath
            ? await readUtf8Bounded(options.expectedPath, options.outputLimitBytes, "expected")
            : undefined;
    } catch (error) {
        writeResult({
            ok: false,
            engine: options.engine,
            stage: "read",
            message: toBoundedMessage(error),
        });
        process.exitCode = 1;
        return;
    }

    let inputJson;
    let expectedJson;

    try {
        inputJson = JSON.parse(inputText);
        expectedJson = expectedText ? JSON.parse(expectedText) : undefined;
    } catch (error) {
        writeResult({
            ok: false,
            engine: options.engine,
            stage: "parse",
            message: toBoundedMessage(error),
        });
        process.exitCode = 1;
        return;
    }

    const startedAt = performance.now();
    const workerResult = await runTransformWorker({
        engine: options.engine,
        inputJson,
        transformText,
        timeoutMs: options.timeoutMs,
    });

    if (!workerResult.ok) {
        writeResult(workerResult);
        process.exitCode = workerResult.stage === "timeout" ? 124 : 1;
        return;
    }

    const outputText = JSON.stringify(workerResult.output);
    const outputBytes = Buffer.byteLength(outputText, "utf8");
    if (outputBytes > options.outputLimitBytes) {
        writeResult({
            ok: false,
            engine: options.engine,
            stage: "output-size",
            message: `Transform output exceeded ${options.outputLimitBytes} bytes.`,
        });
        process.exitCode = 1;
        return;
    }

    const normalizedOutput = normalizeMetricCatalogOutput(workerResult.output, options.metricIdPolicy);
    if (!normalizedOutput.ok) {
        writeResult({
            ok: false,
            engine: options.engine,
            stage: "schema",
            message: normalizedOutput.message,
        });
        process.exitCode = 1;
        return;
    }

    if (expectedJson && stableStringify(normalizedOutput.output) !== stableStringify(expectedJson)) {
        writeResult({
            ok: false,
            engine: options.engine,
            stage: "expected",
            message: "Transform output did not match expected output.",
        });
        process.exitCode = 1;
        return;
    }

    writeResult({
        ok: true,
        engine: options.engine,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        metricCount: normalizedOutput.output.metrics.length,
        outputBytes,
    });
}

async function runWorker() {
    try {
        const result = await evaluateTransform(workerData.engine, workerData.inputJson, workerData.transformText);
        parentPort?.postMessage({ ok: true, engine: workerData.engine, output: result });
    } catch (error) {
        parentPort?.postMessage({
            ok: false,
            engine: workerData.engine,
            stage: "transform",
            message: toBoundedMessage(error),
        });
    }
}

async function evaluateTransform(engine, inputJson, transformText) {
    if (engine === "jq-wasm") {
        const jqModule = await import("jq-wasm");
        const jq = jqModule.default ?? jqModule;
        return await jq.json(inputJson, transformText, ["-c"]);
    }

    const jsonataModule = await import("jsonata");
    const jsonata = jsonataModule.default ?? jsonataModule;
    const expression = jsonata(transformText);
    return await expression.evaluate(inputJson);
}

function runTransformWorker(options) {
    return new Promise((resolve) => {
        let isSettled = false;
        const worker = new Worker(fileURLToPath(import.meta.url), {
            workerData: {
                engine: options.engine,
                inputJson: options.inputJson,
                transformText: options.transformText,
            },
        });

        function settle(result) {
            if (isSettled) {
                return;
            }

            isSettled = true;
            clearTimeout(timeout);
            resolve(result);
        }

        const timeout = setTimeout(() => {
            worker.terminate().catch(() => {
                // The timeout result is already the owner-visible failure.
            });
            settle({
                ok: false,
                engine: options.engine,
                stage: "timeout",
                message: `Transform exceeded ${options.timeoutMs} ms.`,
            });
        }, options.timeoutMs);

        worker.once("message", (message) => {
            settle(message);
        });

        worker.once("error", (error) => {
            settle({
                ok: false,
                engine: options.engine,
                stage: "worker",
                message: toBoundedMessage(error),
            });
        });

        worker.once("exit", (code) => {
            if (code !== 0) {
                settle({
                    ok: false,
                    engine: options.engine,
                    stage: "worker",
                    message: `Worker exited with code ${code}.`,
                });
            }
        });
    });
}

async function readUtf8Bounded(path, limitBytes, label) {
    const text = await readFile(path, "utf8");
    const byteLength = Buffer.byteLength(text, "utf8");
    if (byteLength > limitBytes) {
        throw new Error(`${label} exceeded ${limitBytes} bytes.`);
    }

    return text;
}

function normalizeMetricCatalogOutput(output, metricIdPolicy) {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
        return { ok: false, message: "Output must be an object." };
    }

    if (!Array.isArray(output.metrics)) {
        return { ok: false, message: "Output must contain a metrics array." };
    }

    if (output.metrics.length === 0) {
        return { ok: false, message: "metrics must contain at least one metric." };
    }

    const metricIds = new Set();
    const normalizedMetrics = [];

    for (const [index, metric] of output.metrics.entries()) {
        if (!metric || typeof metric !== "object" || Array.isArray(metric)) {
            return { ok: false, message: `metrics[${index}] must be an object.` };
        }

        let metricId;
        if (metricIdPolicy === "require") {
            if (!isNonEmptyString(metric.metricId)) {
                return { ok: false, message: `metrics[${index}].metricId must be a non-empty string.` };
            }

            metricId = metric.metricId;
        } else {
            if (metric.metricId !== undefined) {
                return {
                    ok: false,
                    message: `metrics[${index}].metricId must be omitted because the app assigns metric IDs.`,
                };
            }

            metricId = `generated.metric.${index + 1}`;
        }

        if (metricId === "stable.lowercase.id") {
            return { ok: false, message: `metrics[${index}].metricId must not copy the schema placeholder.` };
        }

        if (metricIds.has(metricId)) {
            return { ok: false, message: `metrics[${index}].metricId must be unique.` };
        }

        metricIds.add(metricId);

        if (!isNonEmptyString(metric.label)) {
            return { ok: false, message: `metrics[${index}].label must be a non-empty string.` };
        }

        if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
            return { ok: false, message: `metrics[${index}].value must be a finite number.` };
        }

        if (!isKnownUnit(metric.unit)) {
            return { ok: false, message: `metrics[${index}].unit is not a supported POC unit.` };
        }

        if (metric.unit === "custom") {
            if (!isNonEmptyString(metric.customUnit) || metric.customUnit.length > 12) {
                return {
                    ok: false,
                    message: `metrics[${index}].customUnit must be 1-12 characters when unit is custom.`,
                };
            }
        } else if (metric.customUnit !== undefined) {
            return { ok: false, message: `metrics[${index}].customUnit must be omitted unless unit is custom.` };
        }

        if (
            metric.maximum !== undefined
            && (typeof metric.maximum !== "number" || !Number.isFinite(metric.maximum) || metric.maximum <= 0)
        ) {
            return { ok: false, message: `metrics[${index}].maximum must be a positive finite number when present.` };
        }

        normalizedMetrics.push({
            metricId,
            label: metric.label,
            value: metric.value,
            unit: metric.unit,
            ...(metric.customUnit !== undefined ? { customUnit: metric.customUnit } : {}),
            ...(metric.maximum !== undefined ? { maximum: metric.maximum } : {}),
        });
    }

    return {
        ok: true,
        output: {
            metrics: normalizedMetrics,
        },
    };
}

function isKnownUnit(unit) {
    return typeof unit === "string" && new Set([
        "percent",
        "celsius",
        "fahrenheit",
        "watts",
        "bytes",
        "bytes_per_second",
        "milliseconds",
        "seconds",
        "hertz",
        "rpm",
        "unitless",
        "custom",
    ]).has(unit);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function parseCommandLine(args) {
    const options = {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        inputLimitBytes: DEFAULT_INPUT_LIMIT_BYTES,
        outputLimitBytes: DEFAULT_OUTPUT_LIMIT_BYTES,
        metricIdPolicy: "require",
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        switch (arg) {
            case "--engine":
                options.engine = readOptionValue(args, ++index, arg);
                break;
            case "--input":
                options.inputPath = readOptionValue(args, ++index, arg);
                break;
            case "--transform":
                options.transformPath = readOptionValue(args, ++index, arg);
                break;
            case "--expected":
                options.expectedPath = readOptionValue(args, ++index, arg);
                break;
            case "--timeout-ms":
                options.timeoutMs = readPositiveIntegerOption(args, ++index, arg);
                break;
            case "--input-limit-bytes":
                options.inputLimitBytes = readPositiveIntegerOption(args, ++index, arg);
                break;
            case "--output-limit-bytes":
                options.outputLimitBytes = readPositiveIntegerOption(args, ++index, arg);
                break;
            case "--metric-id-policy":
                options.metricIdPolicy = readOptionValue(args, ++index, arg);
                break;
            case "--help":
            case "-h":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function readOptionValue(args, index, optionName) {
    const value = args[index];
    if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${optionName}.`);
    }

    return value;
}

function readPositiveIntegerOption(args, index, optionName) {
    const value = Number.parseInt(readOptionValue(args, index, optionName), 10);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${optionName} must be a positive integer.`);
    }

    return value;
}

function writeResult(result) {
    process.stdout.write(`${JSON.stringify(result, undefined, 2)}\n`);
}

function toBoundedMessage(error) {
    const message = error instanceof Error
        ? error.message
        : typeof error === "object"
            ? JSON.stringify(error)
            : String(error);
    return message.length > 300 ? `${message.slice(0, 300)}...` : message;
}

function stableStringify(value) {
    return JSON.stringify(sortJson(value));
}

function sortJson(value) {
    if (Array.isArray(value)) {
        return value.map(sortJson);
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
            .map(([key, entryValue]) => [key, sortJson(entryValue)]),
    );
}

function printUsage() {
    process.stdout.write(`Usage:
node docs/development/runtime-sources/05-custom-metrics/archive/custom-metric-transform-check.mjs \\
  --engine jq-wasm|jsonata \\
  --input docs/development/runtime-sources/05-custom-metrics/poc-corpus/open-meteo/input.json \\
  --transform docs/development/runtime-sources/05-custom-metrics/poc-corpus/open-meteo/transform.jq \\
  --expected docs/development/runtime-sources/05-custom-metrics/poc-corpus/open-meteo/expected.metrics.json

Optional:
  --timeout-ms 1000
  --input-limit-bytes 1048576
  --output-limit-bytes 65536
  --metric-id-policy require|assign
`);
}
