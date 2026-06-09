# Custom Metrics

This folder owns user-defined metric source work. It is separate from
`04-multi-metric-widgets` because Custom Metric is a source/runtime feature,
not a widget layout feature. Single Metric, Dense Multi Metric, and Stacked
Metric should all be able to consume Custom Metric targets without changing
their layout contracts.

Read these documents in order:

1. [HTTP Custom Metric Transform Engine Report](01-http-custom-metric-poc-plan.md)
2. [HTTP Custom Metric Implementation Plan](02-http-custom-metric-implementation-plan.md)

## Folder Boundary

This folder owns:

- widget-local Custom HTTP Metric definitions;
- HTTP source polling and widget/action-instance-level failure domains;
- transform engine selection and execution safety;
- transform output schema validation;
- Property Inspector UX for configuring one HTTP Custom Metric.

This folder does not own:

- Dense Multi Metric or Stacked Metric layout contracts;
- built-in Windows helper/LHM source behavior;
- arbitrary text widget rendering;
- reusable custom source catalogs;
- multi-request HTTP pipelines;
- local command execution source types.
