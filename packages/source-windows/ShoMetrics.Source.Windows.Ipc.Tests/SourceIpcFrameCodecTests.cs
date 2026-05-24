using ShoMetrics.Contracts.V1;

namespace ShoMetrics.Source.Windows.Ipc.Tests;

public sealed class SourceIpcFrameCodecTests
{
    [Fact]
    public async Task ResponseFramesRoundTrip()
    {
        var codec = new SourceIpcFrameCodec();
        await using var stream = new MemoryStream();

        await codec.WriteResponseAsync(
            stream,
            new SourceIpcResponse
            {
                RequestId = "request-1",
                GetSourceHealth = new GetSourceHealthResponse
                {
                    SourceId = "windows-helper",
                    ProtocolVersion = "1",
                    HelperVersion = "test",
                },
            },
            CancellationToken.None);

        stream.Position = 0;

        SourceIpcResponse? response = await codec.ReadResponseAsync(stream, CancellationToken.None);

        Assert.NotNull(response);
        Assert.Equal("request-1", response.RequestId);
        Assert.Equal("windows-helper", response.GetSourceHealth.SourceId);
    }
}
