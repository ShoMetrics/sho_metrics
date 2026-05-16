# Windows Source POC

This directory contains a clean one-shot LibreHardwareMonitor POC. It does not contain a daemon, Node integration, or protobuf IPC yet.

## Shape

- `ShoMetrics.Source.Windows.Core`: owns LibreHardwareMonitor access, sensor-to-metric mapping, snapshot DTOs, and PawnIO diagnostics.
- `ShoMetrics.Source.Windows.Helper`: tiny console boundary that prints one JSON result and exits.
- `ShoMetrics.Source.Windows.ControlPanel`: minimal future control-panel boundary; no UI framework dependency yet.

## Commands

Run from `packages/source-windows`:

```powershell
dotnet run --project .\ShoMetrics.Source.Windows.Helper\ShoMetrics.Source.Windows.Helper.csproj -- snapshot
dotnet run --project .\ShoMetrics.Source.Windows.Helper\ShoMetrics.Source.Windows.Helper.csproj -- dump
dotnet run --project .\ShoMetrics.Source.Windows.Helper\ShoMetrics.Source.Windows.Helper.csproj -- diagnose-pawnio
```

`snapshot` prints curated metric readings. `dump` prints raw LHM sensors for mapping work. `diagnose-pawnio` checks whether MSR-backed CPU sensors can work in the current process.

## Current Constraints

- CPU temperature and package power may require running the helper from an elevated administrator process because LHM reads MSR-backed values through PawnIO on this machine.
- The metric catalog is intentionally explicit. New sensor names should be verified with `dump` before adding mappings.
- A future daemon or Node IPC transport should be introduced as a separate design change, not by expanding this helper into a long-lived process.
