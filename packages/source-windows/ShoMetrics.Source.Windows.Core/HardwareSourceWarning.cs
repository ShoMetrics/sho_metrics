namespace ShoMetrics.Source.Windows.Core;

public sealed record HardwareSourceWarning
{
    public required string Code { get; init; }

    public required string Message { get; init; }
}
