using ShoMetrics.Contracts.V1;
using ShoMetrics.Source.Windows.Core;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceProtocolMapper
{
    private const string InvalidRequestErrorCode = "invalid_request";
    private const string MalformedRequestErrorCode = "malformed_request";
    private const string FrameTooLargeErrorCode = "frame_too_large";
    private const string TimeoutErrorCode = "timeout";
    private const string SourceUnavailableErrorCode = "source_unavailable";
    private const string InternalErrorCode = "internal_error";

    public SourceIpcResponse BuildHealthResponse(string requestId, IReadOnlyList<HardwareSourceWarning> warnings)
    {
        SourceIpcResponse response = new()
        {
            RequestId = requestId,
            GetSourceHealth = new GetSourceHealthResponse
            {
                SourceId = SourceServiceConstants.SourceId,
                ProtocolVersion = SourceServiceConstants.ProtocolVersion,
                HelperVersion = SourceServiceConstants.HelperVersion,
            },
        };

        foreach (HardwareSourceWarning warning in warnings)
        {
            response.GetSourceHealth.Warnings.Add(new SourceWarning
            {
                Code = warning.Code,
                Message = warning.Message,
            });
        }

        return response;
    }

    public SourceIpcResponse BuildInvalidRequestResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            InvalidRequestErrorCode,
            "Source IPC request payload is empty or unsupported.");
    }

    public SourceIpcResponse BuildSourceUnavailableResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            SourceUnavailableErrorCode,
            "Windows source reader is unavailable.");
    }

    public SourceIpcResponse BuildTimeoutResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            TimeoutErrorCode,
            "Source IPC request exceeded the service timeout.");
    }

    public SourceIpcResponse BuildInternalErrorResponse(string requestId)
    {
        return BuildErrorResponse(
            requestId,
            InternalErrorCode,
            "Source IPC request failed unexpectedly.");
    }

    public SourceIpcResponse BuildFrameErrorResponse(SourceIpcFrameException exception)
    {
        string errorCode = exception.Error switch
        {
            SourceIpcFrameError.MalformedRequest => MalformedRequestErrorCode,
            SourceIpcFrameError.FrameTooLarge => FrameTooLargeErrorCode,
            _ => MalformedRequestErrorCode,
        };

        return BuildErrorResponse("", errorCode, exception.Message);
    }

    private static SourceIpcResponse BuildErrorResponse(string requestId, string code, string message)
    {
        return new SourceIpcResponse
        {
            RequestId = requestId,
            Error = new SourceError
            {
                Code = code,
                Message = message,
            },
        };
    }
}
