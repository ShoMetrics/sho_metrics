import { status as grpcStatus } from "@grpc/grpc-js";
import { logger } from "../../../logging/logger";
import type { SourceClientStatusReason } from "../source-client";

const log = logger.for("Source:WindowsHelper");

export class WindowsHelperSourceClientError extends Error {
    override readonly name = "WindowsHelperSourceClientError";

    constructor(
        message: string,
        readonly code: string,
        readonly reason: SourceClientStatusReason,
    ) {
        super(message);
    }
}

export function isUnsupportedProtocolError(error: unknown): boolean {
    return error instanceof WindowsHelperSourceClientError
        && error.reason === "protocolMismatch";
}

export function isInvalidRefreshDemandRequestError(error: unknown): boolean {
    return error instanceof WindowsHelperSourceClientError
        && error.code === "grpc_invalid_argument";
}

export function isRefreshDemandUnsupportedError(error: unknown): boolean {
    return toWindowsHelperSourceClientError(error).code === "grpc_unimplemented";
}

export function isRefreshDemandControlPlaneError(error: unknown): boolean {
    const clientError = toWindowsHelperSourceClientError(error);
    return clientError.code === "grpc_invalid_argument"
        || clientError.code === "grpc_resource_exhausted";
}

export function shouldResetRefreshDemandChannelAfterError(error: unknown): boolean {
    return !isRefreshDemandUnsupportedError(error)
        && shouldResetGrpcChannelAfterError(error);
}

export function toWindowsHelperSourceClientError(error: unknown): WindowsHelperSourceClientError {
    return error instanceof WindowsHelperSourceClientError
        ? error
        : new WindowsHelperSourceClientError(toError(error).message, "unknown", "sourceError");
}

export function normalizeGrpcRequestError(error: unknown, methodName: string): Error {
    const grpcStatusCode = readGrpcStatusCode(error);
    if (grpcStatusCode === undefined) {
        return toError(error);
    }

    const details = readGrpcDetails(error);
    const message = [
        "Windows helper gRPC request failed.",
        `method=${methodName}`,
        `status=${formatGrpcStatusCode(grpcStatusCode)}`,
        ...(details ? [`details=${details}`] : []),
    ].join(" ");

    if (grpcStatusCode === grpcStatus.INVALID_ARGUMENT) {
        log.error(message);
    }

    return new WindowsHelperSourceClientError(
        message,
        selectGrpcErrorCode(grpcStatusCode, details),
        selectGrpcStatusReason(grpcStatusCode, details),
    );
}

export function shouldResetGrpcChannelAfterError(error: unknown): boolean {
    if (error instanceof WindowsHelperSourceClientError) {
        switch (error.code) {
            case "ENOENT":
            case "grpc_unavailable":
            case "grpc_unimplemented":
            case "grpc_failed_precondition":
                return true;
            case "grpc_deadline_exceeded":
            case "grpc_invalid_argument":
            case "grpc_resource_exhausted":
            case "grpc_cancelled":
            case "grpc_internal":
            case "grpc_unknown":
                return false;
        }

        return error.reason === "protocolMismatch" || error.reason === "pipeMissing";
    }

    switch (readErrorCode(error)) {
        case "ENOENT":
        case "ECONNRESET":
        case "ECONNREFUSED":
        case "EPIPE":
            return true;
        default:
            return false;
    }
}

export function classifyHelperRequestFailure(error: unknown): {
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

export function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function readGrpcStatusCode(error: unknown): number | undefined {
    const code = readUnknownErrorProperty(error, "code");
    return typeof code === "number" ? code : undefined;
}

function readGrpcDetails(error: unknown): string {
    const details = readUnknownErrorProperty(error, "details");
    return typeof details === "string" ? details : toError(error).message;
}

function selectGrpcErrorCode(grpcStatusCode: number, details: string): string {
    if (grpcStatusCode === grpcStatus.UNAVAILABLE && isGrpcPipeMissingDetails(details)) {
        return "ENOENT";
    }

    return `grpc_${formatGrpcStatusCode(grpcStatusCode).toLowerCase()}`;
}

function selectGrpcStatusReason(
    grpcStatusCode: number,
    details: string,
): SourceClientStatusReason {
    switch (grpcStatusCode) {
        case grpcStatus.DEADLINE_EXCEEDED:
            return "timeout";
        case grpcStatus.UNAVAILABLE:
            return isGrpcPipeMissingDetails(details) ? "pipeMissing" : "sourceError";
        case grpcStatus.UNIMPLEMENTED:
        case grpcStatus.FAILED_PRECONDITION:
            return "protocolMismatch";
        case grpcStatus.INVALID_ARGUMENT:
        case grpcStatus.RESOURCE_EXHAUSTED:
        case grpcStatus.INTERNAL:
        case grpcStatus.UNKNOWN:
        case grpcStatus.CANCELLED:
        default:
            return "sourceError";
    }
}

function isGrpcPipeMissingDetails(details: string): boolean {
    const normalizedDetails = details.toLowerCase();
    return normalizedDetails.includes("enoent")
        || normalizedDetails.includes("no such file");
}

function formatGrpcStatusCode(grpcStatusCode: number): string {
    const statusName = (grpcStatus as Readonly<Record<number, string>>)[grpcStatusCode];

    return statusName ?? `UNKNOWN_${grpcStatusCode}`;
}

function readErrorCode(error: unknown): string | undefined {
    const code = readUnknownErrorProperty(error, "code");
    return typeof code === "string" ? code : undefined;
}

function readUnknownErrorProperty(error: unknown, propertyName: string): unknown {
    if (error === null || typeof error !== "object" || !(propertyName in error)) {
        return undefined;
    }

    return (error as Record<string, unknown>)[propertyName];
}
