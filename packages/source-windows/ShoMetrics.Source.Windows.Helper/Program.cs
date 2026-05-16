using System.Text.Json;
using ShoMetrics.Source.Windows.Core;

JsonSerializerOptions jsonOptions = new()
{
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
    PawnIoDiagnostic diagnostic = PawnIoDiagnostics.Read();
    Console.WriteLine(JsonSerializer.Serialize(diagnostic, jsonOptions));
    return diagnostic.Warnings.Count == 0 ? 0 : 2;
}

MetricSnapshot snapshot = metricSource.ReadSnapshot(cancellationTokenSource.Token);

Console.WriteLine(JsonSerializer.Serialize(snapshot, jsonOptions));
return snapshot.Readings.Count == 0 ? 2 : 0;
