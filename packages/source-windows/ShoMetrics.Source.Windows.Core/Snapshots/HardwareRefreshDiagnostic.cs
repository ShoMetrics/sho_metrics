namespace ShoMetrics.Source.Windows.Core;

/// <summary>
/// Transport-independent timing and outcome for one LHM hardware update call.
/// </summary>
public sealed record HardwareRefreshDiagnostic
{
    public required string HardwareId { get; init; }

    public required string HardwareName { get; init; }

    public required string HardwareType { get; init; }

    /// <summary>
    /// Time spent in this hardware node's <c>IHardware.Update()</c> call only.
    /// Child hardware updates are reported as separate diagnostics.
    /// </summary>
    public required TimeSpan UpdateDuration { get; init; }

    public required bool UpdateSucceeded { get; init; }

    public string? UpdateError { get; init; }

    public required int SensorCount { get; init; }

    public required int SubHardwareCount { get; init; }
}
