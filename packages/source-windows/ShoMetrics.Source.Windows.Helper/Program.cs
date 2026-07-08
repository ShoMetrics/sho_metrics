using System.Text.Json;
using System.Text.Json.Serialization;
using ShoMetrics.Source.Windows.Core;

JsonSerializerOptions jsonOptions = new()
{
    NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = true,
};

if (args is ["--help"] or ["-h"])
{
    Console.WriteLine("Usage: ShoMetrics.Source.Windows.Helper [snapshot|dump|diagnose-pawnio]");
    return 0;
}

if (args.Length > 1 || args is [not "snapshot" and not "dump" and not "diagnose-pawnio"])
{
    Console.Error.WriteLine("Usage: ShoMetrics.Source.Windows.Helper [snapshot|dump|diagnose-pawnio]");
    return 1;
}

using CancellationTokenSource cancellationTokenSource = new();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    cancellationTokenSource.Cancel();
};

LibreHardwareMetricSource metricSource = new();

if (args is ["dump"])
{
    HardwareSensorSnapshot sensorDump = metricSource.ReadSensorDump(cancellationTokenSource.Token);
    Console.WriteLine(JsonSerializer.Serialize(sensorDump, jsonOptions));
    return sensorDump.Sensors.Count == 0 ? 2 : 0;
}

if (args is ["diagnose-pawnio"])
{
    // Render enums (cpuVendor, osArchitecture, verdict) as names so the
    // diagnostic is readable at a glance for support and hardware verification.
    JsonSerializerOptions diagnosticJsonOptions = new(jsonOptions)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    using LibreHardwareMonitorSession diagnosticSession = new();
    bool hasDriverBackedEvidence =
        PawnIoDriverEvidence.HasDriverBackedSensors(diagnosticSession.DescriptorSnapshot);
    PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read(new PawnIoEnvironment(), hasDriverBackedEvidence);
    Console.WriteLine(JsonSerializer.Serialize(diagnostic, diagnosticJsonOptions));
    return diagnostic.Verdict == PawnIoHealthVerdict.Ok ? 0 : 2;
}

using LibreHardwareMonitorSession session = new();
MetricSnapshot snapshot = await session.RefreshSnapshotAsync(cancellationTokenSource.Token);

Console.WriteLine(JsonSerializer.Serialize(snapshot, jsonOptions));
return snapshot.Readings.Count == 0 ? 2 : 0;
