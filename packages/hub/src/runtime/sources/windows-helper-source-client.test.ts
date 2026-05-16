import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import assert from "node:assert/strict";
import test from "node:test";
import {
    GetSourceHealthResponseSchema,
    ReadMetricSnapshotResponseSchema,
    SourceErrorSchema,
} from "../../generated/shometrics/v1/source_api_pb.js";
import {
    SourceIpcRequestSchema,
    SourceIpcResponseSchema,
    type SourceIpcRequest,
    type SourceIpcResponse,
} from "../../generated/shometrics/v1/source_ipc_pb.js";
import {
    buildMetricSnapshot,
    buildScalarMetricValue,
} from "./source.interface";
import {
    decodeSourceIpcFrame,
    encodeSourceIpcFrame,
    HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS,
    MAXIMUM_SOURCE_IPC_FRAME_BYTES,
    SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION,
    UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS,
    WindowsHelperSourceClient,
    type WindowsHelperPipeTransport,
    type WindowsHelperSourceClientOptions,
} from "./windows-helper-source-client";
import { WINDOWS_HELPER_SOURCE_ID } from "./source-ids";

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

    assert.equal(snapshot.sourceId, WINDOWS_HELPER_SOURCE_ID);
    assert.equal(snapshot.metrics["cpu.usage_percent"]?.data.case, "scalar");
    assert.equal(snapshot.metrics["cpu.usage_percent"]?.data.value, 42);
    assert.deepEqual(
        transport.requests.map(request => request.payload.case),
        ["getSourceHealth", "readMetricSnapshot"],
    );
});

test("windows helper source client rejects mismatched response request ids", async () => {
    const transport = new FakeWindowsHelperPipeTransport(request => buildHealthResponse(`${request.requestId}-other`));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.getHealth(),
        /request id mismatched/u,
    );
});

test("windows helper source client rejects malformed protobuf responses", async () => {
    const transport = new RawResponseTransport(new Uint8Array([255]));
    const client = createClient(transport);

    await assert.rejects(
        async () => await client.getHealth(),
        /Malformed Windows source IPC response/u,
    );
});

test("windows helper source client passes request timeouts to the transport", async () => {
    const transport = new NeverResolvingTransport();
    const client = createClient(transport, {
        healthMilliseconds: 123,
    });

    const requestPromise = client.getHealth();
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

    nowMilliseconds += HELPER_UNAVAILABLE_RETRY_COOLDOWN_MILLISECONDS;

    await assert.rejects(
        async () => await client.readSnapshot(["cpu.usage_percent"]),
        /pipe unavailable/u,
    );
    assert.equal(transport.requestCount, 2);
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
        async () => await client.getHealth(),
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
): WindowsHelperSourceClient {
    return new WindowsHelperSourceClient({
        transport,
        requestIdFactory: createRequestIdFactory(),
        timeouts,
    });
}

function createRequestIdFactory(): () => string {
    let requestIndex = 0;
    return () => {
        requestIndex += 1;
        return `request-${requestIndex}`;
    };
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
                    sourceId: "helper-service",
                    timestampMilliseconds: 1000,
                    metrics: {
                        "cpu.usage_percent": buildScalarMetricValue(42, { unit: "%" }),
                    },
                }),
            }),
        },
    });
}
