import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import {
    GetSourceHealthRequestSchema,
    ListMetricDescriptorsRequestSchema,
    ReadMetricSnapshotRequestSchema,
    type GetSourceHealthResponse,
    type MetricDescriptor as ProtoMetricDescriptor,
    type SourceWarning as ProtoSourceWarning,
} from "../../generated/shometrics/v1/source_api_pb.js";
import {
    SourceIpcRequestSchema,
    SourceIpcResponseSchema,
    type SourceIpcRequest,
    type SourceIpcResponse,
} from "../../generated/shometrics/v1/source_ipc_pb.js";
import {
    buildMetricSnapshot,
    type MetricSnapshot,
} from "./metric-source";
import type {
    MetricDescriptor,
    SourceClient,
    SourceHealth,
    SourceClientStatus,
    SourceClientStatusReason,
    SourceWarning,
} from "./source-client";
import { WINDOWS_HELPER_SOURCE_ID } from "./source-ids";

/** Named pipe path used by the Windows helper service. */
export const DEFAULT_WINDOWS_HELPER_PIPE_PATH = "\\\\.\\pipe\\ShoMetrics.Source.Windows.v1";

/** Source API version supported by this Node adapter. */
export const SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION = "1";

/** Maximum protobuf payload size accepted by the local source IPC frame codec. */
export const MAXIMUM_SOURCE_IPC_FRAME_BYTES = 1024 * 1024;

/** Minimum cooldown before retrying helper health after protocol incompatibility. */
export const UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS = 60000;

/** Cooldown before retrying when the Windows helper named pipe is missing. */
export const PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS = 300000;

/** Retry cooldowns for transient helper failures, indexed by consecutive failure count. */
export const HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS = [5000, 15000, 60000] as const;

const SOURCE_IPC_LENGTH_PREFIX_BYTES = 4;
const DEFAULT_HEALTH_TIMEOUT_MILLISECONDS = 750;
const DEFAULT_READ_SNAPSHOT_TIMEOUT_MILLISECONDS = 2000;
const DEFAULT_LIST_DESCRIPTORS_TIMEOUT_MILLISECONDS = 5000;

/** Timeout configuration for the Windows helper source client. */
export interface WindowsHelperSourceTimeouts {
    readonly healthMilliseconds: number;
    readonly readSnapshotMilliseconds: number;
    readonly listDescriptorsMilliseconds: number;
}

/** Options passed to a source IPC transport request. */
export interface WindowsHelperPipeTransportRequestOptions {
    readonly pipePath: string;
    readonly timeoutMilliseconds: number;
}

/** Byte transport used by the Windows helper source client. */
export interface WindowsHelperPipeTransport {
    /** Sends one protobuf payload and resolves with one protobuf response payload. */
    send(
        payload: Uint8Array,
        options: WindowsHelperPipeTransportRequestOptions,
    ): Promise<Uint8Array>;

    /** Releases transport-owned sockets or handles. */
    dispose?(): void;
}

/** Options for the Windows helper source client. */
export interface WindowsHelperSourceClientOptions {
    readonly pipePath?: string;
    readonly transport?: WindowsHelperPipeTransport;
    readonly requestIdFactory?: () => string;
    readonly now?: () => number;
    readonly timeouts?: Partial<WindowsHelperSourceTimeouts>;
}

/** Encodes one source IPC protobuf payload using uint32 little-endian framing. */
export function encodeSourceIpcFrame(payload: Uint8Array): Uint8Array {
    validateSourceIpcPayloadLength(payload.byteLength);

    const frame = Buffer.allocUnsafe(SOURCE_IPC_LENGTH_PREFIX_BYTES + payload.byteLength);
    frame.writeUInt32LE(payload.byteLength, 0);
    frame.set(payload, SOURCE_IPC_LENGTH_PREFIX_BYTES);

    return frame;
}

/** Decodes one exact source IPC frame and returns the protobuf payload bytes. */
export function decodeSourceIpcFrame(frame: Uint8Array): Uint8Array {
    if (frame.byteLength < SOURCE_IPC_LENGTH_PREFIX_BYTES) {
        throw new Error("Source IPC frame is missing the length prefix.");
    }

    const payloadLength = readLittleEndianUint32(frame, 0);
    validateSourceIpcPayloadLength(payloadLength);

    const expectedFrameLength = SOURCE_IPC_LENGTH_PREFIX_BYTES + payloadLength;
    if (frame.byteLength !== expectedFrameLength) {
        throw new Error("Source IPC frame length does not match the payload length prefix.");
    }

    return frame.subarray(SOURCE_IPC_LENGTH_PREFIX_BYTES);
}

/** Sends source API requests to the installed Windows helper over a named pipe. */
export class WindowsHelperSourceClient implements SourceClient {
    readonly sourceId = WINDOWS_HELPER_SOURCE_ID;

    private readonly pipePath: string;
    private readonly transport: WindowsHelperPipeTransport;
    private readonly requestIdFactory: () => string;
    private readonly now: () => number;
    private readonly timeouts: WindowsHelperSourceTimeouts;
    private protocolCompatibility: "unknown" | "supported" = "unknown";
    private protocolCheckPromise: Promise<void> | undefined;
    private unsupportedProtocolRetryAfterMilliseconds = 0;
    private helperUnavailableRetryAfterMilliseconds = 0;
    private helperUnavailableFailureCount = 0;
    private status: SourceClientStatus = { state: "unknown" };

    constructor(options: WindowsHelperSourceClientOptions = {}) {
        this.pipePath = options.pipePath ?? DEFAULT_WINDOWS_HELPER_PIPE_PATH;
        this.transport = options.transport ?? new NodeWindowsHelperPipeTransport();
        this.requestIdFactory = options.requestIdFactory ?? randomUUID;
        this.now = options.now ?? Date.now;
        this.timeouts = {
            healthMilliseconds: options.timeouts?.healthMilliseconds
                ?? DEFAULT_HEALTH_TIMEOUT_MILLISECONDS,
            readSnapshotMilliseconds: options.timeouts?.readSnapshotMilliseconds
                ?? DEFAULT_READ_SNAPSHOT_TIMEOUT_MILLISECONDS,
            listDescriptorsMilliseconds: options.timeouts?.listDescriptorsMilliseconds
                ?? DEFAULT_LIST_DESCRIPTORS_TIMEOUT_MILLISECONDS,
        };
    }

    async readSnapshot(metricKeys: readonly string[]): Promise<MetricSnapshot> {
        await this.ensureProtocolSupported();

        let response: SourceIpcResponse;
        try {
            response = await this.sendSourceIpcRequest({
                case: "readMetricSnapshot",
                value: create(ReadMetricSnapshotRequestSchema, {
                    metricIds: [...metricKeys],
                    includeDescriptors: false,
                }),
            }, this.timeouts.readSnapshotMilliseconds);
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        if (response.payload.case !== "readMetricSnapshot") {
            throw new Error(`Unexpected Windows source response: ${response.payload.case ?? "empty"}.`);
        }

        const snapshot = response.payload.value.snapshot;
        if (!snapshot) {
            throw new Error("Windows source returned a snapshot response without a snapshot.");
        }

        this.recordHelperRequestSuccess();

        return buildMetricSnapshot({
            sourceId: this.sourceId,
            timestampMilliseconds: Number(snapshot.timestampMs),
            metrics: snapshot.metrics,
        });
    }

    async listMetricDescriptors(metricKeys: readonly string[]): Promise<readonly MetricDescriptor[]> {
        await this.ensureProtocolSupported();

        let response: SourceIpcResponse;
        try {
            response = await this.sendSourceIpcRequest({
                case: "listMetricDescriptors",
                value: create(ListMetricDescriptorsRequestSchema, {
                    metricIds: [...metricKeys],
                }),
            }, this.timeouts.listDescriptorsMilliseconds);
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        if (response.payload.case !== "listMetricDescriptors") {
            throw new Error(`Unexpected Windows source response: ${response.payload.case ?? "empty"}.`);
        }

        this.recordHelperRequestSuccess();

        return response.payload.value.descriptors.map(toRuntimeMetricDescriptor);
    }

    async checkHealth(): Promise<SourceHealth> {
        let health: SourceHealth;
        try {
            health = await this.readSourceHealth();
        } catch (error) {
            this.recordHelperRequestFailure(error);
            throw error;
        }

        if (health.protocolVersion === SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION) {
            this.protocolCompatibility = "supported";
            this.recordHelperRequestSuccess();
        } else {
            this.recordUnsupportedProtocol("unsupported_protocol");
        }

        return health;
    }

    private async readSourceHealth(): Promise<SourceHealth> {
        const response = await this.sendSourceIpcRequest({
            case: "getSourceHealth",
            value: create(GetSourceHealthRequestSchema),
        }, this.timeouts.healthMilliseconds);

        if (response.payload.case !== "getSourceHealth") {
            throw new Error(`Unexpected Windows source response: ${response.payload.case ?? "empty"}.`);
        }

        return toRuntimeSourceHealth(response.payload.value);
    }

    dispose(): void {
        this.transport.dispose?.();
    }

    getCachedStatus(): SourceClientStatus {
        return { ...this.status };
    }

    private async ensureProtocolSupported(): Promise<void> {
        const nowMilliseconds = this.now();

        if (nowMilliseconds < this.unsupportedProtocolRetryAfterMilliseconds) {
            throw new Error("Windows source protocol is unsupported and still inside retry cooldown.");
        }

        if (nowMilliseconds < this.helperUnavailableRetryAfterMilliseconds) {
            throw new Error("Windows helper is unavailable and still inside retry cooldown.");
        }

        if (this.protocolCompatibility === "supported") {
            return;
        }

        this.protocolCheckPromise ??= this.readAndValidateHealth()
            .finally(() => {
                this.protocolCheckPromise = undefined;
            });

        await this.protocolCheckPromise;
    }

    private async readAndValidateHealth(): Promise<void> {
        const health = await this.checkHealth();

        if (health.protocolVersion !== SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION) {
            throw new Error([
                "Unsupported Windows source protocol.",
                `expected=${SUPPORTED_WINDOWS_SOURCE_PROTOCOL_VERSION}`,
                `actual=${health.protocolVersion ?? ""}`,
            ].join(" "));
        }
    }

    private async sendSourceIpcRequest(
        payload: SourceIpcRequest["payload"],
        timeoutMilliseconds: number,
    ): Promise<SourceIpcResponse> {
        const requestId = this.requestIdFactory();
        const request = create(SourceIpcRequestSchema, {
            requestId,
            payload,
        });
        const requestBytes = toBinary(SourceIpcRequestSchema, request);
        const responseBytes = await this.transport.send(requestBytes, {
            pipePath: this.pipePath,
            timeoutMilliseconds,
        });
        const response = parseSourceIpcResponse(responseBytes);

        if (response.requestId !== requestId) {
            throw new Error("Windows source response request id mismatched the pending request.");
        }

        if (response.payload.case === "error") {
            if (response.payload.value.code === "unsupported_protocol") {
                this.recordUnsupportedProtocol(response.payload.value.code);
                throw new WindowsHelperSourceClientError([
                    "Windows source returned an error.",
                    `code=${response.payload.value.code}`,
                    `message=${response.payload.value.message}`,
                ].join(" "), response.payload.value.code, "protocolMismatch");
            }

            throw new WindowsHelperSourceClientError([
                "Windows source returned an error.",
                `code=${response.payload.value.code}`,
                `message=${response.payload.value.message}`,
            ].join(" "), response.payload.value.code, "sourceError");
        }

        if (response.payload.case === undefined) {
            throw new Error("Windows source returned an empty response payload.");
        }

        return response;
    }

    private recordUnsupportedProtocol(errorCode: string): void {
        const nowMilliseconds = this.now();
        this.protocolCompatibility = "unknown";
        this.unsupportedProtocolRetryAfterMilliseconds = nowMilliseconds
            + UNSUPPORTED_PROTOCOL_RETRY_COOLDOWN_MILLISECONDS;
        this.status = {
            state: "unsupported",
            reason: "protocolMismatch",
            retryAfterTimestampMilliseconds: this.unsupportedProtocolRetryAfterMilliseconds,
            lastErrorCode: errorCode,
            lastFailureAtTimestampMilliseconds: nowMilliseconds,
        };
    }

    private recordHelperRequestFailure(error: unknown): void {
        if (isUnsupportedProtocolError(error)) {
            return;
        }

        const nowMilliseconds = this.now();
        const failure = classifyHelperRequestFailure(error);
        const cooldownMilliseconds = failure.reason === "pipeMissing"
            ? PIPE_NOT_FOUND_RETRY_COOLDOWN_MILLISECONDS
            : this.nextUnavailableRetryCooldownMilliseconds();

        this.helperUnavailableRetryAfterMilliseconds = nowMilliseconds + cooldownMilliseconds;
        this.status = {
            state: "unavailable",
            reason: failure.reason,
            retryAfterTimestampMilliseconds: this.helperUnavailableRetryAfterMilliseconds,
            ...(failure.errorCode ? { lastErrorCode: failure.errorCode } : {}),
            lastFailureAtTimestampMilliseconds: nowMilliseconds,
        };
    }

    private recordHelperRequestSuccess(): void {
        this.unsupportedProtocolRetryAfterMilliseconds = 0;
        this.helperUnavailableRetryAfterMilliseconds = 0;
        this.helperUnavailableFailureCount = 0;
        this.status = {
            state: "available",
            lastSuccessAtTimestampMilliseconds: this.now(),
        };
    }

    private nextUnavailableRetryCooldownMilliseconds(): number {
        this.helperUnavailableFailureCount += 1;

        return selectHelperUnavailableRetryCooldownMilliseconds(this.helperUnavailableFailureCount);
    }
}

function selectHelperUnavailableRetryCooldownMilliseconds(failureCount: number): number {
    const maximumBackoffMilliseconds = HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[2];
    const backoffIndex = Math.min(
        Math.max(0, failureCount - 1),
        HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS.length - 1,
    );

    return HELPER_UNAVAILABLE_RETRY_BACKOFF_MILLISECONDS[backoffIndex] ?? maximumBackoffMilliseconds;
}

class NodeWindowsHelperPipeTransport implements WindowsHelperPipeTransport {
    private readonly activeSockets = new Set<Socket>();

    async send(
        payload: Uint8Array,
        options: WindowsHelperPipeTransportRequestOptions,
    ): Promise<Uint8Array> {
        const requestFrame = encodeSourceIpcFrame(payload);

        return await new Promise<Uint8Array>((resolve, reject) => {
            const socket = createConnection(options.pipePath);
            const frameAccumulator = new SourceIpcFrameAccumulator();
            let isSettled = false;
            const timeout = setTimeout(() => {
                fail(new Error("Windows source pipe request timed out."));
            }, options.timeoutMilliseconds);

            this.activeSockets.add(socket);

            const cleanup = (): void => {
                clearTimeout(timeout);
                socket.removeAllListeners();
                this.activeSockets.delete(socket);
                socket.destroy();
            };

            const fail = (error: Error): void => {
                if (isSettled) {
                    return;
                }

                isSettled = true;
                cleanup();
                reject(error);
            };

            socket.once("connect", () => {
                socket.write(requestFrame, error => {
                    if (error) {
                        fail(error);
                    }
                });
            });
            socket.on("data", chunk => {
                try {
                    const responsePayload = frameAccumulator.push(chunk);
                    if (!responsePayload) {
                        return;
                    }

                    if (isSettled) {
                        return;
                    }

                    isSettled = true;
                    cleanup();
                    resolve(responsePayload);
                } catch (error) {
                    fail(toError(error));
                }
            });
            socket.once("error", fail);
            socket.once("end", () => {
                fail(new Error("Windows source pipe ended before a response frame was read."));
            });
        });
    }

    dispose(): void {
        for (const socket of this.activeSockets) {
            socket.destroy();
        }

        this.activeSockets.clear();
    }
}

class SourceIpcFrameAccumulator {
    private readonly chunks: Buffer[] = [];
    private receivedByteCount = 0;
    private expectedFrameLength: number | undefined;

    push(chunk: Buffer): Uint8Array | undefined {
        this.chunks.push(chunk);
        this.receivedByteCount += chunk.byteLength;

        if (this.expectedFrameLength === undefined
            && this.receivedByteCount >= SOURCE_IPC_LENGTH_PREFIX_BYTES) {
            const receivedBytes = Buffer.concat(this.chunks, this.receivedByteCount);
            const payloadLength = readLittleEndianUint32(receivedBytes, 0);
            validateSourceIpcPayloadLength(payloadLength);
            this.expectedFrameLength = SOURCE_IPC_LENGTH_PREFIX_BYTES + payloadLength;
        }

        if (this.expectedFrameLength === undefined
            || this.receivedByteCount < this.expectedFrameLength) {
            return undefined;
        }

        const frame = Buffer.concat(this.chunks, this.receivedByteCount);
        if (frame.byteLength !== this.expectedFrameLength) {
            throw new Error("Windows source pipe returned trailing bytes after one response frame.");
        }

        return decodeSourceIpcFrame(frame);
    }
}

function parseSourceIpcResponse(bytes: Uint8Array): SourceIpcResponse {
    try {
        return fromBinary(SourceIpcResponseSchema, bytes);
    } catch (error) {
        throw new Error(`Malformed Windows source IPC response: ${toError(error).message}`);
    }
}

function validateSourceIpcPayloadLength(payloadLength: number): void {
    if (payloadLength === 0) {
        throw new Error("Source IPC frame payload length must be greater than zero.");
    }

    if (payloadLength > MAXIMUM_SOURCE_IPC_FRAME_BYTES) {
        throw new Error("Source IPC frame payload length exceeds the maximum.");
    }
}

function readLittleEndianUint32(bytes: Uint8Array, offset: number): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(offset, true);
}

function toRuntimeSourceHealth(response: GetSourceHealthResponse): SourceHealth {
    return {
        sourceId: response.sourceId,
        protocolVersion: response.protocolVersion,
        helperVersion: response.helperVersion,
        warnings: response.warnings.map(toRuntimeSourceWarning),
    };
}

function toRuntimeMetricDescriptor(descriptor: ProtoMetricDescriptor): MetricDescriptor {
    return {
        metricId: descriptor.metricId,
        sourceSensorId: descriptor.sourceSensorId,
        hardwareId: descriptor.hardwareId,
        hardwareName: descriptor.hardwareName,
        sensorName: descriptor.sensorName,
        sensorType: descriptor.sensorType,
        unit: descriptor.unit,
        isDynamic: descriptor.isDynamic,
    };
}

function toRuntimeSourceWarning(warning: ProtoSourceWarning): SourceWarning {
    return {
        code: warning.code,
        message: warning.message,
        ...(warning.metricId ? { metricId: warning.metricId } : {}),
        ...(warning.sourceSensorId ? { sourceSensorId: warning.sourceSensorId } : {}),
    };
}

class WindowsHelperSourceClientError extends Error {
    override readonly name = "WindowsHelperSourceClientError";

    constructor(
        message: string,
        readonly code: string,
        readonly reason: SourceClientStatusReason,
    ) {
        super(message);
    }
}

function isUnsupportedProtocolError(error: unknown): boolean {
    return error instanceof WindowsHelperSourceClientError
        && error.reason === "protocolMismatch";
}

function classifyHelperRequestFailure(error: unknown): {
    readonly reason: SourceClientStatusReason;
    readonly errorCode?: string;
} {
    if (error instanceof WindowsHelperSourceClientError) {
        return {
            reason: error.reason,
            errorCode: error.code,
        };
    }

    const errorCode = readErrorCode(error);
    if (errorCode === "ENOENT") {
        return {
            reason: "pipeMissing",
            errorCode,
        };
    }

    if (errorCode === "ETIMEDOUT" || toError(error).message.toLowerCase().includes("timed out")) {
        return {
            reason: "timeout",
            ...(errorCode ? { errorCode } : {}),
        };
    }

    return {
        reason: "healthFailed",
        ...(errorCode ? { errorCode } : {}),
    };
}

function readErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== "object" || !("code" in error)) {
        return undefined;
    }

    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}
