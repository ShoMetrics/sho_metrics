#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const hubRequire = createRequire(new URL("../../package.json", import.meta.url));
const grpc = hubRequire("@grpc/grpc-js");

const defaultPipeName = "ShoMetrics.Source.Windows.Grpc.v1";
const defaultDeadlineMilliseconds = 3000;
const defaultDemandCooldownMilliseconds = 350;
const defaultDemandRetryCount = 8;
const defaultDemandRetryMilliseconds = 1000;
const defaultReadCooldownMilliseconds = 30;
const defaultReadRetryCount = 8;
const defaultReadRetryMilliseconds = 100;
const defaultSettleMilliseconds = 1600;
const descriptorMethodPath = "/shometrics.v1.MetricSourceService/ListMetricDescriptors";
const demandMethodPath = "/shometrics.v1.MetricSourceService/SetMetricRefreshDemand";
const snapshotMethodPath = "/shometrics.v1.MetricSourceService/ReadMetricSnapshot";
const sourceSensorMetricIdPrefix = "lhm.sensor:";

const options = readOptions(process.argv.slice(2));

if (options.help) {
    printUsage();
    process.exit(0);
}

if (!options.lhmJsonUrl) {
    throw new Error("--lhm-json-url is required.");
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
    const report = await buildParityReport(client, options);
    const reportText = `${JSON.stringify(report, null, 2)}\n`;

    if (options.outPath) {
        await mkdir(path.dirname(options.outPath), { recursive: true });
        await writeFile(options.outPath, reportText, "utf8");
        process.stdout.write(`Wrote ${options.outPath}\n`);
    } else {
        process.stdout.write(reportText);
    }

    if (options.markdownOutPath) {
        await mkdir(path.dirname(options.markdownOutPath), { recursive: true });
        await writeFile(options.markdownOutPath, buildMarkdownReport(report), "utf8");
        process.stdout.write(`Wrote ${options.markdownOutPath}\n`);
    }

    process.exit(report.summary.failedComparableCount === 0 ? 0 : 1);
} finally {
    client.close();
}

async function buildParityReport(grpcClient, reportOptions) {
    const capturedAt = new Date().toISOString();
    const lhmRoot = await readLhmJson(reportOptions.lhmJsonUrl);
    const lhmSensors = readLhmValueSensors(lhmRoot);
    const lhmSensorIds = new Set(lhmSensors.map(sensor => sensor.sensorId));
    const descriptors = await readHelperDescriptors(grpcClient, reportOptions);
    const sourceDescriptors = descriptors
        .filter(descriptor => descriptor.metricId.startsWith(sourceSensorMetricIdPrefix));
    const sourceDescriptorsByMetricId = new Map(sourceDescriptors.map(descriptor => [descriptor.metricId, descriptor]));
    const groups = groupDescriptorsByPollingGroup(sourceDescriptors);
    const helperReadResults = await readHelperGroups(grpcClient, groups, reportOptions);
    const rows = lhmSensors.map(sensor => buildParityRow(
        sensor,
        sourceDescriptorsByMetricId.get(`${sourceSensorMetricIdPrefix}${sensor.sensorId}`),
        helperReadResults,
    ));
    const helperOnlySourceSensors = sourceDescriptors
        .filter(descriptor => !lhmSensorIds.has(descriptor.sourceSensorId))
        .map(descriptor => ({
            metricId: descriptor.metricId,
            pollingGroupId: descriptor.pollingGroupId,
            sourceSensorId: descriptor.sourceSensorId,
            hardwareType: descriptor.hardwareType,
            sensorType: descriptor.sourceSensorType,
            sensorName: descriptor.sensorName,
        }))
        .sort(compareHelperOnlySourceSensor);

    return {
        reportVersion: 1,
        capturedAt,
        lhmJsonUrl: reportOptions.lhmJsonUrl,
        pipeName: reportOptions.pipeName,
        settleMilliseconds: reportOptions.settleMilliseconds,
        summary: summarizeRows(rows, helperOnlySourceSensors, groups),
        rows,
        helperOnlySourceSensors,
        notes: [
            "Rows compare LHM JSON sensors with finite values to helper source-sensor metrics.",
            "The script temporarily replaces helper refresh demand one polling group at a time and clears demand at the end.",
            "Missing helper descriptors for LHM storage sensors are expected when the helper intentionally avoids LHM storage traversal.",
        ],
    };
}

async function readLhmJson(url) {
    const response = await fetch(normalizeLhmJsonUrl(url), { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
        throw new Error(`LHM JSON request failed: status=${response.status}`);
    }

    return response.json();
}

function readLhmValueSensors(root) {
    const sensors = [];
    flattenLhmValueSensors(root, [], sensors);

    return sensors
        .filter(sensor => Number.isFinite(sensor.numericValue))
        .sort(compareLhmSensor);
}

function flattenLhmValueSensors(node, pathSegments, sensors) {
    if (!node || typeof node !== "object") {
        return;
    }

    const text = readOptionalString(node.Text);
    const nextPathSegments = text ? [...pathSegments, text] : pathSegments;
    const sensorId = readOptionalString(node.SensorId);
    const rawValue = node.RawValue ?? node.Value;
    const numericValue = parseLhmNumericValue(rawValue);

    if (sensorId && Number.isFinite(numericValue)) {
        sensors.push({
            sensorId,
            label: text ?? sensorId,
            path: nextPathSegments.join(" / "),
            type: readOptionalString(node.Type) ?? "",
            rawValue: rawValue == null ? "" : String(rawValue),
            numericValue,
        });
    }

    for (const child of Array.isArray(node.Children) ? node.Children : []) {
        flattenLhmValueSensors(child, nextPathSegments, sensors);
    }
}

async function readHelperDescriptors(grpcClient, reportOptions) {
    const response = await invokeUnary(grpcClient, descriptorMethodPath, Buffer.alloc(0), reportOptions);
    const fields = decodeFields(response);
    const descriptorSnapshot = readFirstBytes(fields, 1);

    if (!descriptorSnapshot) {
        return [];
    }

    const snapshotFields = decodeFields(descriptorSnapshot);
    return readRepeatedBytes(snapshotFields, 1)
        .map(decodeMetricDescriptor)
        .filter(descriptor => descriptor.metricId.length > 0)
        .sort((left, right) => left.metricId.localeCompare(right.metricId, "en"));
}

async function readHelperGroups(grpcClient, groups, reportOptions) {
    try {
        for (const group of groups) {
            await delay(reportOptions.demandCooldownMilliseconds);
            await invokeDemandUnary(
                grpcClient,
                demandMethodPath,
                encodeSetMetricRefreshDemandRequest([{
                    pollingGroupId: group.pollingGroupId,
                    metricIds: [group.metricIds[0]],
                    requestedIntervalMilliseconds: 1000,
                }]),
                reportOptions,
            );
            await delay(reportOptions.settleMilliseconds);
        }

        return await readHelperGroupSnapshots(grpcClient, groups, reportOptions);
    } finally {
        await delay(reportOptions.demandCooldownMilliseconds);
        await invokeDemandUnary(
            grpcClient,
            demandMethodPath,
            encodeSetMetricRefreshDemandRequest([]),
            reportOptions,
        ).catch(error => {
            process.stderr.write(`Failed to clear helper demand: ${error.message}\n`);
        });
    }

}

async function readHelperGroupSnapshots(grpcClient, groups, reportOptions) {
    const resultsByMetricId = new Map();

    // Read after every group has been refreshed. This catches cross-group cache
    // pollution where a later refresh accidentally replaces an earlier polling
    // group's cached snapshot.
    for (const group of groups) {
        await delay(reportOptions.readCooldownMilliseconds);
        const snapshotResponse = await invokeSnapshotUnary(
            grpcClient,
            snapshotMethodPath,
            encodeReadMetricSnapshotRequest(group.metricIds),
            reportOptions,
        );
        for (const result of decodeSnapshotResults(snapshotResponse)) {
            resultsByMetricId.set(result.metricId, result);
        }
    }

    return resultsByMetricId;
}

function buildParityRow(sensor, descriptor, helperReadResults) {
    const metricId = `${sourceSensorMetricIdPrefix}${sensor.sensorId}`;

    if (!descriptor) {
        return {
            status: classifyMissingDescriptorStatus(sensor),
            metricId,
            lhm: sensor,
            helper: null,
        };
    }

    const helperResult = helperReadResults.get(metricId);
    if (!helperResult) {
        return {
            status: "missing-helper-result",
            metricId,
            lhm: sensor,
            helper: {
                descriptor,
            },
        };
    }

    if (helperResult.kind === "reading") {
        return {
            status: "matched",
            metricId,
            lhm: sensor,
            helper: {
                descriptor,
                value: helperResult.value,
                unit: helperResult.unit,
            },
        };
    }

    return {
        status: classifyUnavailableStatus(sensor, helperResult.reason),
        metricId,
        lhm: sensor,
        helper: {
            descriptor,
            unavailableReason: helperResult.reason,
        },
    };
}

function summarizeRows(rows, helperOnlySourceSensors, groups) {
    const countsByStatus = new Map();

    for (const row of rows) {
        countsByStatus.set(row.status, (countsByStatus.get(row.status) ?? 0) + 1);
    }

    const failedComparableCount = rows.filter(row => isUnexpectedGapStatus(row.status)).length;

    return {
        lhmValueSensorCount: rows.length,
        helperSourceSensorDescriptorCount: helperOnlySourceSensors.length
            + rows.filter(row => row.helper?.descriptor).length,
        demandPollingGroupCount: groups.length,
        failedComparableCount,
        countsByStatus: Object.fromEntries([...countsByStatus.entries()].sort(compareEntriesByKey)),
        helperOnlySourceSensorCount: helperOnlySourceSensors.length,
    };
}

function classifyMissingDescriptorStatus(sensor) {
    const sensorRoot = readSensorRoot(sensor.sensorId);

    if (sensorRoot === "hdd" || sensorRoot === "nvme" || sensorRoot === "ssd") {
        return "expected-missing-helper-descriptor:storage";
    }

    return "missing-helper-descriptor";
}

function classifyUnavailableStatus(sensor, reason) {
    if (reason === "INVALID_VALUE"
        && sensor.type === "Temperature"
        && sensor.numericValue <= 0) {
        return "expected-helper-unavailable:invalid-zero-temperature";
    }

    return `helper-unavailable:${reason}`;
}

function isUnexpectedGapStatus(status) {
    return status !== "matched" && !status.startsWith("expected-", 0);
}

function readSensorRoot(sensorId) {
    return sensorId.split("/").filter(part => part.length > 0)[0] ?? "";
}

function groupDescriptorsByPollingGroup(descriptors) {
    const metricIdsByPollingGroupId = new Map();

    for (const descriptor of descriptors) {
        const metricIds = metricIdsByPollingGroupId.get(descriptor.pollingGroupId) ?? [];
        metricIds.push(descriptor.metricId);
        metricIdsByPollingGroupId.set(descriptor.pollingGroupId, metricIds);
    }

    return [...metricIdsByPollingGroupId.entries()]
        .map(([pollingGroupId, metricIds]) => ({
            pollingGroupId,
            metricIds: metricIds.sort((left, right) => left.localeCompare(right, "en")),
        }))
        .sort((left, right) => left.pollingGroupId.localeCompare(right.pollingGroupId, "en"));
}

function decodeMetricDescriptor(buffer) {
    const fields = decodeFields(buffer);
    const rawSensorIdentity = decodeRawSensorIdentity(readFirstBytes(fields, 2));

    return {
        metricId: readFirstString(fields, 1),
        rawSensorIdentity,
        valueKind: readFirstVarint(fields, 3),
        unit: readFirstVarint(fields, 4),
        metricIdKind: readFirstVarint(fields, 5),
        pollingGroupId: readFirstString(fields, 6),
        sourceSensorId: rawSensorIdentity.sourceSensorId,
        hardwareId: rawSensorIdentity.hardwareId,
        hardwareName: rawSensorIdentity.hardwareName,
        hardwareType: rawSensorIdentity.hardwareType,
        sensorName: rawSensorIdentity.sensorName,
        sourceSensorType: rawSensorIdentity.sourceSensorType,
    };
}

function decodeRawSensorIdentity(buffer) {
    if (!buffer) {
        return {
            sourceSensorId: "",
            hardwareId: "",
            hardwareName: "",
            hardwareType: "",
            sensorName: "",
            sourceSensorType: "",
        };
    }

    const fields = decodeFields(buffer);
    return {
        sourceSensorId: readFirstString(fields, 1),
        hardwareId: readFirstString(fields, 2),
        hardwareName: readFirstString(fields, 3),
        hardwareType: readFirstString(fields, 4),
        sensorName: readFirstString(fields, 5),
        sourceSensorType: readFirstString(fields, 6),
    };
}

function decodeSnapshotResults(buffer) {
    const responseFields = decodeFields(buffer);
    const snapshot = readFirstBytes(responseFields, 1);
    const results = [];

    if (snapshot) {
        const snapshotFields = decodeFields(snapshot);
        for (const metricEntryBytes of readRepeatedBytes(snapshotFields, 2)) {
            const entryFields = decodeFields(metricEntryBytes);
            const metricId = readFirstString(entryFields, 1);
            const metricValue = decodeMetricValue(readFirstBytes(entryFields, 2));

            if (metricId && metricValue) {
                results.push({
                    metricId,
                    kind: "reading",
                    value: metricValue.value,
                    unit: metricValue.unit,
                });
            }
        }
    }

    for (const unavailableBytes of readRepeatedBytes(responseFields, 5)) {
        const fields = decodeFields(unavailableBytes);
        const metricId = readFirstString(fields, 1);

        if (metricId) {
            results.push({
                metricId,
                kind: "unavailable",
                reason: readMetricUnavailableReason(readFirstVarint(fields, 2)),
            });
        }
    }

    return results;
}

function decodeMetricValue(buffer) {
    if (!buffer) {
        return undefined;
    }

    const fields = decodeFields(buffer);
    const scalarBytes = readFirstFixed64(fields, 1);
    const textBytes = readFirstBytes(fields, 2);

    if (scalarBytes) {
        return {
            value: scalarBytes.readDoubleLE(0),
            unit: readMetricUnit(readFirstVarint(fields, 3)),
        };
    }

    if (textBytes) {
        return {
            value: textBytes.toString("utf8"),
            unit: readMetricUnit(readFirstVarint(fields, 3)),
        };
    }

    return undefined;
}

function invokeUnary(grpcClient, methodPath, request, reportOptions) {
    return invokeUnaryResult(grpcClient, methodPath, request, reportOptions)
        .then(result => {
            if (result.ok) {
                return result.response;
            }

            throw new Error(formatUnaryFailure(methodPath, result));
        });
}

async function invokeDemandUnary(grpcClient, methodPath, request, reportOptions) {
    let lastFailure;

    for (let attempt = 0; attempt <= reportOptions.demandRetryCount; attempt += 1) {
        const result = await invokeUnaryResult(grpcClient, methodPath, request, reportOptions);

        if (result.ok) {
            return result.response;
        }

        lastFailure = result;

        if (result.code !== grpc.status.RESOURCE_EXHAUSTED || attempt === reportOptions.demandRetryCount) {
            break;
        }

        await delay(reportOptions.demandRetryMilliseconds);
    }

    throw new Error(formatUnaryFailure(methodPath, lastFailure));
}

async function invokeSnapshotUnary(grpcClient, methodPath, request, reportOptions) {
    let lastFailure;

    for (let attempt = 0; attempt <= reportOptions.readRetryCount; attempt += 1) {
        const result = await invokeUnaryResult(grpcClient, methodPath, request, reportOptions);

        if (result.ok) {
            return result.response;
        }

        lastFailure = result;

        if (result.code !== grpc.status.RESOURCE_EXHAUSTED || attempt === reportOptions.readRetryCount) {
            break;
        }

        await delay(reportOptions.readRetryMilliseconds);
    }

    throw new Error(formatUnaryFailure(methodPath, lastFailure));
}

function invokeUnaryResult(grpcClient, methodPath, request, reportOptions) {
    const startedAtMilliseconds = performance.now();

    return new Promise(resolve => {
        grpcClient.makeUnaryRequest(
            methodPath,
            value => value,
            value => value,
            request,
            { deadline: Date.now() + reportOptions.deadlineMilliseconds },
            (error, response) => {
                const durationMilliseconds = Math.round(performance.now() - startedAtMilliseconds);

                if (error) {
                    resolve({
                        ok: false,
                        code: typeof error.code === "number" ? error.code : undefined,
                        details: error.details ?? error.message,
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

function formatUnaryFailure(methodPath, failure) {
    return `${methodPath} failed after ${failure?.durationMilliseconds ?? "?"}ms: ${failure?.details ?? "unknown error"}`;
}

function encodeSetMetricRefreshDemandRequest(groups) {
    return Buffer.concat(groups.map(group => encodeLengthDelimitedField(1, encodeMetricRefreshDemandGroup(group))));
}

function encodeMetricRefreshDemandGroup(group) {
    return Buffer.concat([
        encodeStringField(1, group.pollingGroupId),
        ...group.metricIds.map(metricId => encodeStringField(2, metricId)),
        encodeUInt32Field(3, group.requestedIntervalMilliseconds),
    ]);
}

function encodeReadMetricSnapshotRequest(metricIds) {
    return Buffer.concat(metricIds.map(metricId => encodeStringField(1, metricId)));
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
            case 1:
                value = buffer.subarray(offset, offset + 8);
                offset += 8;
                break;
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

function readFirstFixed64(fields, fieldNumber) {
    const value = fields.get(fieldNumber)?.[0];
    return Buffer.isBuffer(value) && value.length === 8 ? value : undefined;
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

function readMetricUnit(value) {
    return [
        "UNSPECIFIED",
        "%",
        "C",
        "V",
        "A",
        "W",
        "Hz",
        "B",
        "B/s",
        "RPM",
        "L/h",
        "",
        "s",
        "Wh",
        "dBA",
        "S/cm",
        "ms",
    ][value] ?? `unknown:${value}`;
}

function readMetricUnavailableReason(value) {
    return [
        "UNSPECIFIED",
        "NO_SOURCE_READING",
        "INVALID_VALUE",
        "EXPIRED",
        "PENDING_REFRESH",
    ][value] ?? `unknown:${value}`;
}

function parseLhmNumericValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : Number.NaN;
    }

    if (typeof value !== "string") {
        return Number.NaN;
    }

    const normalized = value.replace(/,/gu, "").trim();
    const match = /[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/iu.exec(normalized);

    if (!match) {
        return Number.NaN;
    }

    return Number(match[0]);
}

function readOptionalString(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeLhmJsonUrl(url) {
    if (/\.json(?:[?#].*)?$/iu.test(url)) {
        return url;
    }

    return `${url.replace(/\/+$/u, "")}/data.json`;
}

function buildWindowsNamedPipeGrpcTarget(pipeName) {
    return `unix:\\\\.\\pipe\\${pipeName}`;
}

function compareLhmSensor(left, right) {
    return left.sensorId.localeCompare(right.sensorId, "en", { numeric: true });
}

function compareHelperOnlySourceSensor(left, right) {
    return left.metricId.localeCompare(right.metricId, "en", { numeric: true });
}

function compareEntriesByKey([leftKey], [rightKey]) {
    return leftKey.localeCompare(rightKey, "en");
}

function buildMarkdownReport(report) {
    const lines = [
        "# Windows Helper LHM Parity Report",
        "",
        `Captured at: ${report.capturedAt}`,
        "",
        "## Summary",
        "",
        "| Field | Value |",
        "| --- | ---: |",
        `| LHM value sensors | ${report.summary.lhmValueSensorCount} |`,
        `| Helper source-sensor descriptors | ${report.summary.helperSourceSensorDescriptorCount} |`,
        `| Demand polling groups | ${report.summary.demandPollingGroupCount} |`,
        `| Failed comparable metrics | ${report.summary.failedComparableCount} |`,
        `| Helper-only source sensors | ${report.summary.helperOnlySourceSensorCount} |`,
        "",
        "## Status Counts",
        "",
        "| Status | Count |",
        "| --- | ---: |",
        ...Object.entries(report.summary.countsByStatus)
            .map(([status, count]) => `| ${escapeMarkdown(status)} | ${count} |`),
        "",
        "## LHM Sensors",
        "",
        "| Status | Metric ID | LHM Type | LHM Label | LHM Raw Value | Helper Value | Helper Unit |",
        "| --- | --- | --- | --- | ---: | ---: | --- |",
        ...report.rows.map(row => [
            escapeMarkdown(row.status),
            code(row.metricId),
            escapeMarkdown(row.lhm.type),
            escapeMarkdown(row.lhm.path || row.lhm.label),
            escapeMarkdown(row.lhm.rawValue),
            row.helper?.value === undefined ? "" : escapeMarkdown(String(row.helper.value)),
            escapeMarkdown(row.helper?.unit ?? ""),
        ].join(" | ")).map(line => `| ${line} |`),
    ];

    return `${lines.join("\n")}\n`;
}

function code(value) {
    return `\`${String(value).replace(/`/gu, "\\`")}\``;
}

function escapeMarkdown(value) {
    return String(value)
        .replace(/\|/gu, "\\|")
        .replace(/\r?\n/gu, " ");
}

function readOptions(args) {
    const parsedOptions = {
        deadlineMilliseconds: defaultDeadlineMilliseconds,
        demandCooldownMilliseconds: defaultDemandCooldownMilliseconds,
        demandRetryCount: defaultDemandRetryCount,
        demandRetryMilliseconds: defaultDemandRetryMilliseconds,
        help: false,
        lhmJsonUrl: undefined,
        markdownOutPath: undefined,
        outPath: undefined,
        pipeName: defaultPipeName,
        readCooldownMilliseconds: defaultReadCooldownMilliseconds,
        readRetryCount: defaultReadRetryCount,
        readRetryMilliseconds: defaultReadRetryMilliseconds,
        settleMilliseconds: defaultSettleMilliseconds,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        switch (arg) {
            case "--deadline-ms":
                parsedOptions.deadlineMilliseconds = readPositiveNumber(args, ++index, arg);
                break;
            case "--demand-cooldown-ms":
                parsedOptions.demandCooldownMilliseconds = readPositiveNumber(args, ++index, arg);
                break;
            case "--demand-retry-count":
                parsedOptions.demandRetryCount = readPositiveNumber(args, ++index, arg);
                break;
            case "--demand-retry-ms":
                parsedOptions.demandRetryMilliseconds = readPositiveNumber(args, ++index, arg);
                break;
            case "--help":
                parsedOptions.help = true;
                break;
            case "--lhm-json-url":
                parsedOptions.lhmJsonUrl = readRequiredValue(args, ++index, arg);
                break;
            case "--markdown-out":
                parsedOptions.markdownOutPath = path.resolve(readRequiredValue(args, ++index, arg));
                break;
            case "--out":
                parsedOptions.outPath = path.resolve(readRequiredValue(args, ++index, arg));
                break;
            case "--pipe-name":
                parsedOptions.pipeName = readRequiredValue(args, ++index, arg);
                break;
            case "--read-cooldown-ms":
                parsedOptions.readCooldownMilliseconds = readPositiveNumber(args, ++index, arg);
                break;
            case "--read-retry-count":
                parsedOptions.readRetryCount = readPositiveNumber(args, ++index, arg);
                break;
            case "--read-retry-ms":
                parsedOptions.readRetryMilliseconds = readPositiveNumber(args, ++index, arg);
                break;
            case "--settle-ms":
                parsedOptions.settleMilliseconds = readPositiveNumber(args, ++index, arg);
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

function readPositiveNumber(args, index, optionName) {
    const value = Number(readRequiredValue(args, index, optionName));

    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${optionName} must be a positive number.`);
    }

    return value;
}

function printUsage() {
    process.stdout.write(`Usage:
  node scripts/diagnostics/windows-helper-lhm-parity.mjs --lhm-json-url <url> [options]

Options:
  --lhm-json-url <url>   LHM desktop JSON URL. Accepts base URL or /data.json.
  --pipe-name <name>     Named pipe name. Default: ${defaultPipeName}
  --deadline-ms <ms>     Unary deadline. Default: ${defaultDeadlineMilliseconds}
  --demand-cooldown-ms <ms>
                         Wait before demand changes. Default: ${defaultDemandCooldownMilliseconds}
  --demand-retry-count <count>
                         Retries for RESOURCE_EXHAUSTED demand races. Default: ${defaultDemandRetryCount}
  --demand-retry-ms <ms>
                         Retry delay for demand races. Default: ${defaultDemandRetryMilliseconds}
  --read-cooldown-ms <ms>
                         Wait between final snapshot reads. Default: ${defaultReadCooldownMilliseconds}
  --read-retry-count <count>
                         Retries for RESOURCE_EXHAUSTED snapshot reads. Default: ${defaultReadRetryCount}
  --read-retry-ms <ms>
                         Retry delay for snapshot read limits. Default: ${defaultReadRetryMilliseconds}
  --settle-ms <ms>       Wait after each per-group demand. Default: ${defaultSettleMilliseconds}
  --out <path>           Write JSON report.
  --markdown-out <path>  Write Markdown report.
  --help                 Show this help.

This is a non-hermetic diagnostic. It temporarily replaces helper refresh
demand one polling group at a time, reads helper cached snapshots, compares
them with the running LHM desktop JSON cache, and clears demand before exit.
Generated reports may include local hardware labels and should stay under
ignored artifacts/.
`);
}
