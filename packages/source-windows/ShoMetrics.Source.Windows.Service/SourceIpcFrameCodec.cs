using System.Buffers.Binary;
using Google.Protobuf;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Service;

internal sealed class SourceIpcFrameCodec
{
    private const int LengthPrefixByteCount = sizeof(uint);

    public async Task<SourceIpcRequest?> ReadRequestAsync(Stream stream, CancellationToken cancellationToken)
    {
        byte[] lengthPrefixBytes = new byte[LengthPrefixByteCount];
        bool hasLengthPrefix = await ReadExactlyOrEndAsync(
            stream,
            lengthPrefixBytes,
            "length prefix",
            allowEndBeforeAnyByte: true,
            cancellationToken).ConfigureAwait(false);

        if (!hasLengthPrefix)
        {
            return null;
        }

        int payloadLength = ReadPayloadLength(lengthPrefixBytes);
        byte[] payloadBytes = new byte[payloadLength];

        await ReadExactlyOrEndAsync(
            stream,
            payloadBytes,
            "payload",
            allowEndBeforeAnyByte: false,
            cancellationToken).ConfigureAwait(false);

        try
        {
            return SourceIpcRequest.Parser.ParseFrom(payloadBytes);
        }
        catch (InvalidProtocolBufferException exception)
        {
            throw new SourceIpcFrameException(
                SourceIpcFrameError.MalformedRequest,
                canWriteErrorResponse: true,
                "Source IPC request payload is not valid protobuf.",
                exception);
        }
    }

    public async Task WriteResponseAsync(
        Stream stream,
        SourceIpcResponse response,
        CancellationToken cancellationToken)
    {
        byte[] payloadBytes = response.ToByteArray();

        if (payloadBytes.Length == 0)
        {
            throw new InvalidOperationException("Source IPC responses must not serialize to an empty payload.");
        }

        if (payloadBytes.Length > SourceServiceConstants.MaximumFrameBytes)
        {
            throw new InvalidOperationException("Source IPC response exceeds the maximum frame size.");
        }

        byte[] lengthPrefixBytes = new byte[LengthPrefixByteCount];
        BinaryPrimitives.WriteUInt32LittleEndian(lengthPrefixBytes, checked((uint)payloadBytes.Length));

        await stream.WriteAsync(lengthPrefixBytes, cancellationToken).ConfigureAwait(false);
        await stream.WriteAsync(payloadBytes, cancellationToken).ConfigureAwait(false);
        await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static int ReadPayloadLength(ReadOnlySpan<byte> lengthPrefixBytes)
    {
        uint payloadLength = BinaryPrimitives.ReadUInt32LittleEndian(lengthPrefixBytes);

        if (payloadLength == 0)
        {
            throw new SourceIpcFrameException(
                SourceIpcFrameError.MalformedRequest,
                canWriteErrorResponse: true,
                "Source IPC request payload length must not be zero.");
        }

        if (payloadLength > SourceServiceConstants.MaximumFrameBytes)
        {
            throw new SourceIpcFrameException(
                SourceIpcFrameError.FrameTooLarge,
                canWriteErrorResponse: false,
                "Source IPC request exceeds the maximum frame size.");
        }

        return checked((int)payloadLength);
    }

    private static async Task<bool> ReadExactlyOrEndAsync(
        Stream stream,
        Memory<byte> buffer,
        string framePart,
        bool allowEndBeforeAnyByte,
        CancellationToken cancellationToken)
    {
        int totalBytesRead = 0;

        while (totalBytesRead < buffer.Length)
        {
            int bytesRead = await stream.ReadAsync(buffer[totalBytesRead..], cancellationToken).ConfigureAwait(false);

            if (bytesRead == 0)
            {
                if (totalBytesRead == 0 && allowEndBeforeAnyByte)
                {
                    return false;
                }

                throw new SourceIpcFrameException(
                    SourceIpcFrameError.MalformedRequest,
                    canWriteErrorResponse: false,
                    $"Unexpected end of stream while reading Source IPC frame {framePart}.");
            }

            totalBytesRead += bytesRead;
        }

        return true;
    }
}
