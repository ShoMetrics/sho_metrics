#!/usr/bin/env node

import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const hubRequire = createRequire(new URL("../../package.json", import.meta.url));
const grpc = hubRequire("@grpc/grpc-js");

const defaultPipeName = "ShoMetrics.Source.Windows.Grpc.v1";
const defaultDeadlineMilliseconds = 1000;
const demandMethodPath = "/shometrics.v1.MetricSourceService/SetMetricRefreshDemand";
const descriptorMethodPath = "/shometrics.v1.MetricSourceService/ListMetricDescriptors";
const healthMethodPath = "/shometrics.v1.MetricSourceService/GetSourceHealth";
const snapshotMethodPath = "/shometrics.v1.MetricSourceService/ReadMetricSnapshot";

const minimumHelperRefreshIntervalMilliseconds = 1000;
const maximumDemandGroupsPerRequest = 64;
const maximumPollingGroupIdLength = 512;
const readSnapshotFloodCount = 80;
const setDemandCooldownMilliseconds = 350;

const options = readOptions(process.argv.slice(2));

if (options.help) {
    printUsage();
    process.exit(0);
}

const client = new grpc.Client(
    buildWindowsNamedPipeGrpcTarget(options.pipeName),
    grpc.credentials.createInsecure(),
    {
        "grpc.max_receive_message_length": 1024 * 1024,
        "grpc.max_send_message_length": 1024 * 1024,
    },
);

try {
    const result = await runProbe(client, options);
    process.exit(result.ok ? 0 : 1);
} finally {
    client.close();
}

async function runProbe(grpcClient, probeOptions) {
    const checks = [];

    const health = decodeHealthResponse(await invokeUnary(grpcClient, healthMethodPath, Buffer.alloc(0), probeOptions));
    writeEvent("helperHealth", health);

    const descriptors = readDescriptors(
        await invokeUnary(grpcClient, descriptorMethodPath, Buffer.alloc(0), probeOptions),
    );
    const demandTargets = selectDemandTargets(descriptors);

    checks.push(assertCondition(
        demandTargets.length > 0,
        "descriptor discovery returned at least one polling group",
        { discoveredGroupCount: countDistinct(descriptors.map(descriptor => descriptor.pollingGroupId)) },
    ));

    if (demandTargets.length === 0) {
        return summarize(checks);
    }

    await waitBetweenSetDemandCalls();

    const clampedDemand = await invokeSetDemand(grpcClient, probeOptions, [
        {
            pollingGroupId: demandTargets[0].pollingGroupId,
            metricIds: [demandTargets[0].metricId],
            requestedIntervalMilliseconds: 1,
        },
    ]);
    checks.push(assertCondition(
        clampedDemand.ok
            && clampedDemand.response.acceptedGroupCount === 1
            && clampedDemand.response.effectiveMinimumIntervalMilliseconds === minimumHelperRefreshIntervalMilliseconds,
        "1 ms demand is accepted but clamped by helper",
        clampedDemand,
    ));

    await waitBetweenSetDemandCalls();

    const excessiveGroups = await invokeSetDemand(
        grpcClient,
        probeOptions,
        Array.from({ length: maximumDemandGroupsPerRequest + 1 }, (_, index) => ({
            pollingGroupId: `probe:excessive:${index}`,
            metricIds: [`probe.metric.${index}`],
            requestedIntervalMilliseconds: minimumHelperRefreshIntervalMilliseconds,
        })),
    );
    checks.push(assertGrpcFailure(
        excessiveGroups,
        grpc.status.INVALID_ARGUMENT,
        "excessive demand groups are rejected",
    ));

    await waitBetweenSetDemandCalls();

    const oversizedIdentifier = await invokeSetDemand(grpcClient, probeOptions, [
        {
            pollingGroupId: "x".repeat(maximumPollingGroupIdLength + 1),
            metricIds: ["probe.metric"],
            requestedIntervalMilliseconds: minimumHelperRefreshIntervalMilliseconds,
        },
    ]);
    checks.push(assertGrpcFailure(
        oversizedIdentifier,
        grpc.status.INVALID_ARGUMENT,
        "oversized polling_group_id is rejected",
    ));

    await waitBetweenSetDemandCalls();

    const controlCharacterIdentifier = await invokeSetDemand(grpcClient, probeOptions, [
        {
            pollingGroupId: "probe:\ncontrol",
            metricIds: ["probe.metric"],
            requestedIntervalMilliseconds: minimumHelperRefreshIntervalMilliseconds,
        },
    ]);
    checks.push(assertGrpcFailure(
        controlCharacterIdentifier,
        grpc.status.INVALID_ARGUMENT,
        "control-character polling_group_id is rejected",
    ));

    const secondTarget = demandTargets[1] ?? demandTargets[0];
    await waitBetweenSetDemandCalls();
    await invokeSetDemand(grpcClient, probeOptions, [
        {
            pollingGroupId: demandTargets[0].pollingGroupId,
            metricIds: [demandTargets[0].metricId],
            requestedIntervalMilliseconds: minimumHelperRefreshIntervalMilliseconds,
        },
    ]);
    const rapidFlip = await invokeSetDemand(grpcClient, probeOptions, [
        {
            pollingGroupId: secondTarget.pollingGroupId,
            metricIds: [secondTarget.metricId],
            requestedIntervalMilliseconds: minimumHelperRefreshIntervalMilliseconds,
        },
    ]);
    checks.push(assertGrpcFailure(
        rapidFlip,
        grpc.status.RESOURCE_EXHAUSTED,
        "rapid changed demand is rate limited",
    ));

    const readFlood = await floodReadSnapshot(grpcClient, probeOptions);
    checks.push(assertCondition(
        readFlood.resourceExhaustedCount > 0,
        "ReadMetricSnapshot flood is rate limited",
        readFlood,
    ));

    await delay(1000);
    const clearDemand = await invokeSetDemand(grpcClient, probeOptions, []);
    checks.push(assertCondition(
        clearDemand.ok,
        "empty demand clears helper refresh demand",
        clearDemand,
    ));

    return summarize(checks);
}

async function floodReadSnapshot(grpcClient, probeOptions) {
    let okCount = 0;
    let resourceExhaustedCount = 0;
    let firstFailure;

    for (let index = 0; index < readSnapshotFloodCount; index++) {
        const result = await invokeUnaryResult(
            grpcClient,
            snapshotMethodPath,
            Buffer.alloc(0),
            probeOptions,
        );

        if (result.ok) {
            okCount++;
            continue;
        }

        if (result.code === grpc.status.RESOURCE_EXHAUSTED) {
            resourceExhaustedCount++;
            continue;
        }

        firstFailure ??= result;
    }

    return { okCount, resourceExhaustedCount, firstFailure };
}

async function invokeSetDemand(grpcClient, probeOptions, groups) {
    const result = await invokeUnaryResult(
        grpcClient,
        demandMethodPath,
        encodeSetMetricRefreshDemandRequest(groups),
        probeOptions,
    );

    if (!result.ok) {
        return result;
    }

    return {
        ok: true,
        response: decodeSetMetricRefreshDemandResponse(result.response),
    };
}

async function invokeUnary(grpcClient, methodPath, request, probeOptions) {
    const result = await invokeUnaryResult(grpcClient, methodPath, request, probeOptions);

    if (!result.ok) {
        throw new Error(`${methodPath} failed: code=${result.code} details=${result.details}`);
    }

    return result.response;
}

function invokeUnaryResult(grpcClient, methodPath, request, probeOptions) {
    const startedAtMilliseconds = performance.now();

    return new Promise(resolve => {
        grpcClient.makeUnaryRequest(
            methodPath,
            value => value,
            value => value,
            request,
            { deadline: Date.now() + probeOptions.deadlineMilliseconds },
            (error, response) => {
                const durationMilliseconds = Math.round(performance.now() - startedAtMilliseconds);

                if (error) {
                    resolve({
                        ok: false,
                        code: typeof error.code === "number" ? error.code : undefined,
                        codeName: typeof error.code === "number" ? grpc.status[error.code] : undefined,
                        details: typeof error.details === "string" ? error.details : error.message,
                        durationMilliseconds,
                    });
                    return;
                }

                resolve({
                    ok: true,
                    response: response ?? Buffer.alloc(0),
                    durationMilliseconds,
                });
            },
        );
    });
}

function encodeSetMetricRefreshDemandRequest(groups) {
    const fields = [];

    for (const group of groups) {
        fields.push(encodeLengthDelimitedField(1, encodeMetricRefreshDemandGroup(group)));
    }

    return Buffer.concat(fields);
}

function encodeMetricRefreshDemandGroup(group) {
    const fields = [
        encodeStringField(1, group.pollingGroupId),
        encodeUInt32Field(3, group.requestedIntervalMilliseconds),
    ];

    for (const metricId of group.metricIds) {
        fields.push(encodeStringField(2, metricId));
    }

    return Buffer.concat(fields);
}

function encodeStringField(fieldNumber, value) {
    return encodeLengthDelimitedField(fieldNumber, Buffer.from(value, "utf8"));
}

function encodeLengthDelimitedField(fieldNumber, value) {
    return Buffer.concat([
        encodeVarint((fieldNumber << 3) | 2),
        encodeVarint(value.length),
        value,
    ]);
}

function encodeUInt32Field(fieldNumber, value) {
    return Buffer.concat([
        encodeVarint((fieldNumber << 3) | 0),
        encodeVarint(value),
    ]);
}

function encodeVarint(value) {
    const bytes = [];
    let remainingValue = value >>> 0;

    while (remainingValue > 0x7f) {
        bytes.push((remainingValue & 0x7f) | 0x80);
        remainingValue >>>= 7;
    }

    bytes.push(remainingValue);
    return Buffer.from(bytes);
}

function decodeHealthResponse(buffer) {
    const fields = decodeFields(buffer);

    return {
        sourceId: readFirstString(fields, 1),
        protocolVersion: readFirstString(fields, 2),
        helperVersion: readFirstString(fields, 3),
    };
}

function decodeSetMetricRefreshDemandResponse(buffer) {
    const fields = decodeFields(buffer);

    return {
        acceptedGroupCount: readFirstVarint(fields, 1),
        ignoredGroupCount: readFirstVarint(fields, 2),
        effectiveMinimumIntervalMilliseconds: readFirstVarint(fields, 3),
        demandTtlMilliseconds: readFirstVarint(fields, 4),
    };
}

function readDescriptors(buffer) {
    const responseFields = decodeFields(buffer);
    const descriptorSnapshot = readFirstBytes(responseFields, 1);

    if (!descriptorSnapshot) {
        return [];
    }

    const snapshotFields = decodeFields(descriptorSnapshot);
    const descriptors = [];

    for (const descriptorBytes of readRepeatedBytes(snapshotFields, 1)) {
        const descriptorFields = decodeFields(descriptorBytes);
        const metricId = readFirstString(descriptorFields, 1);
        const pollingGroupId = readFirstString(descriptorFields, 6);

        if (metricId && pollingGroupId) {
            descriptors.push({ metricId, pollingGroupId });
        }
    }

    return descriptors;
}

function selectDemandTargets(descriptors) {
    const targetsByPollingGroupId = new Map();

    for (const descriptor of descriptors) {
        if (!targetsByPollingGroupId.has(descriptor.pollingGroupId)) {
            targetsByPollingGroupId.set(descriptor.pollingGroupId, descriptor);
        }
    }

    return [...targetsByPollingGroupId.values()]
        .sort((left, right) => left.pollingGroupId.localeCompare(right.pollingGroupId, "en"));
}

function decodeFields(buffer) {
    const fields = new Map();
    let offset = 0;

    while (offset < buffer.length) {
        const key = readVarint(buffer, offset);
        offset = key.offset;

        const fieldNumber = key.value >> 3;
        const wireType = key.value & 7;
        let value;

        switch (wireType) {
            case 0: {
                const varint = readVarint(buffer, offset);
                offset = varint.offset;
                value = varint.value;
                break;
            }
            case 2: {
                const length = readVarint(buffer, offset);
                offset = length.offset;
                value = buffer.subarray(offset, offset + length.value);
                offset += length.value;
                break;
            }
            case 5:
                value = buffer.subarray(offset, offset + 4);
                offset += 4;
                break;
            case 1:
                value = buffer.subarray(offset, offset + 8);
                offset += 8;
                break;
            default:
                throw new Error(`Unsupported protobuf wire type ${wireType}.`);
        }

        const values = fields.get(fieldNumber);
        if (values) {
            values.push(value);
        } else {
            fields.set(fieldNumber, [value]);
        }
    }

    return fields;
}

function readFirstString(fields, fieldNumber) {
    const value = readFirstBytes(fields, fieldNumber);
    return value?.toString("utf8") ?? "";
}

function readFirstBytes(fields, fieldNumber) {
    const value = fields.get(fieldNumber)?.[0];
    return Buffer.isBuffer(value) ? value : undefined;
}

function readRepeatedBytes(fields, fieldNumber) {
    return (fields.get(fieldNumber) ?? []).filter(Buffer.isBuffer);
}

function readFirstVarint(fields, fieldNumber) {
    const value = fields.get(fieldNumber)?.[0];
    return typeof value === "number" ? value : 0;
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

function assertGrpcFailure(result, expectedCode, name) {
    return assertCondition(
        !result.ok && result.code === expectedCode,
        name,
        result,
    );
}

function assertCondition(condition, name, details) {
    const result = { ok: Boolean(condition), name, details };
    writeEvent(result.ok ? "checkPassed" : "checkFailed", result);
    return result;
}

function summarize(checks) {
    const failedChecks = checks.filter(check => !check.ok);

    writeEvent("summary", {
        ok: failedChecks.length === 0,
        passedCount: checks.length - failedChecks.length,
        failedCount: failedChecks.length,
        failedChecks: failedChecks.map(check => check.name),
    });

    return { ok: failedChecks.length === 0 };
}

function writeEvent(event, payload) {
    process.stdout.write(`${JSON.stringify({ event, ...payload })}\n`);
}

function countDistinct(values) {
    return new Set(values).size;
}

function waitBetweenSetDemandCalls() {
    return delay(setDemandCooldownMilliseconds);
}

function buildWindowsNamedPipeGrpcTarget(pipeName) {
    return `unix:\\\\.\\pipe\\${pipeName}`;
}

function readOptions(args) {
    const parsedOptions = {
        pipeName: defaultPipeName,
        deadlineMilliseconds: defaultDeadlineMilliseconds,
        help: false,
    };

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];

        switch (arg) {
            case "--pipe-name":
                parsedOptions.pipeName = readRequiredValue(args, ++index, arg);
                break;
            case "--deadline-ms":
                parsedOptions.deadlineMilliseconds = Number(readRequiredValue(args, ++index, arg));
                break;
            case "--help":
                parsedOptions.help = true;
                break;
            default:
                throw new Error(`Unknown option: ${arg}`);
        }
    }

    return parsedOptions;
}

function readRequiredValue(args, index, optionName) {
    const value = args[index];

    if (!value) {
        throw new Error(`Missing value for ${optionName}.`);
    }

    return value;
}

function printUsage() {
    process.stdout.write(`Usage:
  node scripts/diagnostics/windows-helper-demand-safety-probe.mjs [options]

Options:
  --pipe-name <name>   Named pipe name. Default: ${defaultPipeName}
  --deadline-ms <ms>   Unary deadline. Default: ${defaultDeadlineMilliseconds}
  --help              Show this help.

This script sends real SetMetricRefreshDemand and ReadMetricSnapshot requests
to verify helper-side safety guards. It temporarily changes helper refresh
demand and sends an empty demand at the end.
`);
}
