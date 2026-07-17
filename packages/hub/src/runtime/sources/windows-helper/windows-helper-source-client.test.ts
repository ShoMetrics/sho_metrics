import { create } from "@bufbuild/protobuf";
import { status as grpcStatus } from "@grpc/grpc-js";
import assert from "node:assert/strict";
import { test } from "vitest";
import {
    MetricDescriptorSchema,
    MetricIdKind as ProtoMetricIdKind,
    MetricUnavailableReason as ProtoMetricUnavailableReason,
    MetricUnavailableReportSchema,
    MetricValueFreshness as ProtoMetricValueFreshness,
    MetricValueKind as ProtoMetricValueKind,
    MetricValueMetadataSchema,
    type MetricValueMetadata as ProtoMetricValueMetadata,
} from "../../../generated/proto/shometrics/v1/metric_common_pb.js";
import {
    GetSourceHealthResponseSchema,
    HelperMetricDescriptorSchema,
    HelperMetricUnavailableReportSchema,
    HelperMetricValueProvenanceSchema,
    ListMetricDescriptorsResponseSchema,
    ReadMetricSnapshotResponseSchema,
    SetMetricRefreshDemandResponseSchema,
    type GetSourceHealthRequest,
    type GetSourceHealthResponse,
    type HelperMetricDescriptor as ProtoHelperMetricDescriptor,
    type HelperMetricUnavailableReport as ProtoHelperMetricUnavailableReport,
    type HelperMetricValueProvenance as ProtoHelperMetricValueProvenance,
    type ListMetricDescriptorsRequest,
    type ListMetricDescriptorsResponse,
    type ReadMetricSnapshotRequest,
    type ReadMetricSnapshotResponse,
    type SetMetricRefreshDemandRequest,
    type SetMetricRefreshDemandResponse,
} from "../../../generated/proto/shometrics/v1/helper_grpc_service_pb.js";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    MetricUnit,
    readRequiredMetricSnapshotTimestampMilliseconds,
} from "../metric-source";
import type { SourceMetadataInvalidation } from "../source-planning-metadata";
import {
    ACTIVE_HELPER_DEMAND_UNAVAILABLE_RETRY_CAP_MILLISECONDS,
    ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS,
    ACTIVE_HELPER_PIPE_RETRY_WINDOW_MILLISECONDS,
    HELPER_REFRESH_DEMAND_TTL_MILLISECONDS,
    HELPER_RESUME_RECOVERY_GRACE_MILLISECONDS,
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

test("windows helper sends refresh demand through the grpc transport", async () => {
    let demandResponse: SetMetricRefreshDemandResponse | undefined;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "setMetricRefreshDemand":
                demandResponse = create(SetMetricRefreshDemandResponseSchema, {
                    acceptedGroupCount: 1,
                    effectiveMinimumIntervalMilliseconds: 1000,
                    demandTtlMilliseconds: 15000,
                });
                return demandResponse;
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await client.setMetricRefreshDemand?.([{
        pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
        metricKeys: ["cpu.temp", "cpu.power"],
        intervalMilliseconds: 1000,
    }]);

    const demandRequest = transport.requests[1];
    if (demandRequest?.method !== "setMetricRefreshDemand") {
        assert.fail(`Unexpected request: ${demandRequest?.method ?? "empty"}`);
    }

    assert.equal(demandRequest.value.groups.length, 1);
    assert.equal(demandRequest.value.groups[0]?.pollingGroupId, CPU_HELPER_POLLING_GROUP_ID);
    assert.deepEqual(demandRequest.value.groups[0]?.metricIds, ["cpu.temp", "cpu.power"]);
    assert.equal(demandRequest.value.groups[0]?.requestedIntervalMilliseconds, 1000);
    assert.equal(demandResponse?.demandTtlMilliseconds, HELPER_REFRESH_DEMAND_TTL_MILLISECONDS);
});

test("windows helper treats unimplemented refresh demand as optional version skew", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "setMetricRefreshDemand":
                throw createGrpcServiceError(
                    grpcStatus.UNIMPLEMENTED,
                    "Method is not implemented.",
                );
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await client.setMetricRefreshDemand([
        {
            pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
            metricKeys: ["cpu.temp"],
            intervalMilliseconds: 1000,
        },
    ]);

    assert.equal(client.getCachedStatus().state, "available");
    assert.equal(transport.resetCount, 0);
});

test("windows helper does not mark the source unavailable when refresh demand is rate limited", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "setMetricRefreshDemand":
                throw createGrpcServiceError(
                    grpcStatus.RESOURCE_EXHAUSTED,
                    "Rate limit exceeded.",
                );
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.setMetricRefreshDemand([
            {
                pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
                metricKeys: ["cpu.temp"],
                intervalMilliseconds: 1000,
            },
        ]),
        /RESOURCE_EXHAUSTED/u,
    );

    assert.equal(client.getCachedStatus().state, "available");
    assert.equal(transport.resetCount, 0);
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
        monotonicNow: () => currentTimestampMilliseconds,
        wallClockNow: () => currentTimestampMilliseconds,
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

test("windows helper connects on the next steady retry once the Helper is installed", async () => {
    // The steady retry is also the install detector, so installing the Helper
    // must be noticed by the very next dial with no dependency on the service
    // probe updating first. The delay assertion pins the shipped cadence: it is
    // the longest a user who just installed the Helper can wait for metrics,
    // and the whole-session poll rate for the majority who never install it.
    let currentTimestampMilliseconds = 1000;
    let isHelperInstalled = false;
    const retryTimer = new FakeDescriptorPreloadTimer();
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        if (!isHelperInstalled) {
            throw createGrpcServiceError(grpcStatus.UNAVAILABLE, "ENOENT: pipe not found");
        }

        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                return buildDescriptorResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport, {}, {
        descriptorPreloadTimer: retryTimer,
        monotonicNow: () => currentTimestampMilliseconds,
        wallClockNow: () => currentTimestampMilliseconds,
        serviceStatusReader: { readStatus: async () => "notInstalled" },
    });
    const invalidations: SourceMetadataInvalidation[] = [];

    const unsubscribe = client.subscribeSourceMetadataInvalidations(invalidation => {
        invalidations.push(invalidation);
    });
    await drainAsyncOperations();
    currentTimestampMilliseconds += 60_001;
    retryTimer.runNext();
    await drainAsyncOperations();

    assert.equal(retryTimer.activeDelayMilliseconds(), 30_000);

    isHelperInstalled = true;
    currentTimestampMilliseconds += 30_000;
    retryTimer.runNext();
    await drainAsyncOperations();

    assert.equal(invalidations.length, 1);
    assert.equal(invalidations[0]?.reason, "descriptorLoaded");
    // Descriptors are loaded, so the loop is over: no further retry is pending.
    assert.equal(retryTimer.activeHandleCount(), 0);

    unsubscribe();
});

test("windows helper stops asking the service manager once notInstalled is confirmed", async () => {
    // On a machine that never installs the Helper, every pipe failure would
    // otherwise re-spawn an sc.exe that exits with error 1060, at every status
    // cache expiry, for the whole session. Once notInstalled is a confirmed
    // answer there is nothing left to ask: an install is detected by the next
    // dial succeeding, which writes the status back to running by itself.
    let currentTimestampMilliseconds = 1000;
    let statusProbeCount = 0;
    const retryTimer = new FakeDescriptorPreloadTimer();
    const transport = new FakeWindowsHelperGrpcTransport(() => {
        throw createGrpcServiceError(grpcStatus.UNAVAILABLE, "ENOENT: pipe not found");
    });
    const client = createClient(transport, {}, {
        descriptorPreloadTimer: retryTimer,
        monotonicNow: () => currentTimestampMilliseconds,
        wallClockNow: () => currentTimestampMilliseconds,
        serviceStatusReader: {
            readStatus: async () => {
                statusProbeCount += 1;
                return "notInstalled";
            },
        },
    });

    const unsubscribe = client.subscribeSourceMetadataInvalidations(() => undefined);
    await drainAsyncOperations();

    const probesBeforeConfirmation = statusProbeCount;
    assert.equal(probesBeforeConfirmation >= 1, true, "confirming notInstalled requires at least one probe");

    // Each retry lands after the status cache has expired, so without the gate
    // every one of them would spawn another service query.
    for (let retryCount = 0; retryCount < 3; retryCount++) {
        currentTimestampMilliseconds += 31_000;
        retryTimer.runNext();
        await drainAsyncOperations();
    }

    assert.equal(statusProbeCount, probesBeforeConfirmation);

    unsubscribe();
});

test("windows helper keeps asking the service manager unless notInstalled is confirmed", async () => {
    // A stopped service is the state where the service manager's answer still
    // matters: it is what separates telling the user to start the service from
    // telling them to install the Helper, and it is the state an uninstall
    // would be noticed in. An unknown state means the probe itself failed, and
    // a failed probe must not become the reason probing stops. Only the
    // confirmed notInstalled answer may stop it; this pins both of the states
    // the gate promises to leave alone.
    for (const serviceStatus of ["installedStopped", "unknown"] as const) {
        let currentTimestampMilliseconds = 1000;
        let statusProbeCount = 0;
        const retryTimer = new FakeDescriptorPreloadTimer();
        const transport = new FakeWindowsHelperGrpcTransport(() => {
            throw createGrpcServiceError(grpcStatus.UNAVAILABLE, "ENOENT: pipe not found");
        });
        const client = createClient(transport, {}, {
            descriptorPreloadTimer: retryTimer,
            monotonicNow: () => currentTimestampMilliseconds,
            wallClockNow: () => currentTimestampMilliseconds,
            serviceStatusReader: {
                readStatus: async () => {
                    statusProbeCount += 1;
                    return serviceStatus;
                },
            },
        });

        const unsubscribe = client.subscribeSourceMetadataInvalidations(() => undefined);
        await drainAsyncOperations();

        const probesBeforeSteadyState = statusProbeCount;

        for (let retryCount = 0; retryCount < 3; retryCount++) {
            currentTimestampMilliseconds += 31_000;
            retryTimer.runNext();
            await drainAsyncOperations();
        }

        assert.equal(
            statusProbeCount > probesBeforeSteadyState,
            true,
            `service status ${serviceStatus} must keep being probed so its status can change`,
        );

        unsubscribe();
    }
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
    assert.deepEqual(readResult.valueMetadata, []);
    assert.deepEqual(readResult.unavailableMetrics, []);
    assert.equal(client.getCachedStatus().state, "available");
    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "readMetricSnapshot"],
    );
});

test("windows helper source client keeps the helper version across metric reads", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    // Health is read once, at the protocol check. Every later success is a metric
    // read that carries no health payload, so a status rebuild that does not carry
    // the helper version forward erases it for the rest of the process: the
    // version would be known for a few milliseconds at connect time and never
    // again. Anything that has to know which Helper is installed, such as the
    // update notice, would then see nothing at all.
    await client.readSnapshot(["cpu.usage_percent"]);

    assert.equal(client.getCachedStatus().helperVersion, "0.0.0-test");

    await client.readSnapshot(["cpu.usage_percent"]);
    await client.readSnapshot(["cpu.usage_percent"]);

    assert.equal(client.getCachedStatus().helperVersion, "0.0.0-test");
    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "readMetricSnapshot", "readMetricSnapshot", "readMetricSnapshot"],
    );
});

test("windows helper source client re-reads the helper version after the pipe drops", async () => {
    let nowMilliseconds = 1000;
    let isHelperReachable = true;
    let installedHelperVersion = "0.1.0";
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        if (!isHelperReachable) {
            throw new Error("pipe unavailable");
        }

        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse(SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION, installedHelperVersion);
            case "readMetricSnapshot":
                return buildSnapshotResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(
        transport,
        { healthMilliseconds: 10, readSnapshotMilliseconds: 10 },
        { monotonicNow: () => nowMilliseconds, wallClockNow: () => nowMilliseconds },
    );

    await client.readSnapshot(["cpu.usage_percent"]);

    assert.equal(client.getCachedStatus().helperVersion, "0.1.0");

    // This is what installing a Helper update looks like from here: the service
    // restarts, the pipe drops, and the helper that comes back is a different
    // build. Nothing in a metric read says so, and the protocol check that would
    // have asked is satisfied from the connection that just died.
    isHelperReachable = false;
    await assert.rejects(async () => await client.readSnapshot(["cpu.usage_percent"]));

    nowMilliseconds += MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    isHelperReachable = true;
    installedHelperVersion = "0.2.0";

    await client.readSnapshot(["cpu.usage_percent"]);

    // Carrying "0.1.0" across the restart would keep telling this user to install
    // the update they just installed.
    assert.equal(client.getCachedStatus().helperVersion, "0.2.0");
    assert.deepEqual(
        transport.requests.map(request => request.method),
        [
            "getSourceHealth",
            "readMetricSnapshot",
            "readMetricSnapshot",
            "getSourceHealth",
            "readMetricSnapshot",
        ],
    );
});

test("windows helper source client records missing snapshot responses as source errors", async () => {
    const nowMilliseconds = 1000;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return create(ReadMetricSnapshotResponseSchema);
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport, {}, {
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /without a snapshot/u,
    );

    assert.deepEqual(client.getCachedStatus(), {
        state: "unavailable",
        reason: "sourceError",
        retryAfterTimestampMilliseconds: nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
        lastErrorCode: "missing_snapshot",
        lastErrorMessage: "Windows source returned a snapshot response without a snapshot.",
        lastFailureAtTimestampMilliseconds: nowMilliseconds,
    });
});

test("windows helper source client maps value metadata and unavailable metric reports", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse({
                    valueMetadata: create(MetricValueMetadataSchema, {
                        freshness: ProtoMetricValueFreshness.RETAINED,
                        retainedAgeMilliseconds: 1500,
                    }),
                    valueProvenance: [
                        create(HelperMetricValueProvenanceSchema, {
                            metricId: "cpu.usage_percent",
                            rawSensorIdentity: {
                                sourceSensorId: "lhm:/cpu/0/load/0",
                                hardwareId: "/cpu/0",
                                hardwareName: "CPU",
                                hardwareType: "Cpu",
                                sensorName: "CPU Total",
                                sourceSensorType: "Load",
                            },
                        }),
                    ],
                    unavailableMetrics: [
                        create(HelperMetricUnavailableReportSchema, {
                            report: create(MetricUnavailableReportSchema, {
                                metricId: "cpu.power",
                                reason: ProtoMetricUnavailableReason.NO_SOURCE_READING,
                            }),
                        }),
                        create(HelperMetricUnavailableReportSchema, {
                            report: create(MetricUnavailableReportSchema, {
                                metricId: "cpu.temp",
                                reason: ProtoMetricUnavailableReason.PENDING_REFRESH,
                            }),
                        }),
                    ],
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.usage_percent", "cpu.power", "cpu.temp"]);

    assert.deepEqual(readResult.valueMetadata, [{
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
    assert.deepEqual(readResult.unavailableMetrics, [
        {
            metricId: "cpu.power",
            reason: "noSourceReading",
        },
        {
            metricId: "cpu.temp",
            reason: "pendingRefresh",
        },
    ]);
});

test("windows helper source client drops inconsistent helper metric reports", async () => {
    const validProvenance = create(HelperMetricValueProvenanceSchema, {
        metricId: "cpu.usage_percent",
        rawSensorIdentity: {
            sourceSensorId: "lhm:/cpu/0/load/0",
            hardwareId: "/cpu/0",
            hardwareName: "CPU",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
        },
    });
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse({
                    valueProvenance: [
                        validProvenance,
                        validProvenance,
                        create(HelperMetricValueProvenanceSchema, {
                            metricId: "cpu.power",
                        }),
                    ],
                    unavailableMetrics: [
                        create(HelperMetricUnavailableReportSchema, {
                            report: create(MetricUnavailableReportSchema, {
                                metricId: "cpu.usage_percent",
                                reason: ProtoMetricUnavailableReason.INVALID_VALUE,
                            }),
                        }),
                        create(HelperMetricUnavailableReportSchema, {
                            report: create(MetricUnavailableReportSchema, {
                                metricId: "cpu.power",
                                reason: ProtoMetricUnavailableReason.NO_SOURCE_READING,
                            }),
                        }),
                        create(HelperMetricUnavailableReportSchema, {
                            report: create(MetricUnavailableReportSchema, {
                                metricId: "cpu.power",
                                reason: ProtoMetricUnavailableReason.EXPIRED,
                            }),
                        }),
                        create(HelperMetricUnavailableReportSchema, {
                            report: create(MetricUnavailableReportSchema, {
                                metricId: "not.requested",
                                reason: ProtoMetricUnavailableReason.NO_SOURCE_READING,
                            }),
                        }),
                    ],
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.usage_percent", "cpu.power"]);

    assert.deepEqual(readResult.valueMetadata, [{
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
        reason: "noSourceReading",
    }]);
});

test("windows helper source client treats future freshness enum values as display-only", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse({
                    valueMetadata: create(MetricValueMetadataSchema, {
                        freshness: 99 as ProtoMetricValueFreshness,
                    }),
                });
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const readResult = await client.readSnapshot(["cpu.usage_percent"]);

    assert.deepEqual(readResult.valueMetadata, [{
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
                        create(HelperMetricUnavailableReportSchema, {
                            report: create(MetricUnavailableReportSchema, {
                                metricId: "cpu.temp",
                                reason: 99 as ProtoMetricUnavailableReason,
                            }),
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

test("windows helper source client records missing descriptor snapshots as source errors", async () => {
    const nowMilliseconds = 1000;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                return create(ListMetricDescriptorsResponseSchema);
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = createClient(transport, {}, {
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
    });

    await assert.rejects(
        async () => await client.listMetricDescriptors(["cpu.usage_percent"]),
        /without a descriptor snapshot/u,
    );

    assert.deepEqual(client.getCachedStatus(), {
        state: "unavailable",
        reason: "sourceError",
        retryAfterTimestampMilliseconds: nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
        lastErrorCode: "missing_descriptor_snapshot",
        lastErrorMessage: "Windows source returned a descriptor response without a descriptor snapshot.",
        lastFailureAtTimestampMilliseconds: nowMilliseconds,
    });
});

test("windows helper source client drops descriptors without raw sensor identity", async () => {
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                return buildHealthResponse();
            case "listMetricDescriptors":
                return buildDescriptorResponse({
                    descriptors: [create(HelperMetricDescriptorSchema, {
                        descriptor: create(MetricDescriptorSchema, {
                            metricId: "cpu.usage_percent",
                            pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
                            valueKind: ProtoMetricValueKind.SCALAR,
                            unit: MetricUnit.PERCENT,
                            metricIdKind: ProtoMetricIdKind.STABLE_ALIAS,
                        }),
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
    const transport = new FakeWindowsHelperGrpcTransport(() => buildHealthResponse("2"));
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
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

test("windows helper source client recovers after protocol mismatch cooldown", async () => {
    let nowMilliseconds = 1000;
    let healthRequestCount = 0;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                healthRequestCount += 1;
                return healthRequestCount === 1
                    ? buildHealthResponse("2")
                    : buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
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

    nowMilliseconds += UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS;

    const readResult = await client.readSnapshot(["cpu.usage_percent"]);

    assert.equal(readResult.snapshot.metrics["cpu.usage_percent"]?.value.value, 42);
    assert.deepEqual(client.getCachedStatus(), {
        state: "available",
        protocolVersion: SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
        // The recovering health check reported this version, and the metric read
        // after it must not throw it away.
        helperVersion: "0.0.0-test",
        lastSuccessAtTimestampMilliseconds: nowMilliseconds,
    });
    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "getSourceHealth", "readMetricSnapshot"],
    );
});

test("windows helper source client cools down unavailable helper retries", async () => {
    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(new Error("pipe unavailable"));
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
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

test("windows helper source client clears transient unavailable cooldown after process resume", async () => {
    const nowMilliseconds = 1000;
    let healthRequestCount = 0;
    const transport = new FakeWindowsHelperGrpcTransport(request => {
        switch (request.method) {
            case "getSourceHealth":
                healthRequestCount += 1;
                if (healthRequestCount === 1) {
                    throw createNodeError("ECONNRESET", "connection reset");
                }
                return buildHealthResponse();
            case "readMetricSnapshot":
                return buildSnapshotResponse();
            default:
                throw new Error(`Unexpected request: ${request.method ?? "empty"}`);
        }
    });
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /still inside retry cooldown/u,
    );
    assert.equal(transport.requests.length, 1);

    client.notifyProcessResumed();
    const readResult = await client.readSnapshot(["cpu.usage_percent"]);

    assert.equal(readResult.snapshot.metrics["cpu.usage_percent"]?.value.value, 42);
    assert.deepEqual(
        transport.requests.map(request => request.method),
        ["getSourceHealth", "getSourceHealth", "readMetricSnapshot"],
    );
    assert.equal(client.getCachedStatus().retryAfterTimestampMilliseconds, undefined);
});

test("windows helper source client keeps resume recovery failures on the first cooldown rung", async () => {
    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(createNodeError("ECONNRESET", "connection reset"));
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    client.notifyProcessResumed();
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );
    assert.equal(transport.requestCount, 2);

    nowMilliseconds += HELPER_RESUME_RECOVERY_GRACE_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );
});

test("windows helper source client keeps startup recovery failures on the first cooldown rung", async () => {
    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(createNodeError("ECONNRESET", "connection reset"));
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );
    assert.equal(transport.requestCount, 2);
});

test("windows helper source client keeps pipe-missing retries fast during resume recovery grace", async () => {
    let nowMilliseconds = 1000;
    const pipeMissingError = createGrpcServiceError(grpcStatus.UNAVAILABLE, "ENOENT: pipe not found");
    const transport = new RejectingTransport(pipeMissingError);
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    client.notifyProcessResumed();
    nowMilliseconds += ACTIVE_HELPER_PIPE_RETRY_WINDOW_MILLISECONDS + 10000;

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe not found/u,
    );

    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + ACTIVE_HELPER_PIPE_RETRY_MILLISECONDS,
    );
});

test("windows helper source client uses active fast retry when the pipe is missing", async () => {
    let nowMilliseconds = 1000;
    const pipeMissingError = createGrpcServiceError(grpcStatus.UNAVAILABLE, "ENOENT: pipe not found");
    const transport = new RejectingTransport(pipeMissingError);
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
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
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
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
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    nowMilliseconds += HELPER_RESUME_RECOVERY_GRACE_MILLISECONDS + 1;

    await assert.rejects(
        async () => await client.checkHealth(),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.checkHealth(),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + ESCALATED_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += ESCALATED_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.checkHealth(),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.checkHealth(),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );
});

test("windows helper source client keeps active demand cooldown below the helper demand ttl", async () => {
    assert.ok(ACTIVE_HELPER_DEMAND_UNAVAILABLE_RETRY_CAP_MILLISECONDS < HELPER_REFRESH_DEMAND_TTL_MILLISECONDS);

    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(createNodeError("ECONNRESET", "connection reset"));
    const client = new WindowsHelperSourceClient({
        transport,
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
        serviceStatusReader: UNKNOWN_SERVICE_STATUS_READER,
    });

    nowMilliseconds += HELPER_RESUME_RECOVERY_GRACE_MILLISECONDS + 1;

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    );

    nowMilliseconds += INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + ACTIVE_HELPER_DEMAND_UNAVAILABLE_RETRY_CAP_MILLISECONDS,
    );

    nowMilliseconds += ACTIVE_HELPER_DEMAND_UNAVAILABLE_RETRY_CAP_MILLISECONDS;
    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /connection reset/u,
    );
    assert.equal(
        client.getCachedStatus().retryAfterTimestampMilliseconds,
        nowMilliseconds + ACTIVE_HELPER_DEMAND_UNAVAILABLE_RETRY_CAP_MILLISECONDS,
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
        monotonicNow: () => nowMilliseconds,
        wallClockNow: () => nowMilliseconds,
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
        // The reset dropped the connection the helper identified itself on, so
        // recovering re-reads health and learns who it is talking to now.
        helperVersion: "0.0.0-test",
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
    | { readonly method: "readMetricSnapshot"; readonly value: ReadMetricSnapshotRequest }
    | { readonly method: "setMetricRefreshDemand"; readonly value: SetMetricRefreshDemandRequest };

type FakeWindowsHelperGrpcResponse =
    | GetSourceHealthResponse
    | ListMetricDescriptorsResponse
    | ReadMetricSnapshotResponse
    | SetMetricRefreshDemandResponse;

class FakeWindowsHelperGrpcTransport implements WindowsHelperGrpcTransport {
    readonly requests: FakeWindowsHelperGrpcRequest[] = [];
    resetCount = 0;

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

    async setMetricRefreshDemand(
        request: SetMetricRefreshDemandRequest,
    ): Promise<SetMetricRefreshDemandResponse> {
        const fakeRequest = { method: "setMetricRefreshDemand", value: request } as const;
        this.requests.push(fakeRequest);

        return this.responseFactory(fakeRequest) as SetMetricRefreshDemandResponse;
    }

    reset(): void {
        this.resetCount += 1;
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

    async setMetricRefreshDemand(
        _request: SetMetricRefreshDemandRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<SetMetricRefreshDemandResponse> {
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

    async setMetricRefreshDemand(): Promise<SetMetricRefreshDemandResponse> {
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
        "descriptorPreloadRetryMilliseconds" | "descriptorPreloadTimer" | "monotonicNow" | "serviceStatusReader" | "wallClockNow"
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
    helperVersion = "0.0.0-test",
): GetSourceHealthResponse {
    return create(GetSourceHealthResponseSchema, {
        sourceId: WINDOWS_HELPER_SOURCE_ID,
        protocolVersion,
        helperVersion,
    });
}

function buildSnapshotResponse(
    options: {
        readonly valueMetadata?: ProtoMetricValueMetadata;
        readonly valueProvenance?: readonly ProtoHelperMetricValueProvenance[];
        readonly unavailableMetrics?: readonly ProtoHelperMetricUnavailableReport[];
    } = {},
): ReadMetricSnapshotResponse {
    const cpuUsageValue = buildScalarMetricValue(42, { unit: MetricUnit.PERCENT });
    cpuUsageValue.metadata = options.valueMetadata;

    return create(ReadMetricSnapshotResponseSchema, {
        snapshot: buildMetricSnapshot({
            timestampMilliseconds: 1000,
            metrics: {
                "cpu.usage_percent": cpuUsageValue,
            },
        }),
        valueProvenance: [...(options.valueProvenance ?? [])],
        unavailableMetrics: [...(options.unavailableMetrics ?? [])],
    });
}

function buildDescriptorResponse(
    options: {
        readonly descriptorFingerprint?: string;
        readonly descriptors?: readonly ProtoHelperMetricDescriptor[];
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
}): ProtoHelperMetricDescriptor {
    return create(HelperMetricDescriptorSchema, {
        rawSensorIdentity: {
            sourceSensorId: `lhm:/${options.metricId}`,
            hardwareId: "hardware-1",
            hardwareName: "CPU",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
        },
        descriptor: create(MetricDescriptorSchema, {
            metricId: options.metricId,
            pollingGroupId: options.pollingGroupId ?? defaultHelperPollingGroupId(options.metricId),
            valueKind: ProtoMetricValueKind.SCALAR,
            unit: MetricUnit.PERCENT,
            metricIdKind: ProtoMetricIdKind.STABLE_ALIAS,
        }),
    });
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
