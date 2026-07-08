namespace ShoMetrics.Source.Windows.Core;

public sealed record HardwareMetricDescriptorSnapshot
{
    /// <summary>
    /// Stable SHA-256 identity for the complete descriptor catalog.
    /// </summary>
    /// <remarks>
    /// The service returns this value with descriptor responses so the Hub can
    /// decide whether active subscriptions need source-metadata re-planning.
    /// It covers the full catalog even when <see cref="Descriptors" /> is
    /// filtered to requested metric ids, and it does not describe source health
    /// or sample freshness.
    /// </remarks>
    public required string DescriptorFingerprint { get; init; }

    public required IReadOnlyList<HardwareMetricDescriptor> Descriptors { get; init; }

    public required IReadOnlyList<string> Warnings { get; init; }

    /// <summary>
    /// Whether the descriptor preload observed at least one sensor that only
    /// carries data when the PawnIO ring0 driver is actually working (see
    /// <see cref="PawnIoDriverEvidence" />). This is captured from live sensor
    /// values at build time, not inferred from descriptor presence, because LHM
    /// activates a CPU temperature sensor at 0 C even when the driver read failed
    /// (LibreHardwareMonitorLib/Hardware/Cpu/Amd17Cpu.cs; see
    /// <see cref="PawnIoDriverEvidence" /> for the full rationale).
    /// It shares the catalog's process lifetime: PawnIO health does not change
    /// without a restart, which also restarts the helper and rebuilds the catalog.
    /// </summary>
    /// <remarks>
    /// TODO(deferred, post-launch): because this is frozen with the catalog, the
    /// Control Panel "Refresh" re-runs GetSourceHealth but cannot re-evaluate the
    /// PawnIO OK/Unusable verdict; only a helper restart does. Acceptable because
    /// PawnIO health effectively changes only across a restart, but it should be
    /// revisited alongside the catalog-rebuild TODO in
    /// <see cref="LibreHardwareMonitorSession" />.
    /// </remarks>
    public bool HasDriverBackedSensorReading { get; init; }
}
