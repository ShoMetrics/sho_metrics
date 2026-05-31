using System.Runtime.CompilerServices;

[assembly: InternalsVisibleTo("ShoMetrics.Source.Windows.Service.Tests")]
// Keeps test-only hosting on the shared service wiring without adding test-only switches
// to the shipped service executable.
[assembly: InternalsVisibleTo("ShoMetrics.Source.Windows.IntegrationTestHost")]
