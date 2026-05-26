import { create } from "@bufbuild/protobuf";
import { status as grpcStatus } from "@grpc/grpc-js";
import assert from "node:assert/strict";
import test from "node:test";
import {
    GetSourceHealthResponseSchema,
    ListMetricDescriptorsResponseSchema,
    MetricIdKind as ProtoMetricIdKind,
    MetricUnavailableReason as ProtoMetricUnavailableReason,
    MetricUnavailableReportSchema,
    MetricValueAttributionSchema,
    MetricValueKind as ProtoMetricValueKind,
    MetricValueFreshness as ProtoMetricValueFreshness,
    ReadMetricSnapshotResponseSchema,
    type GetSourceHealthRequest,
    type GetSourceHealthResponse,
    type ListMetricDescriptorsRequest,
    type ListMetricDescriptorsResponse,
    type MetricUnavailableReport as ProtoMetricUnavailableReport,
    type MetricValueAttribution as ProtoMetricValueAttribution,
    type ReadMetricSnapshotRequest,
    type ReadMetricSnapshotResponse,
} from "../../../generated/shometrics/v1/source_api_pb.js";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    MetricUnit,
    readRequiredMetricSnapshotTimestampMilliseconds,
} from "../metric-source";
import type { SourceMetadataInvalidation } from "../source-planning-metadata";
import {
    ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS,
    HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS,
    SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
    UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS,
    WindowsHelperSourceClient,
    type WindowsHelperDescriptorPreloadTimer,
    type WindowsHelperDescriptorPreloadTimerHandle,
    type WindowsHelperSourceClientOptions,
} from "./windows-helper-source-client";
import {
    buildWindowsNamedPipeGrpcTarget,
    type WindowsHelperGrpcRequestOptions,
    type WindowsHelperGrpcTransport,
} from "./windows-helper-grpc-transport";
import { WINDOWS_HELPER_SOURCE_ID } from "../source-ids";

const [
    INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    ESCALATED_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
] = HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS;

const CPU_HELPER_POLLING_GROUP_ID = "lhm:hardware:cpu";
const GPU_HELPER_POLLING_GROUP_ID = "lhm:hardware:gpu";
const UNKNOWN_SERVICE_STATUS_READER = { readStatus: async () => "unknown" as const };

test("windows helper builds the grpc-js Windows named-pipe target string", () => {
    assert.equal(
        buildWindowsNamedPipeGrpcTarget("ShoMetrics.GrpcBatch0"),
        "unix:\\\\.\\pipe\\ShoMetrics.GrpcBatch0",
    );

    // Known-bad forms from the Batch 0 spike:
    // - unix://\\.\pipe\ShoMetrics.GrpcBatch0
    // - unix:///\\.\pipe\ShoMetrics.GrpcBatch0
    // - \\.\pipe\ShoMetrics.GrpcBatch0
});

test("windows helper waits for descriptor metadata before declaring helper groups", () => {
    const client = new WindowsHelperSourceClient({
        transport: new RejectingTransport(new Error("unused")),
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    const resolutions = client.resolveMetricPollingGroups([
        "cpu.usage_percent",
        "gpu.temp",
    ]);

    assert.deepEqual([...resolutions.entries()], [
        ["cpu.usage_percent", {
            state: "pendingMetadata",
        }],
        ["gpu.temp", {
            state: "pendingMetadata",
        }],
    ]);
});

test("windows helper declares cached descriptor metrics with descriptor polling groups", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                return buildDescriptorResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await client.listMetricDescriptors(["cpu.usage_percent"]);
    const resolutions = client.resolveMetricPollingGroups([
        "cpu.usage_percent",
        "lhm.sensor:/missing",
    ]);

    assert.deepEqual([...resolutions.entries()], [
        ["cpu.usage_percent", {
            state: "owned",
            pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
        }],
        ["lhm.sensor:/missing", {
            state: "pendingMetadata",
        }],
    ]);
});

test("windows helper marks missing metrics unsupported after complete descriptor preload", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                assert.deepEqual(request.value.metricIds, []);
                return buildDescriptorResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await client.listMetricDescriptors([]);
    const resolutions = client.resolveMetricPollingGroups([
        "cpu.usage_percent",
        "cpu.temp",
    ]);

    assert.deepEqual([...resolutions.entries()], [
        ["cpu.usage_percent", {
            state: "owned",
            pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
        }],
        ["cpu.temp", {
            state: "unsupported",
        }],
    ]);
});

test("windows helper keeps filtered descriptors when the catalog fingerprint is unchanged", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                return buildDescriptorResponse({
                    descriptors: request.value.metricIds.map(metricId => buildDescriptor({ metricId })),
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await client.listMetricDescriptors(["cpu.usage_percent"]);
    await client.listMetricDescriptors(["gpu.temp"]);
    const resolutions = client.resolveMetricPollingGroups([
        "cpu.usage_percent",
        "gpu.temp",
    ]);

    assert.deepEqual([...resolutions.entries()], [
        ["cpu.usage_percent", {
            state: "owned",
            pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
        }],
        ["gpu.temp", {
            state: "owned",
            pollingGroupId: GPU_HELPER_POLLING_GROUP_ID,
        }],
    ]);
});

test("windows helper clears cached descriptors when the catalog fingerprint changes", async () => {
    let descriptorRequestCount = 0;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                descriptorRequestCount += 1;
                return descriptorRequestCount === 1
                    ? buildDescriptorResponse({
                        descriptorFingerprint: "catalog-sha256-before",
                        descriptors: [buildDescriptor({ metricId: "cpu.usage_percent" })],
                    })
                    : buildDescriptorResponse({
                        descriptorFingerprint: "catalog-sha256-after",
                        descriptors: [buildDescriptor({ metricId: "gpu.temp" })],
                    });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await client.listMetricDescriptors(["cpu.usage_percent"]);
    await client.listMetricDescriptors(["gpu.temp"]);
    const resolutions = client.resolveMetricPollingGroups([
        "cpu.usage_percent",
        "gpu.temp",
    ]);

    assert.deepEqual([...resolutions.entries()], [
        ["cpu.usage_percent", {
            state: "pendingMetadata",
        }],
        ["gpu.temp", {
            state: "owned",
            pollingGroupId: GPU_HELPER_POLLING_GROUP_ID,
        }],
    ]);
});

test("windows helper preloads descriptors and emits source metadata invalidation on subscribe", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                assert.deepEqual(request.value.metricIds, []);
                return buildDescriptorResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);
    const invalidations: SourceMetadataInvalidation[] = [];

    const unsubscribe = client.subscribeSourceMetadataInvalidations(invalidation => {
        invalidations.push(invalidation);
    });
    await drainAsyncOperations();

    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "listMetricDescriptors"],
    );
    assert.deepEqual(invalidations, [{
        sourceScopeId: "local",
        sourceProfileId: WINDOWS_HELPER_SOURCE_ID,
        planningFingerprint: "windows-helper-descriptor:catalog-sha256-test",
        reason: "descriptorLoaded",
    }]);

    unsubscribe();
});

test("windows helper retries descriptor preload after failure and emits descriptorLoaded", async () => {
    let healthRequestCount = 0;
    const retryTimer = new FakeDescriptorPreloadTimer();
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                healthRequestCount += 1;
                if (healthRequestCount === 1) {
                    throw new Error("helper is still starting");
                }

                return buildHealthResponse();
            case "listMetricDescriptors":
                return buildDescriptorResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport, {}, {
        descriptorPreloadRetryMilliseconds: 25,
        descriptorPreloadTimer: retryTimer,
    });
    const invalidations: SourceMetadataInvalidation[] = [];

    const unsubscribe = client.subscribeSourceMetadataInvalidations(invalidation => {
        invalidations.push(invalidation);
    });
    await drainAsyncOperations();

    assert.equal(retryTimer.activeHandleCount(), 1);
    assert.deepEqual(invalidations, []);

    retryTimer.runNext();
    await drainAsyncOperations();

    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "getSourceHealth", "listMetricDescriptors"],
    );
    assert.deepEqual(invalidations, [{
        sourceScopeId: "local",
        sourceProfileId: WINDOWS_HELPER_SOURCE_ID,
        planningFingerprint: "windows-helper-descriptor:catalog-sha256-test",
        reason: "descriptorLoaded",
    }]);

    unsubscribe();
});

test("windows helper uses fast descriptor preload retry only during startup window", async () => {
    let currentTimestampMilliseconds = 1000;
    const retryTimer = new FakeDescriptorPreloadTimer();
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                throw new Error("helper unavailable");
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport, {}, {
        descriptorPreloadRetryMilliseconds: 25_000,
        descriptorPreloadTimer: retryTimer,
        now: () => currentTimestampMilliseconds,
    });

    const unsubscribe = client.subscribeSourceMetadataInvalidations(() => undefined);
    await drainAsyncOperations();

    assert.equal(retryTimer.activeDelayMilliseconds(), 2000);

    currentTimestampMilliseconds += 60_001;
    retryTimer.runNext();
    await drainAsyncOperations();

    assert.equal(retryTimer.activeDelayMilliseconds(), 25_000);

    unsubscribe();
});

test("windows helper dispose stops descriptor preload retry timer", async () => {
    const retryTimer = new FakeDescriptorPreloadTimer();
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                throw new Error("helper unavailable");
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport, {}, {
        descriptorPreloadRetryMilliseconds: 25,
        descriptorPreloadTimer: retryTimer,
    });

    client.subscribeSourceMetadataInvalidations(() => undefined);
    await drainAsyncOperations();

    assert.equal(retryTimer.activeHandleCount(), 1);
    client.dispose();
    retryTimer.runNext();
    await drainAsyncOperations();

    assert.equal(retryTimer.activeHandleCount(), 0);
    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth"],
    );
});

test("windows helper forwards descriptor metadata invalidation to every listener", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                return buildDescriptorResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);
    const firstListenerInvalidations: SourceMetadataInvalidation[] = [];
    const secondListenerInvalidations: SourceMetadataInvalidation[] = [];

    const unsubscribeFirst = client.subscribeSourceMetadataInvalidations(invalidation => {
        firstListenerInvalidations.push(invalidation);
    });
    const unsubscribeSecond = client.subscribeSourceMetadataInvalidations(invalidation => {
        secondListenerInvalidations.push(invalidation);
    });
    await drainAsyncOperations();

    const expectedInvalidations = [{
        sourceScopeId: "local",
        sourceProfileId: WINDOWS_HELPER_SOURCE_ID,
        planningFingerprint: "windows-helper-descriptor:catalog-sha256-test",
        reason: "descriptorLoaded" as const,
    }];
    assert.deepEqual(firstListenerInvalidations, expectedInvalidations);
    assert.deepEqual(secondListenerInvalidations, expectedInvalidations);
    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "listMetricDescriptors"],
    );

    unsubscribeFirst();
    unsubscribeSecond();
});

test("windows helper emits descriptor metadata changes only when fingerprint changes", async () => {
    let descriptorRequestCount = 0;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                descriptorRequestCount += 1;
                return descriptorRequestCount <= 2
                    ? buildDescriptorResponse({
                        descriptorFingerprint: "catalog-sha256-before",
                    })
                    : buildDescriptorResponse({
                        descriptorFingerprint: "catalog-sha256-after",
                    });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);
    const invalidations: SourceMetadataInvalidation[] = [];

    const unsubscribe = client.subscribeSourceMetadataInvalidations(invalidation => {
        invalidations.push(invalidation);
    });
    await drainAsyncOperations();
    await client.listMetricDescriptors([]);
    await client.listMetricDescriptors([]);

    assert.deepEqual(invalidations, [
        {
            sourceScopeId: "local",
            sourceProfileId: WINDOWS_HELPER_SOURCE_ID,
            planningFingerprint: "windows-helper-descriptor:catalog-sha256-before",
            reason: "descriptorLoaded",
        },
        {
            sourceScopeId: "local",
            sourceProfileId: WINDOWS_HELPER_SOURCE_ID,
            planningFingerprint: "windows-helper-descriptor:catalog-sha256-after",
            reason: "descriptorChanged",
        },
    ]);

    unsubscribe();
});

test("windows helper source client sends requested metric ids and returns a runtime snapshot", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                assert.deepEqual(request.value.metricIds, ["cpu.usage_percent"]);
                return buildSnapshotResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.usage_percent"]);
    const snapshot = readResult.snapshot;

    assert.equal(readRequiredMetricSnapshotTimestampMilliseconds(snapshot), 1000);
    assert.equal(snapshot.metrics["cpu.usage_percent"]?.value.case, "scalar");
    assert.equal(snapshot.metrics["cpu.usage_percent"]?.value.value, 42);
    assert.deepEqual(readResult.valueAttributions, []);
    assert.deepEqual(readResult.unavailableMetrics, []);
    assert.equal(client.getCachedStatus().state, "available");
    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "readMetricSnapshot"],
    );
});

test("windows helper source client maps value attribution and unavailable metric reports", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse({
                    valueAttributions: [
                        create(MetricValueAttributionSchema, {
                            metricId: "cpu.usage_percent",
                            rawSensorIdentity: {
                                sourceSensorId: "lhm:/cpu/0/load/0",
                                hardwareId: "/cpu/0",
                                hardwareName: "CPU",
                                hardwareType: "Cpu",
                                sensorName: "CPU Total",
                                sourceSensorType: "Load",
                            },
                            valueFreshness: ProtoMetricValueFreshness.RETAINED,
                            retainedAgeMilliseconds: 1500,
                        }),
                    ],
                    unavailableMetrics: [
                        create(MetricUnavailableReportSchema, {
                            metricId: "cpu.power",
                            reason: ProtoMetricUnavailableReason.NO_SENSOR,
                        }),
                    ],
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.usage_percent", "cpu.power"]);

    assert.deepEqual(readResult.valueAttributions, [{
        metricId: "cpu.usage_percent",
        rawSensorIdentity: {
            sourceSensorId: "lhm:/cpu/0/load/0",
            hardwareId: "/cpu/0",
            hardwareName: "CPU",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
        },
        valueFreshness: "retained",
        retainedAgeMilliseconds: 1500,
    }]);
    assert.deepEqual(readResult.unavailableMetrics, [{
        metricId: "cpu.power",
        reason: "noSensorData",
    }]);
});

test("windows helper source client drops inconsistent source metric reports", async () => {
    const validAttribution = create(MetricValueAttributionSchema, {
        metricId: "cpu.usage_percent",
        rawSensorIdentity: {
            sourceSensorId: "lhm:/cpu/0/load/0",
            hardwareId: "/cpu/0",
            hardwareName: "CPU",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
        },
        valueFreshness: ProtoMetricValueFreshness.FRESH,
    });
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse({
                    valueAttributions: [
                        validAttribution,
                        validAttribution,
                        create(MetricValueAttributionSchema, {
                            metricId: "cpu.power",
                            valueFreshness: ProtoMetricValueFreshness.FRESH,
                        }),
                    ],
                    unavailableMetrics: [
                        create(MetricUnavailableReportSchema, {
                            metricId: "cpu.usage_percent",
                            reason: ProtoMetricUnavailableReason.INVALID_VALUE,
                        }),
                        create(MetricUnavailableReportSchema, {
                            metricId: "cpu.power",
                            reason: ProtoMetricUnavailableReason.NO_SENSOR,
                        }),
                        create(MetricUnavailableReportSchema, {
                            metricId: "cpu.power",
                            reason: ProtoMetricUnavailableReason.EXPIRED,
                        }),
                        create(MetricUnavailableReportSchema, {
                            metricId: "not.requested",
                            reason: ProtoMetricUnavailableReason.NO_SENSOR,
                        }),
                    ],
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.usage_percent", "cpu.power"]);

    assert.deepEqual(readResult.valueAttributions, [{
        metricId: "cpu.usage_percent",
        rawSensorIdentity: {
            sourceSensorId: "lhm:/cpu/0/load/0",
            hardwareId: "/cpu/0",
            hardwareName: "CPU",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
        },
        valueFreshness: "fresh",
    }]);
    assert.deepEqual(readResult.unavailableMetrics, [{
        metricId: "cpu.power",
        reason: "noSensorData",
    }]);
});

test("windows helper source client treats future freshness enum values as display-only", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse({
                    valueAttributions: [
                        create(MetricValueAttributionSchema, {
                            metricId: "cpu.usage_percent",
                            valueFreshness: 99 as ProtoMetricValueFreshness,
                        }),
                    ],
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.usage_percent"]);

    assert.deepEqual(readResult.valueAttributions, [{
        metricId: "cpu.usage_percent",
        valueFreshness: "retained",
    }]);
});

test("windows helper source client normalizes future unavailable reasons to unknown debug metadata", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse({
                    unavailableMetrics: [
                        create(MetricUnavailableReportSchema, {
                            metricId: "cpu.temp",
                            reason: 99 as ProtoMetricUnavailableReason,
                        }),
                    ],
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.temp"]);

    assert.deepEqual(readResult.unavailableMetrics, [{
        metricId: "cpu.temp",
        reason: "unknown",
    }]);
});

test("windows helper source client returns descriptors with the catalog fingerprint", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                assert.deepEqual(request.value.metricIds, ["cpu.usage_percent"]);
                return buildDescriptorResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const descriptorSnapshot = await client.listMetricDescriptors(["cpu.usage_percent"]);

    assert.equal(descriptorSnapshot.descriptorFingerprint, "catalog-sha256-test");
    assert.deepEqual(descriptorSnapshot.descriptors, [{
        metricId: "cpu.usage_percent",
        rawSensorIdentity: {
            sourceSensorId: "lhm:/cpu.usage_percent",
            hardwareId: "hardware-1",
            hardwareName: "CPU",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
        },
        pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
        valueKind: ProtoMetricValueKind.SCALAR,
        unit: MetricUnit.PERCENT,
        metricIdKind: ProtoMetricIdKind.STABLE_ALIAS,
    }]);
});

test("windows helper source client drops descriptors without polling group ids", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                return buildDescriptorResponse({
                    descriptors: [buildDescriptor({
                        metricId: "cpu.usage_percent",
                        pollingGroupId: "",
                    })],
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const descriptorSnapshot = await client.listMetricDescriptors(["cpu.usage_percent"]);

    assert.equal(descriptorSnapshot.descriptorFingerprint, "catalog-sha256-test");
    assert.deepEqual(descriptorSnapshot.descriptors, []);
});

test("windows helper source client passes request timeouts to the transport", async () => {
    const transport = new NeverResolvingTransport();
    const client = createClient(transport, {
        healthMilliseconds: 123,
    });

    const requestPromise = client.checkHealth();
    await Promise.resolve();

    assert.equal(transport.timeoutMilliseconds, 123);
    transport.reject(new Error("transport timeout"));

    await assert.rejects(async () => await requestPromise, /transport timeout/u);
});

test("windows helper source client cools down unsupported protocol retries", async () => {
    let nowMilliseconds = 1000;
    const transport = new FakeWindowsHelperGrpcTransport(request => buildHealthResponse("2"));
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
        timeouts: {
            healthMilliseconds: 10,
            readSnapshotMilliseconds: 10,
        },
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /Unsupported Windows source protocol/u,
    );
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /still inside retry cooldown/u,
    );

    assert.equal(transport.requests.length, 1);

    nowMilliseconds += UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS;

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /Unsupported Windows source protocol/u,
    );
    assert.equal(transport.requests.length, 2);
});

test("windows helper source client cools down unavailable helper retries", async () => {
    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(new Error("pipe unavailable"));
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe unavailable/u,
    );
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /still inside retry cooldown/u,
    );

    assert.equal(transport.requestCount, 1);

    nowMilliseconds += INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe unavailable/u,
    );
    assert.equal(transport.requestCount, 2);
});

test("windows helper source client uses active fast retry when the pipe is missing", async () => {
    let nowMilliseconds = 1000;
    const pipeMissingError = createGrpcServiceError(grpcStatus.UNAVAILABLE, "ENOENT: pipe not found");
    const transport = new RejectingTransport(pipeMissingError);
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe not found/u,
    );
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /still inside retry cooldown/u,
    );

    assert.equal(transport.requestCount, 1);
    assert.deepEqual(client.getCachedStatus(), {
        state: "unavailable",
        reason: "pipeMissing",
        retryAfterTimestampMilliseconds: 1000 + ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS,
        lastErrorCode: "ENOENT",
        lastErrorMessage: [
            "Windows helper gRPC request failed.",
            "method=GetSourceHealth",
            "status=UNAVAILABLE",
            "details=ENOENT: pipe not found",
        ].join(" "),
        lastFailureAtTimestampMilliseconds: 1000,
    });

    nowMilliseconds += ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS;

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe not found/u,
    );
    assert.equal(transport.requestCount, 2);
});

test("windows helper source client refines missing pipe status with service install state", async () => {
    const nowMilliseconds = 1000;
    const transport = new RejectingTransport(createGrpcServiceError(
        grpcStatus.UNAVAILABLE,
        "ENOENT: pipe not found",
    ));
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        serviceStatusReader: { readStatus: async () => "notInstalled" },
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe not found/u,
    );
    await drainAsyncOperations();

    assert.deepEqual(client.getCachedStatus(), {
        state: "unavailable",
        reason: "helperNotInstalled",
        retryAfterTimestampMilliseconds: nowMilliseconds + ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS,
        lastErrorCode: "ENOENT",
        lastErrorMessage: [
            "Windows helper gRPC request failed.",
            "method=GetSourceHealth",
            "status=UNAVAILABLE",
            "details=ENOENT: pipe not found",
        ].join(" "),
        lastFailureAtTimestampMilliseconds: nowMilliseconds,
    });
});

test("windows helper source client backs off repeated transient failures", async () => {
    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(createNodeError("ECONNRESET", "connection reset"));
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        1000 + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + ESCALATED_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += ESCALATED_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );
});

test("windows helper source client resets transient backoff after successful reads", async () => {
    let nowMilliseconds = 1000;
    let readRequestCount = 0;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                readRequestCount += 1;
                if (readRequestCount === 1 || readRequestCount === 3) {
                    throw createNodeError("ECONNRESET", "connection reset");
                }

                return buildSnapshotResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        1000 + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await client.readSnapshot(["cpu.usage_percent"]);
    assert.deepEqual(client.getCachedStatus(), {
        state: "available",
        protocolVersion: SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
        lastSuccessAtTimestampMilliseconds: nowMilliseconds,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );
});

test("windows helper source client maps grpc unavailable source errors", async () => {
    const transport = new RejectingTransport(createGrpcServiceError(
        grpcStatus.UNAVAILABLE,
        "Windows source reader is unavailable.",
    ));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.checkHealth(),
        /UNAVAILABLE/u,
    );
    assert.equal(client.getCachedStatus().reason, "sourceError");
    assert.equal(transport.resetCount, 1);
});

test("windows helper source client keeps the channel after grpc deadline exceeded", async () => {
    const transport = new RejectingTransport(createGrpcServiceError(
        grpcStatus.DEADLINE_EXCEEDED,
        "Deadline exceeded.",
    ));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.checkHealth(),
        /DEADLINE_EXCEEDED/u,
    );

    assert.equal(client.getCachedStatus().reason, "timeout");
    assert.equal(transport.resetCount, 0);
});

test("windows helper source client keeps the channel after grpc invalid argument", async () => {
    const transport = new RejectingTransport(createGrpcServiceError(
        grpcStatus.INVALID_ARGUMENT,
        "Invalid request.",
    ));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.checkHealth(),
        /INVALID_ARGUMENT/u,
    );

    assert.equal(client.getCachedStatus().reason, "sourceError");
    assert.equal(transport.resetCount, 0);
});

test("windows helper source client maps grpc unimplemented to protocol mismatch", async () => {
    const transport = new RejectingTransport(createGrpcServiceError(
        grpcStatus.UNIMPLEMENTED,
        "Method is not implemented.",
    ));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.checkHealth(),
        /UNIMPLEMENTED/u,
    );

    assert.equal(client.getCachedStatus().state, "unsupported");
    assert.equal(client.getCachedStatus().reason, "protocolMismatch");
    assert.equal(transport.resetCount, 1);
});

type FakeWindowsHelperGrpcRequest =
    | { readonly method: "getSourceHealth"; readonly value: GetSourceHealthRequest }
    | { readonly method: "listMetricDescriptors"; readonly value: ListMetricDescriptorsRequest }
    | { readonly method: "readMetricSnapshot"; readonly value: ReadMetricSnapshotRequest };

type FakeWindowsHelperGrpcResponse =
    | GetSourceHealthResponse
    | ListMetricDescriptorsResponse
    | ReadMetricSnapshotResponse;

class FakeWindowsHelperGrpcTransport implements WindowsHelperGrpcTransport {
    readonly requests: FakeWindowsHelperGrpcRequest[] = [];

    constructor(private readonly responseFactory: (
        request: FakeWindowsHelperGrpcRequest,
    ) => FakeWindowsHelperGrpcResponse) {}

    async getSourceHealth(request: GetSourceHealthRequest): Promise<GetSourceHealthResponse> {
        const fakeRequest = { method: "getSourceHealth", value: request } as const;
        this.requests.push(fakeRequest);

        return this.responseFactory(fakeRequest) as GetSourceHealthResponse;
    }

    async listMetricDescriptors(
        request: ListMetricDescriptorsRequest,
    ): Promise<ListMetricDescriptorsResponse> {
        const fakeRequest = { method: "listMetricDescriptors", value: request } as const;
        this.requests.push(fakeRequest);

        return this.responseFactory(fakeRequest) as ListMetricDescriptorsResponse;
    }

    async readMetricSnapshot(request: ReadMetricSnapshotRequest): Promise<ReadMetricSnapshotResponse> {
        const fakeRequest = { method: "readMetricSnapshot", value: request } as const;
        this.requests.push(fakeRequest);

        return this.responseFactory(fakeRequest) as ReadMetricSnapshotResponse;
    }
}

class NeverResolvingTransport implements WindowsHelperGrpcTransport {
    timeoutMilliseconds = 0;
    private rejectRequest: ((error: Error) => void) | undefined;

    async getSourceHealth(
        _request: GetSourceHealthRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<GetSourceHealthResponse> {
        return await this.startRequest(options);
    }

    async listMetricDescriptors(
        _request: ListMetricDescriptorsRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<ListMetricDescriptorsResponse> {
        return await this.startRequest(options);
    }

    async readMetricSnapshot(
        _request: ReadMetricSnapshotRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<ReadMetricSnapshotResponse> {
        return await this.startRequest(options);
    }

    private async startRequest<TResponse>(options: WindowsHelperGrpcRequestOptions): Promise<TResponse> {
        this.timeoutMilliseconds = options.timeoutMilliseconds;

        return await new Promise<TResponse>((_resolve, reject) => {
            this.rejectRequest = reject;
        });
    }

    reject(error: Error): void {
        this.rejectRequest?.(error);
    }
}

class RejectingTransport implements WindowsHelperGrpcTransport {
    requestCount = 0;
    resetCount = 0;

    constructor(private readonly error: Error) {}

    async getSourceHealth(): Promise<GetSourceHealthResponse> {
        return await this.reject();
    }

    async listMetricDescriptors(): Promise<ListMetricDescriptorsResponse> {
        return await this.reject();
    }

    async readMetricSnapshot(): Promise<ReadMetricSnapshotResponse> {
        return await this.reject();
    }

    private async reject<TResponse>(): Promise<TResponse> {
        this.requestCount += 1;
        throw this.error;
    }

    reset(): void {
        this.resetCount += 1;
    }
}

function createClient(
    transport: WindowsHelperGrpcTransport,
    timeouts: WindowsHelperSourceClientOptions["timeouts"] = {},
    options: Pick<
        WindowsHelperSourceClientOptions,
        "descriptorPreloadRetryMilliseconds" | "descriptorPreloadTimer" | "now" | "serviceStatusReader"
    > = {},
): WindowsHelperSourceClient {
    return new WindowsHelperSourceClient({
        transport,
        timeouts,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
        ...options,
    });
}

function createNodeError(code: string, message: string): Error {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    return error;
}

function createGrpcServiceError(code: grpcStatus, details: string): Error {
    const error = new Error(details) as Error & {
        code: grpcStatus;
        details: string;
    };
    error.code = code;
    error.details = details;
    return error;
}

async function drainAsyncOperations(): Promise<void> {
    for (let step = 0; step < 10; step += 1) {
        await Promise.resolve();
    }
}

function buildHealthResponse(
    protocolVersion = SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
): GetSourceHealthResponse {
    return create(GetSourceHealthResponseSchema, {
        sourceId: WINDOWS_HELPER_SOURCE_ID,
        protocolVersion,
        helperVersion: "0.0.0-test",
    });
}

function buildSnapshotResponse(
    options: {
        readonly valueAttributions?: readonly ProtoMetricValueAttribution[];
        readonly unavailableMetrics?: readonly ProtoMetricUnavailableReport[];
    } = {},
): ReadMetricSnapshotResponse {
    return create(ReadMetricSnapshotResponseSchema, {
        snapshot: buildMetricSnapshot({
            timestampMilliseconds: 1000,
            metrics: {
                "cpu.usage_percent": buildScalarMetricValue(42, { unit: MetricUnit.PERCENT }),
            },
        }),
        valueAttributions: [...(options.valueAttributions ?? [])],
        unavailableMetrics: [...(options.unavailableMetrics ?? [])],
    });
}

function buildDescriptorResponse(
    options: {
        readonly descriptorFingerprint?: string;
        readonly descriptors?: readonly ReturnType<typeof buildDescriptor>[];
    } = {},
): ListMetricDescriptorsResponse {
    return create(ListMetricDescriptorsResponseSchema, {
        descriptorSnapshot: {
            descriptorFingerprint: options.descriptorFingerprint ?? "catalog-sha256-test",
            descriptors: [...(options.descriptors ?? [buildDescriptor({ metricId: "cpu.usage_percent" })])],
        },
    });
}

function buildDescriptor(options: {
    readonly metricId: string;
    readonly pollingGroupId?: string;
}): {
    readonly metricId: string;
    readonly rawSensorIdentity: {
        readonly sourceSensorId: string;
        readonly hardwareId: string;
        readonly hardwareName: string;
        readonly hardwareType: string;
        readonly sensorName: string;
        readonly sourceSensorType: string;
    };
    readonly pollingGroupId: string;
    readonly valueKind: ProtoMetricValueKind;
    readonly unit: MetricUnit;
    readonly metricIdKind: ProtoMetricIdKind;
} {
    return {
        metricId: options.metricId,
        rawSensorIdentity: {
            sourceSensorId: `lhm:/${options.metricId}`,
            hardwareId: "hardware-1",
            hardwareName: "CPU",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
        },
        pollingGroupId: options.pollingGroupId ?? defaultHelperPollingGroupId(options.metricId),
        valueKind: ProtoMetricValueKind.SCALAR,
        unit: MetricUnit.PERCENT,
        metricIdKind: ProtoMetricIdKind.STABLE_ALIAS,
    };
}

function defaultHelperPollingGroupId(metricId: string): string {
    return metricId.startsWith("gpu.")
        ? GPU_HELPER_POLLING_GROUP_ID
        : CPU_HELPER_POLLING_GROUP_ID;
}

class FakeDescriptorPreloadTimer implements WindowsHelperDescriptorPreloadTimer {
    private readonly handles: FakeDescriptorPreloadTimerHandle[] = [];

    set(callback: () => void, delayMilliseconds: number): WindowsHelperDescriptorPreloadTimerHandle {
        const handle = new FakeDescriptorPreloadTimerHandle(callback, delayMilliseconds);
        this.handles.push(handle);
        return handle;
    }

    clear(handle: WindowsHelperDescriptorPreloadTimerHandle): void {
        (handle as FakeDescriptorPreloadTimerHandle).clear();
    }

    runNext(): void {
        this.handles.find(handle => handle.isActive)?.run();
    }

    activeHandleCount(): number {
        return this.handles.filter(handle => handle.isActive).length;
    }

    activeDelayMilliseconds(): number | undefined {
        return this.handles.find(handle => handle.isActive)?.delayMilliseconds;
    }
}

class FakeDescriptorPreloadTimerHandle implements WindowsHelperDescriptorPreloadTimerHandle {
    private active = true;
    private readonly callback: () => void;
    readonly delayMilliseconds: number;
    unrefCallCount = 0;

    constructor(callback: () => void, delayMilliseconds: number) {
        this.callback = callback;
        this.delayMilliseconds = delayMilliseconds;
    }

    get isActive(): boolean {
        return this.active;
    }

    unref(): void {
        this.unrefCallCount += 1;
    }

    clear(): void {
        this.active = false;
    }

    run(): void {
        if (!this.active) {
            return;
        }

        this.active = false;
        this.callback();
    }
}
