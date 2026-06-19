#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const processSamplerScriptPath = path.join(scriptDirectory, "process-sampler.ps1");
const defaultOutputDirectory = "C:\\tmp";
const defaultProcessNames = [
    "node",
    "ShoMetricsHelperService",
    "ShoMetrics.Source.Windows.Service",
    "ShoMetrics.Source.Windows.Helper",
    "StreamDeck",
    "WmiPrvSE",
];

const options = readOptions(process.argv.slice(2));
const startedAt = new Date();
const outputBaseName = [
    startedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-"),
    options.label,
].filter(Boolean).join("_");
const samplePath = path.join(options.outputDirectory, `${outputBaseName}.process.ndjson`);
const heapSamplePath = options.gcInspectorEndpoint === null
    ? null
    : path.join(options.outputDirectory, `${outputBaseName}.heap.ndjson`);
const metadataPath = path.join(options.outputDirectory, `${outputBaseName}.metadata.json`);

await mkdir(options.outputDirectory, { recursive: true });
await writeFile(metadataPath, `${JSON.stringify({
    startedAt: startedAt.toISOString(),
    durationSeconds: options.durationSeconds,
    intervalMilliseconds: options.intervalMilliseconds,
    warmupSamples: options.warmupSamples,
    processNames: options.processNames,
    samplePath,
    heapSamplePath,
    gcInspectorEndpoint: options.gcInspectorEndpoint,
    gcIntervalMilliseconds: options.gcIntervalMilliseconds,
}, null, 2)}\n`, "utf8");
await writeFile(samplePath, "", "utf8");
if (heapSamplePath !== null) {
    await writeFile(heapSamplePath, "", "utf8");
}

process.stdout.write(`Writing ${samplePath}\n`);
if (heapSamplePath !== null) {
    process.stdout.write(`Writing ${heapSamplePath}\n`);
}
process.stdout.write(`Writing ${metadataPath}\n`);

await Promise.all([
    runSampler(options, samplePath),
    heapSamplePath === null ? Promise.resolve() : runGcSampler(options, heapSamplePath),
]);

function readOptions(args) {
    return {
        durationSeconds: readNumberOption(args, "duration-seconds", 300),
        intervalMilliseconds: readNumberOption(args, "interval-ms", 1000),
        warmupSamples: readNonNegativeNumberOption(args, "warmup-samples", 5),
        label: readStringOption(args, "label", "long-run-sidecar"),
        outputDirectory: path.resolve(readStringOption(args, "out", defaultOutputDirectory)),
        gcInspectorEndpoint: readGcInspectorEndpoint(args),
        gcIntervalMilliseconds: readNumberOption(args, "gc-interval-ms", 60000),
        processNames: readStringOption(args, "processes", defaultProcessNames.join(","))
            .split(",")
            .map(processName => processName.trim())
            .filter(processName => processName.length > 0),
    };
}

function readNumberOption(args, name, fallback) {
    const value = readStringOption(args, name, String(fallback));
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        throw new Error(`--${name} must be a positive number.`);
    }

    return parsedValue;
}

function readNonNegativeNumberOption(args, name, fallback) {
    const value = readStringOption(args, name, String(fallback));
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        throw new Error(`--${name} must be a non-negative number.`);
    }

    return parsedValue;
}

function readStringOption(args, name, fallback) {
    const prefix = `--${name}=`;
    const prefixedValue = args.find(argument => argument.startsWith(prefix));
    if (prefixedValue) {
        return prefixedValue.slice(prefix.length);
    }

    const optionIndex = args.indexOf(`--${name}`);
    if (optionIndex >= 0 && args[optionIndex + 1]) {
        return args[optionIndex + 1];
    }

    return fallback;
}

function readGcInspectorEndpoint(args) {
    const inspectorUrl = readStringOption(args, "gc-inspector-url", "");
    if (inspectorUrl.length > 0) {
        return inspectorUrl;
    }

    const inspectorPort = readStringOption(args, "gc-inspector-port", "");
    if (inspectorPort.length === 0) {
        return null;
    }

    const parsedPort = Number(inspectorPort);
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
        throw new Error("--gc-inspector-port must be a TCP port number.");
    }

    return `http://127.0.0.1:${parsedPort}`;
}

async function runSampler(options, samplePath) {
    const powershellScript = await buildProcessSamplerScript(options);

    await new Promise((resolve, reject) => {
        const powershellProcess = spawn(
            "powershell.exe",
            [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                powershellScript,
            ],
            {
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            },
        );
        let pendingOutput = "";
        let errorOutput = "";
        let writeChain = Promise.resolve();

        powershellProcess.stdout.setEncoding("utf8");
        powershellProcess.stderr.setEncoding("utf8");

        powershellProcess.stdout.on("data", chunk => {
            pendingOutput += chunk;
            const lines = pendingOutput.split(/\r?\n/);
            pendingOutput = lines.pop() ?? "";

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.length === 0) {
                    continue;
                }

                writeChain = writeChain.then(() => appendFile(samplePath, `${trimmedLine}\n`, "utf8"));
            }
        });
        powershellProcess.stderr.on("data", chunk => {
            errorOutput += chunk;
        });
        powershellProcess.on("error", reject);
        powershellProcess.on("close", exitCode => {
            if (pendingOutput.trim().length > 0) {
                writeChain = writeChain.then(() => appendFile(samplePath, `${pendingOutput.trim()}\n`, "utf8"));
            }

            writeChain
                .then(() => {
                    if (exitCode !== 0) {
                        reject(new Error(`PowerShell sampler exited with code ${exitCode}: ${errorOutput}`));
                        return;
                    }

                    resolve();
                })
                .catch(reject);
        });
    });
}

async function runGcSampler(options, heapSamplePath) {
    const startedAtMilliseconds = Date.now();
    const deadlineMilliseconds = startedAtMilliseconds + (options.durationSeconds * 1000);
    const inspectorWebSocketUrl = await resolveInspectorWebSocketUrl(options.gcInspectorEndpoint);

    while (Date.now() < deadlineMilliseconds) {
        const sampleStartedAtMilliseconds = Date.now();
        const sample = await collectGcHeapSample(inspectorWebSocketUrl)
            .catch(error => ({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            }));

        await appendFile(heapSamplePath, `${JSON.stringify({
            timestamp: new Date(sampleStartedAtMilliseconds).toISOString(),
            elapsedMilliseconds: sampleStartedAtMilliseconds - startedAtMilliseconds,
            ...sample,
        })}\n`, "utf8");

        const nextDelayMilliseconds = options.gcIntervalMilliseconds - (Date.now() - sampleStartedAtMilliseconds);
        if (nextDelayMilliseconds > 0) {
            await delay(nextDelayMilliseconds);
        }
    }
}

async function resolveInspectorWebSocketUrl(endpoint) {
    if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://")) {
        return endpoint;
    }

    const baseUrl = endpoint.replace(/\/$/, "");
    const discoveryDeadlineMilliseconds = Date.now() + 30000;
    let lastError = null;

    while (Date.now() < discoveryDeadlineMilliseconds) {
        try {
            const response = await fetch(`${baseUrl}/json/list`);
            if (!response.ok) {
                throw new Error(`Inspector discovery failed with HTTP ${response.status}.`);
            }

            const targets = await response.json();
            const target = Array.isArray(targets)
                ? targets.find(candidate => typeof candidate.webSocketDebuggerUrl === "string")
                : null;
            if (!target) {
                throw new Error("Inspector discovery returned no WebSocket target.");
            }

            return target.webSocketDebuggerUrl;
        } catch (error) {
            lastError = error;
            await delay(1000);
        }
    }

    throw new Error(`Inspector discovery timed out: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function collectGcHeapSample(inspectorWebSocketUrl) {
    const response = await evaluateInspectorExpression(inspectorWebSocketUrl, [
        "JSON.stringify((() => {",
        "  const pid = process.pid;",
        "  const memoryBefore = process.memoryUsage();",
        "  if (typeof globalThis.gc !== 'function') {",
        "    return { ok: false, error: 'global.gc unavailable', pid, memoryBefore, memoryAfter: process.memoryUsage() };",
        "  }",
        "  globalThis.gc();",
        "  return { ok: true, pid, memoryBefore, memoryAfter: process.memoryUsage() };",
        "})())",
    ].join("\n"));

    const value = response.result?.result?.value;
    if (typeof value !== "string") {
        throw new Error("Inspector Runtime.evaluate did not return a JSON string.");
    }

    return JSON.parse(value);
}

async function evaluateInspectorExpression(inspectorWebSocketUrl, expression) {
    const webSocket = new WebSocket(inspectorWebSocketUrl);
    const request = {
        id: 1,
        method: "Runtime.evaluate",
        params: {
            expression,
            returnByValue: true,
            awaitPromise: true,
        },
    };

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            webSocket.close();
            reject(new Error("Inspector Runtime.evaluate timed out."));
        }, 10000);

        webSocket.addEventListener("open", () => {
            webSocket.send(JSON.stringify(request));
        });
        webSocket.addEventListener("message", event => {
            const message = JSON.parse(String(event.data));
            if (message.id !== request.id) {
                return;
            }

            clearTimeout(timeout);
            webSocket.close();
            if (message.error) {
                reject(new Error(`Inspector Runtime.evaluate failed: ${JSON.stringify(message.error)}`));
                return;
            }

            resolve(message);
        });
        webSocket.addEventListener("error", () => {
            clearTimeout(timeout);
            reject(new Error("Inspector WebSocket connection failed."));
        });
    });
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function buildProcessSamplerScript(options) {
    const template = await readFile(processSamplerScriptPath, "utf8");

    return template
        .replaceAll("__DURATION_SECONDS__", String(options.durationSeconds))
        .replaceAll("__INTERVAL_MILLISECONDS__", String(options.intervalMilliseconds))
        .replaceAll("__WARMUP_SAMPLES__", String(options.warmupSamples))
        .replaceAll("__LOGICAL_PROCESSOR_COUNT__", String(os.cpus().length || 1))
        .replaceAll("__MONITOR_NODE_PROCESS_ID__", String(process.pid))
        .replaceAll("__PROCESS_NAMES_JSON__", JSON.stringify(options.processNames));
}
