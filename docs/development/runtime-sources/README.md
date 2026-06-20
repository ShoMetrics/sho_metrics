# Runtime Sources

This folder is one continuous source-system design trail. It starts with
runtime collection performance work, moves into source routing, and then narrows
into Windows helper reliability and LibreHardwareMonitor-specific policy.

Read the numbered folders in order when reconstructing the full reasoning:

1. [Runtime Collection](01-runtime-collection/README.md)
2. [Source Routing](02-source-routing/README.md)
3. [Windows Helper](03-windows-helper/README.md)
4. [Multi Metric Widgets](04-multi-metric-widgets/README.md)
5. [Custom Metrics](05-custom-metrics/README.md)
6. [Battery](06-battery/README.md)

## Folder Boundaries

| Folder | Owns | Read when |
| --- | --- | --- |
| `01-runtime-collection/` | Scheduler, collector groups, demand-driven subscriptions, `MetricStore`, fallback composition, descriptor invalidation, and source capability. | You are changing runtime collection, `MetricStore` writes, subscriptions, fallback composition, or render timing. |
| `02-source-routing/` | Source choice evidence, metric-level routing, local auto preferences, fallback source order, and future source-routing work. | You are choosing default providers or changing `MetricReadPlan`, local auto source preference, action subscriptions, or source fallback order. |
| `03-windows-helper/` | Windows helper behavior, LHM source-reading lessons, helper-produced stable aliases, helper reliability, version-skew handling, and LHM storage traversal policy. | You are changing helper-owned metrics, LHM traversal, source sample metadata/provenance, helper no-data copy, descriptor preload, or disk probing behavior. |
| `04-multi-metric-widgets/` | Multi-metric widget storage, action collection, dense simultaneous rendering, stacked rotating rendering, and PI slot editing. | You are adding or changing Dense Multi Metric, Stacked Metric, multi-slot settings, multi-metric render contracts, or multi-slot PI editor behavior. |
| `05-custom-metrics/` | Widget-local user-defined HTTP metrics, HTTP source polling, transform engine selection, and transform output schema. | You are adding or changing Custom Metric, HTTP target settings, transform rules, schema validation, custom source runtime, or Custom Metric Property Inspector UX. |
| `06-battery/` | User-space peripheral battery research, native HID dependency policy, vendor-specific read-only HID protocols, and battery source safety boundaries. | You are adding or changing HID-based battery collection, `node-hid` packaging, vendor peripheral probing, or peripheral battery source UX. |
