#!/usr/bin/env node

import { appendFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.resolve(scriptDirectory, "..", "..");
const hubRequire = createRequire(new URL("../../package.json", import.meta.url));
const grpc = hubRequire("@grpc/grpc-js");
const grpcPackage = hubRequire("@grpc/grpc-js/package.json");

const defaultPipeName = "ShoMetrics.Source.Windows.Grpc.v1";
const grpcMethodPath = "/shometrics.v1.MetricSourceService/GetSourceHealth";
const defaultDeadlineMilliseconds = 750;
const defaultCheckpoints = ["1m", "2m", "5m", "35m", "60m"];
const watchdogExtraMilliseconds = 5000;

const options = readOptions(process.argv.slice(2));

if (options.help) {
    printUsage();
    process.exit(0);
}

const logEvent = createEventLogger(options.logPath);
let summaryWritten = false;

process.once("SIGINT", () => {
    if (!summaryWritten) {
        void logEvent({
            event: "interrupted",
            at: new Date().toISOString(),
        }).finally(() => process.exit(130));
    }
});

const result = await runIdleSoak(options, logEvent);
summaryWritten = true;
process.exit(result.ok ? 0 : 1);

async function runIdleSoak(soakOptions, log) {
    const startedAt = new Date();
    const target = buildWindowsNamedPipeGrpcTarget(soakOptions.pipeName);
    const channelOptions = {
        "grpc.max_receive_message_length": 1024 * 1024,
        "grpc.max_send_message_length": 1024 * 1024,
    };

    if (soakOptions.clientIdleTimeoutMilliseconds !== undefined) {
        channelOptions["grpc.client_idle_timeout_ms"] = soakOptions.clientIdleTimeoutMilliseconds;
    }

    let client = createClient(target, channelOptions);
    const failures = [];
    let resetRecoveries = 0;

    await log({
        event: "start",
        at: startedAt.toISOString(),
        pid: process.pid,
        nodeVersion: process.version,
        grpcJsVersion: grpcPackage.version,
        target,
        pipeName: soakOptions.pipeName,
        deadlineMs: soakOptions.deadlineMilliseconds,
        watchdogMs: soakOptions.deadlineMilliseconds + watchdogExtraMilliseconds,
        clientIdleTimeoutMs: soakOptions.clientIdleTimeoutMilliseconds ?? null,
        checkpoints: soakOptions.checkpoints.map(checkpoint => checkpoint.label),
        checkpointMilliseconds: soakOptions.checkpoints.map(checkpoint => checkpoint.milliseconds),
    });

    const warmupResult = await callHealth(client, {
        checkpoint: "warmup",
        phase: "warmup",
        deadlineMilliseconds: soakOptions.deadlineMilliseconds,
        log,
    });

    if (!warmupResult.ok) {
        failures.push("warmup");
        await log({
            event: "summary",
            ok: false,
            failedCheckpoints: failures,
            resetRecoveries,
            startedAt: startedAt.toISOString(),
            endedAt: new Date().toISOString(),
        });
        client.close();
        return { ok: false };
    }

    for (const checkpoint of soakOptions.checkpoints) {
        await waitIdle({
            checkpoint,
            log,
            startedAtPerformanceMilliseconds: performance.now(),
        });

        await log({
            event: "checkpoint",
            label: checkpoint.label,
            plannedIdleMs: checkpoint.milliseconds,
            channelStateBefore: readChannelState(client, false),
        });

        const checkpointResult = await callHealth(client, {
            checkpoint: checkpoint.label,
            phase: "afterIdle",
            deadlineMilliseconds: soakOptions.deadlineMilliseconds,
            log,
        });

        if (checkpointResult.ok) {
            continue;
        }

        await log({
            event: "channelReset",
            reason: "after-idle-rpc-failed",
            checkpoint: checkpoint.label,
        });
        client.close();
        client = createClient(target, channelOptions);

        const retryResult = await callHealth(client, {
            checkpoint: checkpoint.label,
            phase: "afterResetRetry",
            deadlineMilliseconds: soakOptions.deadlineMilliseconds,
            log,
        });

        if (retryResult.ok) {
            resetRecoveries += 1;
        } else {
            failures.push(checkpoint.label);
        }
    }

    client.close();

    await log({
        event: "summary",
        ok: failures.length === 0,
        failedCheckpoints: failures,
        resetRecoveries,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
    });

    return { ok: failures.length === 0 };
}

function createClient(target, channelOptions) {
    return new grpc.Client(target, grpc.credentials.createInsecure(), channelOptions);
}

async function callHealth(client, options) {
    const startedAtPerformanceMilliseconds = performance.now();
    const startedAtWallClockMilliseconds = Date.now();

    const result = await withWatchdog(
        new Promise(resolve => {
            client.makeUnaryRequest(
                grpcMethodPath,
                () => Buffer.alloc(0),
                value => value,
                {},
                { deadline: startedAtWallClockMilliseconds + options.deadlineMilliseconds },
                (error, response) => {
                    if (error) {
                        resolve({ ok: false, error });
                        return;
                    }

                    resolve({ ok: true, response });
                },
            );
        }),
        options.deadlineMilliseconds + watchdogExtraMilliseconds,
    );

    const durationMilliseconds = Math.round(performance.now() - startedAtPerformanceMilliseconds);

    if (result.kind === "watchdogTimeout") {
        await options.log({
            event: "rpc",
            phase: options.phase,
            checkpoint: options.checkpoint,
            ok: false,
            failureKind: "watchdogTimeout",
            durationMs: durationMilliseconds,
            deadlineMs: options.deadlineMilliseconds,
            channelStateAfter: readChannelState(client, false),
        });
        return { ok: false };
    }

    if (!result.value.ok) {
        await options.log({
            event: "rpc",
            phase: options.phase,
            checkpoint: options.checkpoint,
            ok: false,
            durationMs: durationMilliseconds,
            deadlineMs: options.deadlineMilliseconds,
            grpcCode: readGrpcCode(result.value.error),
            grpcCodeName: readGrpcCodeName(result.value.error),
            details: readGrpcDetails(result.value.error),
            message: result.value.error.message,
            channelStateAfter: readChannelState(client, false),
        });
        return { ok: false };
    }

    const response = result.value.response ?? Buffer.alloc(0);
    const decodedHealth = decodeHealthResponse(response);

    await options.log({
        event: "rpc",
        phase: options.phase,
        checkpoint: options.checkpoint,
        ok: true,
        durationMs: durationMilliseconds,
        deadlineMs: options.deadlineMilliseconds,
        responseBytes: response.length,
        ...decodedHealth,
        channelStateAfter: readChannelState(client, false),
    });

    return { ok: true };
}

async function withWatchdog(work, timeoutMilliseconds) {
    let timeoutHandle;
    const timeout = new Promise(resolve => {
        timeoutHandle = setTimeout(() => {
            resolve({ kind: "watchdogTimeout" });
        }, timeoutMilliseconds);
        timeoutHandle.unref?.();
    });

    const value = await Promise.race([
        work.then(result => ({ kind: "value", value: result })),
        timeout,
    ]);

    if (timeoutHandle) {
        clearTimeout(timeoutHandle);
    }

    return value;
}

async function waitIdle(options) {
    const heartbeatMilliseconds = Math.min(60000, Math.max(5000, Math.floor(options.checkpoint.milliseconds / 2)));
    let elapsedMilliseconds = 0;

    while (elapsedMilliseconds < options.checkpoint.milliseconds) {
        const remainingMilliseconds = options.checkpoint.milliseconds - elapsedMilliseconds;
        await delay(Math.min(heartbeatMilliseconds, remainingMilliseconds));
        elapsedMilliseconds = Math.round(performance.now() - options.startedAtPerformanceMilliseconds);

        if (elapsedMilliseconds < options.checkpoint.milliseconds) {
            await options.log({
                event: "idleHeartbeat",
                checkpoint: options.checkpoint.label,
                elapsedMs: elapsedMilliseconds,
                remainingMs: Math.max(0, options.checkpoint.milliseconds - elapsedMilliseconds),
            });
        }
    }
}

function createEventLogger(logPath) {
    return async event => {
        const text = `${JSON.stringify(event)}\n`;
        process.stdout.write(text);

        if (!logPath) {
            return;
        }

        await mkdir(path.dirname(logPath), { recursive: true });
        await appendFile(logPath, text, "utf8");
    };
}

function readOptions(args) {
    const options = {
        pipeName: defaultPipeName,
        deadlineMilliseconds: defaultDeadlineMilliseconds,
        checkpoints: defaultCheckpoints.map(parseDuration),
        clientIdleTimeoutMilliseconds: undefined,
        logPath: undefined,
        help: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        switch (arg) {
            case "--help":
            case "-h":
                options.help = true;
                break;
            case "--pipe-name":
                options.pipeName = readRequiredValue(args, ++index, arg);
                break;
            case "--deadline-ms":
                options.deadlineMilliseconds = readPositiveInteger(readRequiredValue(args, ++index, arg), arg);
                break;
            case "--client-idle-timeout-ms":
                options.clientIdleTimeoutMilliseconds = readPositiveInteger(readRequiredValue(args, ++index, arg), arg);
                break;
            case "--checkpoints":
                options.checkpoints = readRequiredValue(args, ++index, arg)
                    .split(",")
                    .filter(Boolean)
                    .map(parseDuration);
                break;
            case "--log":
                options.logPath = path.resolve(hubRoot, readRequiredValue(args, ++index, arg));
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (options.checkpoints.length === 0) {
        throw new Error("--checkpoints must contain at least one duration.");
    }

    return options;
}

function parseDuration(value) {
    const match = /^(\d+)(ms|s|m|h)$/.exec(value.trim());
    if (!match) {
        throw new Error(`Invalid duration '${value}'. Use suffix ms, s, m, or h.`);
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === "ms"
        ? 1
        : unit === "s"
            ? 1000
            : unit === "m"
                ? 60 * 1000
                : 60 * 60 * 1000;

    return {
        label: value.trim(),
        milliseconds: amount * multiplier,
    };
}

function readRequiredValue(args, index, optionName) {
    const value = args[index];
    if (!value || value.startsWith("--")) {
        throw new Error(`${optionName} requires a value.`);
    }

    return value;
}

function readPositiveInteger(value, optionName) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
        throw new Error(`${optionName} must be a positive integer.`);
    }

    return number;
}

function buildWindowsNamedPipeGrpcTarget(pipeName) {
    return `unix:\\\\.\\pipe\\${pipeName}`;
}

function readChannelState(client, tryToConnect) {
    try {
        const channel = client.getChannel();
        return grpc.connectivityState[channel.getConnectivityState(tryToConnect)] ?? "UNKNOWN";
    } catch (error) {
        return `unavailable:${String(error)}`;
    }
}

function readGrpcCode(error) {
    return typeof error?.code === "number" ? error.code : undefined;
}

function readGrpcCodeName(error) {
    const code = readGrpcCode(error);
    return code === undefined ? undefined : grpc.status[code];
}

function readGrpcDetails(error) {
    return typeof error?.details === "string" ? error.details : undefined;
}

function decodeHealthResponse(buffer) {
    const output = {};
    let offset = 0;

    while (offset < buffer.length) {
        const key = readVarint(buffer, offset);
        offset = key.offset;

        const fieldNumber = key.value >> 3;
        const wireType = key.value & 7;

        if (wireType !== 2) {
            const skipped = skipUnknownField(buffer, offset, wireType);
            offset = skipped.offset;
            continue;
        }

        const length = readVarint(buffer, offset);
        offset = length.offset;
        const endOffset = offset + length.value;
        const value = buffer.subarray(offset, endOffset).toString("utf8");
        offset = endOffset;

        switch (fieldNumber) {
            case 1:
                output.sourceId = value;
                break;
            case 2:
                output.protocolVersion = value;
                break;
            case 3:
                output.helperVersion = value;
                break;
        }
    }

    return output;
}

function readVarint(buffer, offset) {
    let value = 0;
    let shift = 0;

    while (offset < buffer.length) {
        const byte = buffer[offset];
        offset += 1;
        value |= (byte & 0x7f) << shift;

        if ((byte & 0x80) === 0) {
            return { value, offset };
        }

        shift += 7;
    }

    throw new Error("Unexpected end of protobuf varint.");
}

function skipUnknownField(buffer, offset, wireType) {
    switch (wireType) {
        case 0:
            return readVarint(buffer, offset);
        case 1:
            return { offset: offset + 8 };
        case 2: {
            const length = readVarint(buffer, offset);
            return { offset: length.offset + length.value };
        }
        case 5:
            return { offset: offset + 4 };
        default:
            throw new Error(`Unsupported protobuf wire type ${wireType}.`);
    }
}

function printUsage() {
    process.stdout.write(`Usage:
  node scripts/diagnostics/windows-helper-grpc-idle-soak.mjs [options]

Options:
  --pipe-name <name>                 Named pipe name. Default: ${defaultPipeName}
  --deadline-ms <ms>                 Unary deadline. Default: ${defaultDeadlineMilliseconds}
  --client-idle-timeout-ms <ms>      Override grpc.client_idle_timeout_ms.
  --checkpoints <list>               Comma-separated idle durations. Default: ${defaultCheckpoints.join(",")}
  --log <path>                       Write JSONL events to a file.
  --help                             Show this help.

Examples:
  node scripts/diagnostics/windows-helper-grpc-idle-soak.mjs --client-idle-timeout-ms 10000 --checkpoints 15s,30s,60s
  node scripts/diagnostics/windows-helper-grpc-idle-soak.mjs --checkpoints 1m,2m,5m,35m,60m --log ../source-windows/logs/grpc-idle-soak.jsonl
`);
}
