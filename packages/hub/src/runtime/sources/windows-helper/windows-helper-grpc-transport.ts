import {
    fromBinary,
    toBinary,
    type DescMessage,
    type DescMethodUnary,
    type MessageShape,
} from "@bufbuild/protobuf";
import * as grpc from "@grpc/grpc-js";
import { logger } from "../../../logging/logger";
import {
    GetSourceHealthRequestSchema,
    ListMetricDescriptorsRequestSchema,
    MetricSourceService,
    ReadMetricSnapshotRequestSchema,
    type GetSourceHealthRequest,
    type GetSourceHealthResponse,
    type ListMetricDescriptorsRequest,
    type ListMetricDescriptorsResponse,
    type ReadMetricSnapshotRequest,
    type ReadMetricSnapshotResponse,
} from "../../../generated/shometrics/v1/source_api_pb.js";

const log = logger.for("Source:WindowsHelper");

/** Named pipe name used by the Windows helper gRPC source API. */
export const DEFAULT_WINDOWS_HELPER_GRPC_PIPE_NAME = "ShoMetrics.Source.Windows.Grpc.v1";

/** Mirrors `MaximumGrpcMessageBytes` in the Windows helper IPC constants. */
export const MAXIMUM_SOURCE_GRPC_MESSAGE_BYTES = 1024 * 1024;

/** Options passed to a gRPC source API request. */
export interface WindowsHelperGrpcRequestOptions {
    readonly timeoutMilliseconds: number;
}

/** gRPC transport used by the Windows helper source client. */
export interface WindowsHelperGrpcTransport {
    getSourceHealth(
        request: GetSourceHealthRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<GetSourceHealthResponse>;

    listMetricDescriptors(
        request: ListMetricDescriptorsRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<ListMetricDescriptorsResponse>;

    readMetricSnapshot(
        request: ReadMetricSnapshotRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<ReadMetricSnapshotResponse>;

    /** Closes the active channel so the next request recreates it. */
    reset?(): void;

    /** Releases transport-owned channels or handles. */
    dispose?(): void;
}

/** Builds the exact grpc-js target string for a Windows named pipe. */
export function buildWindowsNamedPipeGrpcTarget(pipeName: string): string {
    return `unix:\\\\.\\pipe\\${pipeName}`;
}

export class NodeWindowsHelperGrpcTransport implements WindowsHelperGrpcTransport {
    private client: grpc.Client | undefined;

    constructor(
        private readonly target: string,
        private readonly now: () => number,
    ) {}

    getSourceHealth(
        request: GetSourceHealthRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<GetSourceHealthResponse> {
        return this.invokeUnary(
            MetricSourceService.method.getSourceHealth,
            request,
            options,
        );
    }

    listMetricDescriptors(
        request: ListMetricDescriptorsRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<ListMetricDescriptorsResponse> {
        return this.invokeUnary(
            MetricSourceService.method.listMetricDescriptors,
            request,
            options,
        );
    }

    readMetricSnapshot(
        request: ReadMetricSnapshotRequest,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<ReadMetricSnapshotResponse> {
        return this.invokeUnary(
            MetricSourceService.method.readMetricSnapshot,
            request,
            options,
        );
    }

    reset(): void {
        if (!this.client) {
            return;
        }

        this.client.close();
        this.client = undefined;
        log.debug("windowsHelperGrpcChannelReset");
    }

    dispose(): void {
        this.reset();
    }

    private invokeUnary<TRequest extends DescMessage, TResponse extends DescMessage>(
        method: DescMethodUnary<TRequest, TResponse>,
        request: MessageShape<TRequest>,
        options: WindowsHelperGrpcRequestOptions,
    ): Promise<MessageShape<TResponse>> {
        const requestStartedAtTimestampMilliseconds = this.now();
        const client = this.getClient();

        return awaitGrpcUnary<MessageShape<TResponse>>(callback => {
            client.makeUnaryRequest(
                buildGrpcMethodPath(method),
                value => Buffer.from(toBinary(method.input, value)),
                bytes => fromBinary(method.output, bytes),
                request,
                { deadline: requestStartedAtTimestampMilliseconds + options.timeoutMilliseconds },
                callback,
            );
        }).finally(() => {
            log.debug(() => [
                "windowsHelperGrpcUnaryCompleted",
                "layer=transport",
                `method=${method.name}`,
                `durationMs=${this.now() - requestStartedAtTimestampMilliseconds}`,
                `timeoutMs=${options.timeoutMilliseconds}`,
            ].join(" "));
        });
    }

    private getClient(): grpc.Client {
        if (this.client) {
            return this.client;
        }

        const channelCreatedAtTimestampMilliseconds = this.now();
        this.client = new grpc.Client(
            this.target,
            grpc.credentials.createInsecure(),
            {
                "grpc.max_receive_message_length": MAXIMUM_SOURCE_GRPC_MESSAGE_BYTES,
                "grpc.max_send_message_length": MAXIMUM_SOURCE_GRPC_MESSAGE_BYTES,
            },
        );
        log.debug(() => [
            "windowsHelperGrpcChannelCreated",
            `target=${this.target}`,
            `createdAtMs=${channelCreatedAtTimestampMilliseconds}`,
        ].join(" "));

        return this.client;
    }
}

function buildGrpcMethodPath(method: DescMethodUnary): string {
    return `/${method.parent.typeName}/${method.name}`;
}

function awaitGrpcUnary<TResponse>(
    start: (callback: grpc.requestCallback<TResponse>) => void,
): Promise<TResponse> {
    return new Promise<TResponse>((resolve, reject) => {
        start((error, response) => {
            if (error) {
                reject(error);
                return;
            }

            if (response === undefined) {
                reject(new Error("Windows helper gRPC response was empty."));
                return;
            }

            resolve(response);
        });
    });
}
