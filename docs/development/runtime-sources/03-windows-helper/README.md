# Windows Helper

Read these documents in order:

1. [LibreHardwareMonitor Desktop Source Reading](01-lhm-desktop-source-reading.md)
2. [Helper Source Reliability Implementation Plan](02-helper-source-reliability-implementation-plan.md)
3. [Windows Disk Throughput Implementation Plan](03-lhm-storage-reading-implementation-plan.md)
4. [Windows Helper gRPC IPC And Self-Contained Packaging Plan](04-helper-ipc-packaging-plan.md)
5. [Windows Helper Demand-Driven Refresh Plan](05-helper-demand-driven-refresh-plan.md)
6. [Windows Helper Advanced Sensor Widget Plan](06-helper-advanced-sensor-widget-plan.md)
7. [Windows Helper Advanced Sensor Label And Scale Plan](07-helper-advanced-sensor-label-scale-plan.md)
8. [Windows Helper Unavailable User Guidance Plan](08-helper-unavailable-user-guidance-plan.md)

## Scope

This folder owns Windows helper source behavior, LibreHardwareMonitor-derived
lessons, helper-produced stable aliases, helper reliability, helper/source
version-skew handling, and LHM storage traversal policy.

Read this folder before changing helper-owned metrics, LHM traversal, source
sample attribution, helper no-data copy, descriptor preload, or disk probing
behavior. Read the demand-driven refresh plan before changing helper refresh
cadence, collector group demand, or source polling-group scheduling. Read the
advanced sensor widget plan before changing descriptor-backed catalog
selection, helper catalog PI options, or catalog metric collection behavior.
Read the advanced sensor label and scale plan before changing catalog metric
label overrides, detected display hints, unit formatting, title-card captions,
or circle/bar scale defaults.
Read the unavailable user guidance plan before changing helper no-data copy,
Control Panel helper status presentation, helper health diagnostics, or
platform visibility for helper-backed actions.
