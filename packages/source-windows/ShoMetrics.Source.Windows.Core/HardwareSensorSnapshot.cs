namespace ShoMetrics.Source.Windows.Core;

public sealed record HardwareSensorSnapshot
{
    public required DateTimeOffset CapturedAt { get; init; }

    public required IReadOnlyList<HardwareSensorReading> Sensors { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }
}
