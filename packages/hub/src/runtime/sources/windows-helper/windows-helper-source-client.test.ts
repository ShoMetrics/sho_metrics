import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import assert from "node:assert/strict";
import test from "node:test";
import {
    GetSourceHealthResponseSchema,
    ListMetricDescriptorsResponseSchema,
    ReadMetricSnapshotResponseSchema,
    SourceErrorSchema,
} from "../../../generated/shometrics/v1/source_api_pb.js";
import {
    SourceIpcRequestSchema,
    SourceIpcResponseSchema,
    type SourceIpcRequest,
    type SourceIpcResponse,
} from "../../../generated/shometrics/v1/source_ipc_pb.js";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
    MetricIdKind,
    MetricUnit,
    MetricValueKind,
    readRequiredMetricSnapshotTimestampMilliseconds,
} from "../metric-source";
import type { SourceMetadataInvalidation } from "../source-planning-metadata";
import {
    decodeSourceIpcFrame,
    encodeSourceIpcFrame,
    HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS,
    MAXIMUM_SOURCE_IPC_FRAME_BYTES,
    PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS,
    SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
    UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS,
    WindowsHelperSourceClient,
    type WindowsHelperDescriptorPreloadTimer,
    type WindowsHelperDescriptorPreloadTimerHandle,
    type WindowsHelperPipeTransport,
    type WindowsHelperSourceClientOptions,
} from "./windows-helper-source-client";
import { WINDOWS_HELPER_SOURCE_ID } from "../source-ids";

const [
    INITIAL_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    ESCALATED_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    MAXIMUM_HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
] = HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS;

const CPU_HELPER_POLLING_GROUP_ID = "lhm:hardware:cpu";
const GPU_HELPER_POLLING_GROUP_ID = "lhm:hardware:gpu";

test("source IPC frame codec round-trips payload bytes", () => {
    const payload = new Uint8Array([1, 2, 3]);

    const frame = encodeSourceIpcFrame(payload);

    assert.deepEqual([...decodeSourceIpcFrame(frame)], [...payload]);
});

test("source IPC frame codec rejects empty payloads", () => {
    const frame = Buffer.alloc(4);

    assert.throws(
        () => decodeSourceIpcFrame(frame),
        /payload length must be greater than zero/u,
    );
});

test("source IPC frame codec rejects oversized payloads before decoding", () => {
    const frame = Buffer.alloc(4);
    frame.writeUInt32LE(MAXIMUM_SOURCE_IPC_FRAME_BYTES + 1, 0);

    assert.throws(
        () => decodeSourceIpcFrame(frame),
        /exceeds the maximum/u,
    );
});

test("windows helper waits for descriptor metadata before declaring helper groups", () => {
    const client = new WindowsHelperSourceClient({
        transport: new RejectingTransport(new Error("unused")),
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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                return buildDescriptorResponse(request.requestId);
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
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

test("windows helper keeps filtered descriptors when the catalog fingerprint is unchanged", async () => {
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                return buildDescriptorResponse(request.requestId, {
                    descriptors: request.payload.value.metricIds.map(metricId => buildDescriptor({ metricId })),
                });
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                descriptorRequestCount += 1;
                return descriptorRequestCount === 1
                    ? buildDescriptorResponse(request.requestId, {
                        descriptorFingerprint: "catalog-sha256-before",
                        descriptors: [buildDescriptor({ metricId: "cpu.usage_percent" })],
                    })
                    : buildDescriptorResponse(request.requestId, {
                        descriptorFingerprint: "catalog-sha256-after",
                        descriptors: [buildDescriptor({ metricId: "gpu.temp" })],
                    });
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                assert.deepEqual(request.payload.value.metricIds, []);
                return buildDescriptorResponse(request.requestId);
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
        }
    });
    const client = createClient(transport);
    const invalidations: SourceMetadataInvalidation[] = [];

    const unsubscribe = client.subscribeSourceMetadataInvalidations(invalidation => {
        invalidations.push(invalidation);
    });
    await drainAsyncOperations();

    assert.deepEqual(
        transport.requests.map(request => request.payload.case),
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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                healthRequestCount += 1;
                if (healthRequestCount === 1) {
                    throw new Error("helper is still starting");
                }

                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                return buildDescriptorResponse(request.requestId);
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
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
        transport.requests.map(request => request.payload.case),
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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                throw new Error("helper unavailable");
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                throw new Error("helper unavailable");
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
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
        transport.requests.map(request => request.payload.case),
        ["getSourceHealth"],
    );
});

test("windows helper forwards descriptor metadata invalidation to every listener", async () => {
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                return buildDescriptorResponse(request.requestId);
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
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
        transport.requests.map(request => request.payload.case),
        ["getSourceHealth", "listMetricDescriptors"],
    );

    unsubscribeFirst();
    unsubscribeSecond();
});

test("windows helper emits descriptor metadata changes only when fingerprint changes", async () => {
    let descriptorRequestCount = 0;
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                descriptorRequestCount += 1;
                return descriptorRequestCount <= 2
                    ? buildDescriptorResponse(request.requestId, {
                        descriptorFingerprint: "catalog-sha256-before",
                    })
                    : buildDescriptorResponse(request.requestId, {
                        descriptorFingerprint: "catalog-sha256-after",
                    });
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
        }
    });
    const client = createClient(transport);
    const invalidations: SourceMetadataInvalidation[] = [];

    const unsubscribe = client.subscribeSourceMetadataInvalidations(invalidation => {
        invalidations.push(invalidation);
    });
    await drainAsyncOperations();
    await client.listMetricDescriptors(["cpu.usage_percent"]);
    await client.listMetricDescriptors(["gpu.temp"]);

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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "readMetricSnapshot":
                assert.deepEqual(request.payload.value.metricIds, ["cpu.usage_percent"]);
                return buildSnapshotResponse(request.requestId);
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const snapshot = await client.readSnapshot(["cpu.usage_percent"]);

    assert.equal(readRequiredMetricSnapshotTimestampMilliseconds(snapshot), 1000);
    assert.equal(snapshot.metrics["cpu.usage_percent"]?.value.case, "scalar");
    assert.equal(snapshot.metrics["cpu.usage_percent"]?.value.value, 42);
    assert.equal(client.getCachedStatus().state, "available");
    assert.deepEqual(
        transport.requests.map(request => request.payload.case),
        ["getSourceHealth", "readMetricSnapshot"],
    );
});

test("windows helper source client returns descriptors with the catalog fingerprint", async () => {
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                assert.deepEqual(request.payload.value.metricIds, ["cpu.usage_percent"]);
                return buildDescriptorResponse(request.requestId);
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    const descriptorSnapshot = await client.listMetricDescriptors(["cpu.usage_percent"]);

    assert.equal(descriptorSnapshot.descriptorFingerprint, "catalog-sha256-test");
    assert.deepEqual(descriptorSnapshot.descriptors, [{
        metricId: "cpu.usage_percent",
        sourceSensorId: "lhm:/cpu.usage_percent",
        pollingGroupId: CPU_HELPER_POLLING_GROUP_ID,
        hardwareId: "hardware-1",
        hardwareName: "CPU",
        hardwareType: "Cpu",
        sensorName: "CPU Total",
        sourceSensorType: "Load",
        valueKind: MetricValueKind.SCALAR,
        unit: MetricUnit.PERCENT,
        metricIdKind: MetricIdKind.STABLE_ALIAS,
    }]);
});

test("windows helper source client rejects descriptors without polling group ids", async () => {
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "listMetricDescriptors":
                return buildDescriptorResponse(request.requestId, {
                    descriptors: [buildDescriptor({
                        metricId: "cpu.usage_percent",
                        pollingGroupId: "",
                    })],
                });
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
        }
    });
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.listMetricDescriptors(["cpu.usage_percent"]),
        /missing polling_group_id/u,
    );
});

test("windows helper source client rejects mismatched response request ids", async () => {
    const transport = new FakeWindowsHelperPipeTransport(request => buildHealthResponse(`${request.requestId}-other`));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.checkHealth(),
        /request id mismatched/u,
    );
});

test("windows helper source client rejects malformed protobuf responses", async () => {
    const transport = new RawResponseTransport(new Uint8Array([255]));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.checkHealth(),
        /Malformed Windows source IPC response/u,
    );
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
    const transport = new FakeWindowsHelperPipeTransport(request => buildHealthResponse(request.requestId, "2"));
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        requestIdFactory: createRequestIdFactory(),
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
        requestIdFactory: createRequestIdFactory(),
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

test("windows helper source client uses a long cooldown when the pipe is missing", async () => {
    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(createNodeError("ENOENT", "pipe not found"));
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        requestIdFactory: createRequestIdFactory(),
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
        retryAfterTimestampMilliseconds: 1000 + PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS,
        lastErrorCode: "ENOENT",
        lastFailureAtTimestampMilliseconds: 1000,
    });

    nowMilliseconds += PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS;

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe not found/u,
    );
    assert.equal(transport.requestCount, 2);
});

test("windows helper source client backs off repeated transient failures", async () => {
    let nowMilliseconds = 1000;
    const transport = new RejectingTransport(createNodeError("ECONNRESET", "connection reset"));
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        requestIdFactory: createRequestIdFactory(),
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
    const transport = new FakeWindowsHelperPipeTransport(request => {
        switch (request.payload.case) {
            case "getSourceHealth":
                return buildHealthResponse(request.requestId);
            case "readMetricSnapshot":
                readRequestCount += 1;
                if (readRequestCount === 1 || readRequestCount === 3) {
                    throw createNodeError("ECONNRESET", "connection reset");
                }

                return buildSnapshotResponse(request.requestId);
            default:
                throw new Error(`Unexpected request: ${request.payload.case ?? "empty"}`);
        }
    });
    const client = new WindowsHelperSourceClient({
        transport,
        now: () => nowMilliseconds,
        requestIdFactory: createRequestIdFactory(),
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

test("windows helper source client rejects source error responses", async () => {
    const transport = new FakeWindowsHelperPipeTransport(request => create(SourceIpcResponseSchema, {
        requestId: request.requestId,
        payload: {
            case: "error",
            value: create(SourceErrorSchema, {
                code: "source_unavailable",
                message: "LHM unavailable",
            }),
        },
    }));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.checkHealth(),
        /source_unavailable/u,
    );
});

class FakeWindowsHelperPipeTransport implements WindowsHelperPipeTransport {
    readonly requests: SourceIpcRequest[] = [];

    constructor(private readonly responseFactory: (request: SourceIpcRequest) => SourceIpcResponse) {}

    async send(payload: Uint8Array): Promise<Uint8Array> {
        const request = fromBinary(SourceIpcRequestSchema, payload);
        this.requests.push(request);

        return toBinary(SourceIpcResponseSchema, this.responseFactory(request));
    }
}

class RawResponseTransport implements WindowsHelperPipeTransport {
    constructor(private readonly responseBytes: Uint8Array) {}

    async send(): Promise<Uint8Array> {
        return this.responseBytes;
    }
}

class NeverResolvingTransport implements WindowsHelperPipeTransport {
    timeoutMilliseconds = 0;
    private rejectRequest: ((error: Error) => void) | undefined;

    async send(
        _payload: Uint8Array,
        options: { readonly timeoutMilliseconds: number },
    ): Promise<Uint8Array> {
        this.timeoutMilliseconds = options.timeoutMilliseconds;

        return await new Promise<Uint8Array>((_resolve, reject) => {
            this.rejectRequest = reject;
        });
    }

    reject(error: Error): void {
        this.rejectRequest?.(error);
    }
}

class RejectingTransport implements WindowsHelperPipeTransport {
    requestCount = 0;

    constructor(private readonly error: Error) {}

    async send(): Promise<Uint8Array> {
        this.requestCount += 1;
        throw this.error;
    }
}

function createClient(
    transport: WindowsHelperPipeTransport,
    timeouts: WindowsHelperSourceClientOptions["timeouts"] = {},
    options: Pick<
        WindowsHelperSourceClientOptions,
        "descriptorPreloadRetryMilliseconds" | "descriptorPreloadTimer" | "now"
    > = {},
): WindowsHelperSourceClient {
    return new WindowsHelperSourceClient({
        transport,
        requestIdFactory: createRequestIdFactory(),
        timeouts,
        ...options,
    });
}

function createRequestIdFactory(): () => string {
    let requestIndex = 0;
    return () => {
        requestIndex += 1;
        return `request-${requestIndex}`;
    };
}

function createNodeError(code: string, message: string): Error {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    return error;
}

async function drainAsyncOperations(): Promise<void> {
    for (let step = 0; step < 10; step += 1) {
        await Promise.resolve();
    }
}

function buildHealthResponse(
    requestId: string,
    protocolVersion = SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
): SourceIpcResponse {
    return create(SourceIpcResponseSchema, {
        requestId,
        payload: {
            case: "getSourceHealth",
            value: create(GetSourceHealthResponseSchema, {
                sourceId: WINDOWS_HELPER_SOURCE_ID,
                protocolVersion,
                helperVersion: "0.0.0-test",
            }),
        },
    });
}

function buildSnapshotResponse(requestId: string): SourceIpcResponse {
    return create(SourceIpcResponseSchema, {
        requestId,
        payload: {
            case: "readMetricSnapshot",
            value: create(ReadMetricSnapshotResponseSchema, {
                snapshot: buildMetricSnapshot({
                    timestampMilliseconds: 1000,
                    metrics: {
                        "cpu.usage_percent": buildScalarMetricValue(42, { unit: MetricUnit.PERCENT }),
                    },
                }),
            }),
        },
    });
}

function buildDescriptorResponse(
    requestId: string,
    options: {
        readonly descriptorFingerprint?: string;
        readonly descriptors?: readonly ReturnType<typeof buildDescriptor>[];
    } = {},
): SourceIpcResponse {
    return create(SourceIpcResponseSchema, {
        requestId,
        payload: {
            case: "listMetricDescriptors",
            value: create(ListMetricDescriptorsResponseSchema, {
                descriptorSnapshot: {
                    descriptorFingerprint: options.descriptorFingerprint ?? "catalog-sha256-test",
                    descriptors: [...(options.descriptors ?? [buildDescriptor({ metricId: "cpu.usage_percent" })])],
                },
            }),
        },
    });
}

function buildDescriptor(options: {
    readonly metricId: string;
    readonly pollingGroupId?: string;
}): {
    readonly metricId: string;
    readonly sourceSensorId: string;
    readonly pollingGroupId: string;
    readonly hardwareId: string;
    readonly hardwareName: string;
    readonly hardwareType: string;
    readonly sensorName: string;
    readonly sourceSensorType: string;
    readonly valueKind: MetricValueKind;
    readonly unit: MetricUnit;
    readonly metricIdKind: MetricIdKind;
} {
    return {
        metricId: options.metricId,
        sourceSensorId: `lhm:/${options.metricId}`,
        pollingGroupId: options.pollingGroupId ?? defaultHelperPollingGroupId(options.metricId),
        hardwareId: "hardware-1",
        hardwareName: "CPU",
        hardwareType: "Cpu",
        sensorName: "CPU Total",
        sourceSensorType: "Load",
        valueKind: MetricValueKind.SCALAR,
        unit: MetricUnit.PERCENT,
        metricIdKind: MetricIdKind.STABLE_ALIAS,
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
