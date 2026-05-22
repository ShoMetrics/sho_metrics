# Runtime Boundaries

`runtime/` owns live telemetry facts: source clients, source routing,
background collection, and source-scoped metric state.

The core rule is cohesion:

```text
source-routing decides desired source order
sources describe and read source-owned data
metric-collection keeps demanded metrics fresh
MetricStore stores samples and history
actions/rendering read already-known values
```

Each layer should be able to do its job without trusting another layer's
optimistic state. A helper being preferred does not mean it has data. A
descriptor saying a metric exists does not mean the next sample is fresh. A
stored sample does not decide which source should be polled next.

## Boundaries

- `source-routing/` owns metric-level source preference and read plans. It may
  know metric keys, source ids, and resolved source settings. It must not read
  sources, write `MetricStore`, or parse source-native ids.
- `sources/` owns source clients, source capability metadata, polling groups,
  source registry, and source-local retry behavior. It must not import routing
  policy or decide widget fallback. Source contracts and small source support
  helpers stay at the root; concrete implementations live under
  `sources/node-system/` and `sources/windows-helper/`.
- `metric-collection/` owns subscriptions, planning, runner lifecycle, and
  background writes to `MetricStore`. It must not render widgets or persist
  settings.
- `metric-store.ts` owns source-scoped latest values and history. It must not
  emit render events, poll sources, or choose source candidates.

Top-level metric key and runtime catalog files stay where they are until a
clearer owner emerges. Do not move them just to make the directory look tidy.

This README explains intent only. If a boundary needs enforcement, add a lint
or dependency rule in a separate change.
