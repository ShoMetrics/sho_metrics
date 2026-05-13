# Widget Action Taxonomy Refactor Plan

## Product Rule

ShoMetrics follows the widget model:

- A domain widget keeps its domain identity.
- A widget can change readings inside that domain.
- Cross-domain rotation belongs to a separate stack-style widget.
- Arbitrary sensors belong to a custom metric widget.

`Monitor` is intentionally not used as an action suffix. ShoMetrics is already a monitoring plugin, and "monitor" can also read as a physical display. In the Stream Deck action list, short domain names are clearer.

## Final Action Taxonomy

Initial actions:

- `CPU`
- `GPU`
- `Memory`
- `Disk`
- `Network`

Future actions:

- `Custom Metric`
- `Metric Stack`
- `Text Dashboard`
- `Touch Strip Meters`
- `System`

Battery is not a top-level action yet. Desktop users do not need it, and it fits better under a future `System` action with uptime, power state, Bluetooth, and thermal status.

## Invariants

- `com.ez.sho-metrics.cpu` never becomes a GPU widget.
- `com.ez.sho-metrics.gpu` may switch between GPU usage, temperature, power, VRAM, and future GPU readings.
- `com.ez.sho-metrics.network` may switch between network readings such as traffic, ping, and future process traffic.
- Stream Deck action UUIDs identify product entry types, not one-off metric readings.
- Stored settings remain the source of truth for the selected reading inside the action domain.
- Quick-start action kind only initializes empty stored settings.
- No old UUID aliases or compatibility paths are kept.

## Refactor Steps

1. Define the action taxonomy.
   - Replace one-metric-one-action entries with the five domain actions.
   - Rename action kinds and action entry files to `cpu`, `gpu`, `memory`, `disk`, and `network`.
   - Remove old GPU reading actions as Stream Deck action entries.

2. Update quick-start initialization.
   - `cpu` creates CPU usage.
   - `gpu` creates GPU usage.
   - `memory` creates memory usage.
   - `disk` creates disk usage.
   - `network` creates network traffic.

3. Update Property Inspector panels.
   - Domain action decides which domain panel is allowed.
   - Panel reading selectors update sparse stored target fields.
   - Do not expose cross-domain selection inside domain actions.

4. Update action runtime.
   - Each domain action reads resolved settings and switches on reading kind.
   - Logs use domain action scope plus explicit reading fields.
   - Shared lifecycle remains in `MetricAction`.

5. Delete old reading-level action code.
   - Remove old action kind names, old tests, old class names, and old file names.
   - Do not keep wrapper classes or aliases for deleted UUIDs.

6. Add boundary tests.
   - Manifest action UUIDs match `STREAM_DECK_ACTION_UUID_BY_KIND`.
   - Domain quick-start settings create the expected stored target.
   - Domain actions reject non-domain targets instead of silently converting them.
   - No old action kind strings remain in source code.

