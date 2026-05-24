using System.Buffers.Binary;
using Google.Protobuf;
using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Ipc;

public sealed class SourceIpcFrameCodec
{
    private const int LengthPrefixByteCount = sizeof(uint);

    public async Task<SourceIpcRequest?> ReadRequestAsync(Stream stream, CancellationToken cancellationToken)
    {
        return await ReadMessageAsync(
            stream,
            SourceIpcRequest.Parser,
            "request",
            allowEndBeforeAnyByte: true,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<SourceIpcResponse?> ReadResponseAsync(Stream stream, CancellationToken cancellationToken)
    {
        return await ReadMessageAsync(
            stream,
            SourceIpcResponse.Parser,
            "response",
            allowEndBeforeAnyByte: true,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task WriteRequestAsync(
        Stream stream,
        SourceIpcRequest request,
        CancellationToken cancellationToken)
    {
        await WriteMessageAsync(stream, request, "request", cancellationToken).ConfigureAwait(false);
    }

    public async Task WriteResponseAsync(
        Stream stream,
        SourceIpcResponse response,
        CancellationToken cancellationToken)
    {
        await WriteMessageAsync(stream, response, "response", cancellationToken).ConfigureAwait(false);
    }

    private static async Task<TMessage?> ReadMessageAsync<TMessage>(
        Stream stream,
        MessageParser<TMessage> parser,
        string frameKind,
        bool allowEndBeforeAnyByte,
        CancellationToken cancellationToken)
        where TMessage : class, IMessage<TMessage>
    {
        byte[] lengthPrefixBytes = new byte[LengthPrefixByteCount];
        bool hasLengthPrefix = await ReadExactlyOrEndAsync(
            stream,
            lengthPrefixBytes,
            "length prefix",
            allowEndBeforeAnyByte,
            cancellationToken).ConfigureAwait(false);

        if (!hasLengthPrefix)
        {
            return null;
        }

        int payloadLength = ReadPayloadLength(lengthPrefixBytes, frameKind);
        byte[] payloadBytes = new byte[payloadLength];

        await ReadExactlyOrEndAsync(
            stream,
            payloadBytes,
            "payload",
            allowEndBeforeAnyByte: false,
            cancellationToken).ConfigureAwait(false);

        try
        {
            return parser.ParseFrom(payloadBytes);
        }
        catch (InvalidProtocolBufferException exception)
        {
            throw new SourceIpcFrameException(
                SourceIpcFrameError.MalformedPayload,
                $"Source IPC {frameKind} payload is not valid protobuf.",
                exception);
        }
    }

    private static async Task WriteMessageAsync(
        Stream stream,
        IMessage message,
        string frameKind,
        CancellationToken cancellationToken)
    {
        byte[] payloadBytes = message.ToByteArray();

        if (payloadBytes.Length == 0)
        {
            throw new InvalidOperationException($"Source IPC {frameKind}s must not serialize to an empty payload.");
        }

        if (payloadBytes.Length > SourceIpcConstants.MaximumFrameBytes)
        {
            throw new InvalidOperationException($"Source IPC {frameKind} exceeds the maximum frame size.");
        }

        byte[] lengthPrefixBytes = new byte[LengthPrefixByteCount];
        BinaryPrimitives.WriteUInt32LittleEndian(lengthPrefixBytes, checked((uint)payloadBytes.Length));

        await stream.WriteAsync(lengthPrefixBytes, cancellationToken).ConfigureAwait(false);
        await stream.WriteAsync(payloadBytes, cancellationToken).ConfigureAwait(false);
        await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static int ReadPayloadLength(ReadOnlySpan<byte> lengthPrefixBytes, string frameKind)
    {
        uint payloadLength = BinaryPrimitives.ReadUInt32LittleEndian(lengthPrefixBytes);

        if (payloadLength == 0)
        {
            throw new SourceIpcFrameException(
                SourceIpcFrameError.MalformedPayload,
                $"Source IPC {frameKind} payload length must not be zero.");
        }

        if (payloadLength > SourceIpcConstants.MaximumFrameBytes)
        {
            throw new SourceIpcFrameException(
                SourceIpcFrameError.FrameTooLarge,
                $"Source IPC {frameKind} exceeds the maximum frame size.");
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
                    SourceIpcFrameError.IncompleteFrame,
                    $"Unexpected end of stream while reading Source IPC frame {framePart}.");
            }

            totalBytesRead += bytesRead;
        }

        return true;
    }
}
