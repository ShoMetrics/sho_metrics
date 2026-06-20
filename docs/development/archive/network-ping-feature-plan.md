# Network Ping Feature Implementation Plan

This document is the complete implementation specification for adding ping to
the existing Network widget. It is written so an agent with no prior chat
context can implement the feature from this file plus the repository.

## Product Contract

| Area | Required behavior |
| --- | --- |
| Network metric modes | The Network widget supports `traffic` and `ping`. |
| Default mode | Existing quick-start Network widgets resolve to `traffic`. |
| Default ping target | `8.8.8.8`. This is the more widely recognized public DNS target and matches `systeminformation@5.31.5` default `inetLatency()` behavior. |
| User input | Users may enter an IPv4 address, IPv6 address, DNS hostname, or URL-like value. |
| Input cleanup | Trim whitespace, remove `http://` or `https://`, strip credentials, port, path, query, and fragment, then store only the normalized host. |
| Ping operation | Use the installed `systeminformation@5.31.5` `inetLatency(host)` API. Do not add a ping package. |
| Host validation | Add `validator` for browser-safe IP and DNS hostname validation. Do not hand-roll IP/FQDN validation. |
| Platform support | Built-in ping support is Windows, macOS, and Linux through `node-system`. |
| Source routing | Ping is `node-system` only. The Windows helper must not be used for ping. |
| Failure display | Ping collection failures omit the metric sample. Existing no-sample rendering displays `N/A`. |
| Network side effects | Traffic-only widgets and empty network source requests must not call `inetLatency()` or send ping traffic. Ping is collected only when a ping metric key is requested. |
| Ping scale settings | No user-facing ping scale, threshold, or ping unit setting is added. |
| Traffic behavior | Existing upload/download/both behavior stays unchanged. |
| Compatibility | The app is not in production. Do not add legacy compatibility paths for the old flat `NetworkMetricTarget` shape. |

## Verified Existing APIs

Installed package:

```text
packages/hub/node_modules/systeminformation/package.json
version: 5.31.5
```

Local type definition:

```ts
export function inetLatency(host?: string, cb?: (data: number) => any): Promise<number>;
```

Runtime behavior from `packages/hub/node_modules/systeminformation/lib/internet.js`:

- default host is `8.8.8.8`;
- Linux uses `ping -c 2 -w 3`;
- macOS uses `ping -c2 -t3`;
- Windows uses `ping <host> -n 1`;
- the resolved value is average latency in milliseconds;
- failed or unparseable output resolves to `null` at runtime even though the
  type definition says `number`.

Existing UI control:

```text
packages/hub/src/property-inspector/controls/TextSetting.tsx
```

Use this control for the ping target input. Do not create another text input
component.

Do not add React Hook Form for this feature. The current Property Inspector
architecture uses typed controls and sparse settings patches, not a form-submit
workflow. React Hook Form manages form state and validation plumbing; it does
not define the product-specific host normalization rules. Adding it here would
cross the PI settings-sync boundary without removing the need for a shared
normalizer.

Existing metric unit state:

```text
contracts/proto/shometrics/v1/metric_common.proto
```

`MetricUnit` currently has no milliseconds value. Add:

```proto
METRIC_UNIT_MILLISECONDS = 16;
```

## Ownership Boundaries

```text
contracts/proto/shometrics/v1/settings.proto
  owns persisted Network traffic-vs-ping selection and ping target host.

packages/hub/src/settings/storage/*
  owns generated proto-to-app resolved settings conversion and sparse patch writes.

packages/hub/src/settings/network-ping-target.ts
  owns user-entered ping target normalization and validation.

packages/hub/src/property-inspector/panels/NetworkWidgetSettings.tsx
  owns visible Network settings composition.

packages/hub/src/runtime/network-metric-keys.ts
  owns stable traffic and ping metric key construction/parsing.

packages/hub/src/runtime/source-routing/metric-source-preferences.ts
  owns local:auto source preference for ping.

packages/hub/src/runtime/sources/node-system/*
  owns systeminformation I/O and conversion into MetricSnapshot values.

packages/hub/src/actions/network/*
  owns Network metric subscriptions and render-facing WidgetData construction.

packages/hub/src/view-rendering/*
  remains unchanged for this feature.
```

Generated settings proto types must stay inside storage and generated-contract
boundaries. Do not import generated settings proto from Property Inspector
panels, action view builders, runtime source code, or rendering code.

## Implementation Steps

Implement in these steps. Do not create temporary compatibility code between
steps.

| Step | Scope | Files | Goal |
| --- | --- | --- | --- |
| Step 1 | Contract and dependency foundation | `packages/hub/package.json`, `packages/hub/package-lock.json`, `contracts/proto/shometrics/v1/settings.proto`, `contracts/proto/shometrics/v1/metric_common.proto`, generated proto | Add the accepted validation dependency and make protobuf contracts able to store ping and emit millisecond samples. |
| Step 2 | Settings and normalization | `settings/resolved-settings.ts`, `settings/storage/*`, `settings/network-ping-target.ts` | Resolve traffic-vs-ping, normalize ping targets, and write sparse settings patches. |
| Step 3 | Runtime source and metric data | `runtime/network-metric-keys.ts`, `runtime/source-routing/*`, `runtime/sources/node-system/*`, `metrics/network-ping-widget-data.ts` | Route ping to node-system, poll requested ping targets only, emit canonical millisecond samples, and build ping WidgetData. |
| Step 4 | Action, PI, and verification | `actions/network*`, `property-inspector/panels/*`, focused tests, verification commands | Subscribe/render ping, expose ping settings, prove traffic behavior remains unchanged, and run the verification gates. |

## Step 1: Contract And Dependency Foundation

### Dependencies

Add runtime dependency:

```powershell
npm.cmd install validator@13.15.35 --save-exact
```

Add the type dependency:

```powershell
npm.cmd install --save-dev @types/validator@13.15.10 --save-exact
```

Use `validator` for host validation because it is browser-safe, covers both IP
and DNS hostname validation, and has zero runtime dependencies in the reviewed
package metadata for `validator@13.15.35`. This adds one direct supply-chain
dependency, not a transitive dependency tree. Keep exact versions in
`package.json` and keep integrity hashes in `package-lock.json`.

Do not use `node:net.isIP()` in the normalizer. The Property Inspector bundle
must not depend on Node-only modules.

Do not use React Hook Form, Zod, `normalize-url`, `is-ip`, or `ip-address` for
this feature:

- React Hook Form manages form state and validation plumbing; it does not define
  product-specific host normalization.
- Zod is a schema framework; it still needs custom IP/FQDN refinements here.
- `normalize-url` canonicalizes URLs and explicitly does not own sanitization.
- `is-ip` covers only IP addresses and has transitive dependencies.
- `ip-address` covers IP parsing only; DNS hostname validation still remains.

Use these `validator` APIs:

```ts
import isFQDN from "validator/lib/isFQDN";
import isIP from "validator/lib/isIP";
```

Validation options for DNS hosts:

```ts
isFQDN(host, {
    require_tld: false,
    allow_underscores: false,
    allow_trailing_dot: false,
})
```

`require_tld: false` keeps local router and intranet names such as `router` and
`nas` valid ping targets. IP addresses are accepted through `isIP(host)`.

After installing dependencies, run:

```powershell
npm.cmd audit --omit=dev
```

Treat a production vulnerability in `validator` as a blocker for this plan.

### `settings.proto`

Replace the current flat `NetworkMetricTarget` fields with this final shape:

```proto
message NetworkMetricTarget {
  enum Kind {
    KIND_UNSPECIFIED = 0;
    KIND_TRAFFIC = 1;
    KIND_PING = 2;
  }

  optional Kind kind = 1 [(buf.validate.field).enum = {
    defined_only: true
    not_in: [0]
  }];

  optional Traffic traffic = 2;
  optional Ping ping = 3;

  message Traffic {
    enum Direction {
      DIRECTION_UNSPECIFIED = 0;
      DIRECTION_BOTH = 1;
      DIRECTION_DOWNLOAD = 2;
      DIRECTION_UPLOAD = 3;
    }

    enum TrafficDisplayMode {
      TRAFFIC_DISPLAY_MODE_UNSPECIFIED = 0;
      TRAFFIC_DISPLAY_MODE_MIRRORED = 1;
      TRAFFIC_DISPLAY_MODE_OVERLAY = 2;
    }

    optional Direction direction = 1 [(buf.validate.field).enum = {
      defined_only: true
      not_in: [0]
    }];
    optional string interface_id = 2 [(buf.validate.field).string.max_len = 256];
    optional TrafficDisplayMode traffic_display_mode = 3 [(buf.validate.field).enum = {
      defined_only: true
      not_in: [0]
    }];
  }

  message Ping {
    optional string target_host = 1 [(buf.validate.field).string.max_len = 253];
  }
}
```

After editing proto, run the proto commands listed in [Verification](#verification).
Regenerated files under `packages/hub/src/generated/` are expected.

### `metric_common.proto`

Add the canonical unit:

```proto
METRIC_UNIT_MILLISECONDS = 16;
```

Source code must emit this enum for ping latency. Do not encode milliseconds as
a free string unit inside source snapshots.

### Resolved Settings

Edit `packages/hub/src/settings/resolved-settings.ts`.

Replace the current one-arm `ResolvedNetworkReading` with:

```ts
export type ResolvedNetworkReading =
    | {
        readonly kind: "traffic";
        readonly interfaceId: string | undefined;
        readonly direction: NetworkDirection;
        readonly trafficDisplayMode: NetworkTrafficDisplayMode;
        readonly display: ResolvedNetworkDisplaySettings;
    }
    | {
        readonly kind: "ping";
        readonly targetHost: string;
    };
```

Rules:

- `ResolvedNetworkMetricTarget` contains only `domain: "network"` and
  `reading: ResolvedNetworkReading`.
- The traffic reading owns `interfaceId` because interface selection is
  traffic-specific and has no ping meaning.
- Traffic readings use the existing `ResolvedNetworkDisplaySettings`.
- Ping readings do not use `ResolvedNetworkDisplaySettings`.
- Ping readings do not expose `interfaceId`.
- Global network defaults remain traffic-only.
- Remove the obsolete comment in `resolved-settings.ts` that blocks ping until
  the stored contract can express it.

### Storage Resolver And Enum Maps

Update these files:

```text
packages/hub/src/settings/storage/resolver.ts
packages/hub/src/settings/storage/enum-maps.ts
packages/hub/src/settings/storage/widget-settings-patch.ts
packages/hub/src/settings/storage/quick-start-widget-settings.ts
```

Required behavior:

- Missing network kind resolves to `traffic`.
- Quick-start Network settings write `kind = KIND_TRAFFIC` and a `traffic`
  submessage with existing default traffic behavior.
- Stored traffic direction defaults to `both`.
- Stored traffic display mode defaults to `mirrored`.
- Stored ping target defaults to normalized `8.8.8.8`.
- Empty or invalid stored ping target resolves to normalized `8.8.8.8`.
- Widget settings patches can switch `network.kind` between `traffic` and
  `ping`.
- Widget settings patches can write `network.pingTargetHost`.
- Traffic-only patch fields write to `target.traffic` and traffic display
  overrides only.
- Ping patches do not write traffic display overrides.

Patch shape:

```ts
readonly network?: Partial<{
    readonly kind: ResolvedNetworkReading["kind"];
    readonly direction: NetworkDirection;
    readonly interfaceId: string;
    readonly trafficDisplayMode: NetworkTrafficDisplayMode;
    readonly pingTargetHost: string;
    readonly scaleMode: ScaleMode;
    readonly maximumDownloadSpeedMegabitsPerSecond: number | undefined;
    readonly maximumUploadSpeedMegabitsPerSecond: number | undefined;
    readonly unitBase: NetworkUnitBase;
}>;
```

## Step 2: Settings And Ping Target Normalization

Create:

```text
packages/hub/src/settings/network-ping-target.ts
packages/hub/src/settings/network-ping-target.test.ts
```

Public API:

```ts
export const DEFAULT_NETWORK_PING_TARGET_HOST = "8.8.8.8";

export type NetworkPingTargetNormalizationStatus =
    | "normalized"
    | "defaulted";

export interface NormalizedNetworkPingTarget {
    readonly targetHost: string;
    readonly status: NetworkPingTargetNormalizationStatus;
}

export function normalizeNetworkPingTargetInput(input: string): NormalizedNetworkPingTarget;
```

Normalization algorithm:

1. Trim the full input string.
2. If empty, return `8.8.8.8` with `status: "defaulted"`.
3. Reject inputs containing ASCII control characters or internal whitespace by
   returning the default target.
4. Parse host:
   - Wrap URL parsing in `try/catch`.
   - If the input starts with `http://` or `https://`, parse with `new URL(input)`.
   - Otherwise parse with `new URL("http://" + input)`.
   - If `new URL(...)` throws, return the default target.
5. Read `url.hostname`.
6. If hostname is empty, return the default target.
7. Remove surrounding IPv6 brackets when present.
8. If `validator/lib/isIP(hostname)` returns true, store the IP string exactly
   as normalized by URL parsing.
9. For DNS names:
   - lowercase with `toLowerCase()`;
   - strip one trailing dot;
   - validate with `validator/lib/isFQDN` using the options listed in
     [Dependencies](#dependencies);
   - require total length `1..253` after lowercasing and trailing-dot stripping.
10. Return invalid DNS names as the default target.

Examples:

| Input | Stored host |
| --- | --- |
| `8.8.8.8` | `8.8.8.8` |
| ` 1.1.1.1 ` | `1.1.1.1` |
| `https://Example.COM/path?q=1` | `example.com` |
| `example.com/path` | `example.com` |
| `http://user:pass@example.com:8080/a#b` | `example.com` |
| `[2606:4700:4700::1111]` | `2606:4700:4700::1111` |
| `https://[2606:4700:4700::1111]/dns-query` | `2606:4700:4700::1111` |
| empty string | `8.8.8.8` |
| `bad host` | `8.8.8.8` |
| `http://` | `8.8.8.8` |
| `[invalid` | `8.8.8.8` |

Do not perform DNS lookup in this helper. Reachability belongs to source
polling.

LOC estimate:

| Code | LOC |
| --- | ---: |
| Custom normalizer production code | 70-120 |
| Custom normalizer tests | 100-180 |
| New package dependencies | 1 exact runtime dependency plus 1 exact dev type dependency |

## Step 3: Runtime Source And Metric Data

### Metric Keys

Edit:

```text
packages/hub/src/runtime/network-metric-keys.ts
packages/hub/src/runtime/network-metric-keys.test.ts
```

Add this key family:

```text
net.ping.latency.<encoded-target-host>
```

Examples:

```text
net.ping.latency.8.8.8.8
net.ping.latency.example.com
net.ping.latency.2606%3A4700%3A4700%3A%3A1111
```

Required exports:

```ts
export function getNetworkPingLatencyMetricKey(targetHost: string): string;
export function isNetworkPingLatencyMetricKey(metricKey: string): boolean;
export function readNetworkPingLatencyMetricTargetHost(metricKey: string): string | undefined;
```

Rules:

- Use `encodeURIComponent()` for the target segment.
- `isNetworkMetricKey()` returns true for traffic and ping keys.
- `readNetworkPingLatencyMetricTargetHost()` decodes only keys that start with
  `net.ping.latency.` and returns `undefined` for all other strings.
- `readNetworkPingLatencyMetricTargetHost()` catches malformed percent encoding and
  returns `undefined`.
- Property Inspector and rendering code must not parse ping metric keys.

### Source Routing

Edit:

```text
packages/hub/src/runtime/source-routing/metric-source-preferences.ts
packages/hub/src/runtime/source-routing/metric-source-preferences.test.ts
```

Required behavior:

- `hasExplicitLocalAutoMetricSourcePreference(getNetworkPingLatencyMetricKey("8.8.8.8"))`
  returns true.
- `resolveLocalAutoMetricSourceCandidates(pingKey, "win32")` returns only
  `node-system`.
- `resolveLocalAutoMetricSourceCandidates(pingKey, "darwin")` returns only
  `node-system`.
- `resolveLocalAutoMetricSourceCandidates(pingKey, "linux")` returns only
  `node-system`.
- Ping must not appear in Windows helper-only or helper-with-node-fallback lists.
- Do not add a default ping host to `NODE_SYSTEM_ONLY_METRIC_KEYS`. Ping hosts
  are dynamic, so routing is covered by the existing `isNetworkMetricKey(metricKey)`
  dynamic match plus tests for `net.ping.latency.*`.

### Node System Source

Edit and create:

```text
packages/hub/src/runtime/sources/node-system/node-system-source.ts
packages/hub/src/runtime/sources/node-system/node-system-source-types.ts
packages/hub/src/runtime/sources/node-system/node-system-network-ping.ts
packages/hub/src/runtime/sources/node-system/node-system-network-ping.test.ts
packages/hub/src/runtime/sources/node-system/node-system-source-network.test.ts
```

Add `inetLatency` to the `NodeSystemInformationClient` dependency surface through
the existing `Omit<typeof si, "cpuCurrentSpeed">` type. Tests must provide a fake
`inetLatency` when ping is exercised.

Create `node-system-network-ping.ts` with source-owned helpers:

```ts
export function resolveRequestedNetworkPingMetricKeys(metricKeys: readonly string[]): readonly string[];

export async function pollNetworkPingMetrics(options: {
    readonly metricKeys: readonly string[];
    readonly systemInformation: Pick<NodeSystemInformationClient, "inetLatency">;
}): Promise<Record<string, MetricValue>>;
```

Required source behavior:

- `resolveRequestedNetworkPingMetricKeys([])` returns `[]`.
- `pollNetworkPingMetrics({ metricKeys: [] })` returns `{}` and does not call
  `inetLatency()`.
- `pollMetrics([])` does not call `inetLatency()` and emits no ping metrics.
- `pollMetrics([pingKey])` polls only the requested ping targets.
- `pollMetrics([trafficKey])` does not call `inetLatency`.
- Ping-only requests do not call `networkInterfaces()` or `networkStats()`.
- One collection pass calls `inetLatency()` once per unique normalized host.
- Finite latency values `>= 0` emit `buildScalarMetricValue(value, { unit:
  MetricUnit.MILLISECONDS })`.
- `null`, `undefined`, `NaN`, `Infinity`, and negative values omit that metric.
- Exceptions from `inetLatency()` are caught at the node-system network boundary,
  logged with the project logger, and omit that target's metric.
- Unreachable targets that return `null` are not logged as errors.

Keep ping in the existing node-system `"network"` polling group in
`resolveNodeSystemMetricGroup()`. Do not add a separate `network-ping` group in
this implementation. Group splitting is out of scope for this feature.

Do not add a pass-through abstraction around network source code. The only new
source file is `node-system-network-ping.ts`.

## Step 4: Action, Rendering, And Property Inspector

### Network Subscriptions

Edit:

```text
packages/hub/src/actions/network/metric-subscriptions.ts
packages/hub/src/actions/network/metric-subscriptions.test.ts
```

Required behavior:

- Traffic reading behavior remains unchanged.
- Ping reading subscribes to exactly one key:
  `getNetworkPingLatencyMetricKey(target.reading.targetHost)`.

### Network View Builder

Edit:

```text
packages/hub/src/actions/network/view-builder.ts
packages/hub/src/actions/network/view-builder.test.ts
packages/hub/src/metrics/network-ping-widget-data.ts
packages/hub/src/metrics/network-ping-widget-data.test.ts
```

Add `network-ping-widget-data.ts` with:

```ts
export function buildNetworkPingWidgetData(options: {
    readonly latencyMilliseconds: number;
    readonly historyLatencyMilliseconds: readonly number[];
    readonly sampleTimestampMilliseconds?: number;
}): WidgetData;
```

Display rules:

- `label` is `PING`.
- `unit` is `ms`.
- `displayValue` is integer milliseconds rounded with `Math.round()`.
- Negative and non-finite input values are treated as `0` only inside this
  display helper; source polling omits invalid values before this helper
  receives them.
- `progress` is clamped `latencyMilliseconds / 200`.
- `history` preserves the passed history values.
- `sparklineScale` is `{ mode: "adaptive", minimumValue: 0 }`.
- The no-sample path uses existing `sampleTimestampMilliseconds == null`
  behavior and renders `N/A`.

View-builder rules:

- Branch on `target.reading.kind`.
- Traffic path keeps current behavior.
- Ping path uses a single `MetricViewOptions` object, not dual-channel data.
- Ping `metricKey` is `getNetworkPingLatencyMetricKey(target.reading.targetHost)`.
- Ping uses existing single-metric rendering for circle, text, line, and bar.
- Ping does not read traffic maxima, traffic direction, interface id, or traffic
  display mode.
- Ping stale TTL uses the same `NETWORK_SAMPLE_STALE_MS = 5000` rule currently
  used for traffic.

### Network Action Shell

Edit:

```text
packages/hub/src/actions/network.ts
packages/hub/src/actions/network.test.ts
```

Required behavior:

- `publishNetworkRuntimeMaximum()` runs only for traffic readings.
- Network interface option publication remains allowed for all Network actions
  because the runtime cache is harmless, but ping rendering must not depend on
  interface options.
- Traffic debug logging remains unchanged.
- Add ping debug logging with owner `Action:Network`, throttled with
  `.everyMs(...)`, including target host, metric key, current latency, progress,
  and sample timestamp.
- Do not log traffic-only maximum fields for ping.

### Property Inspector

Edit:

```text
packages/hub/src/property-inspector/panels/NetworkWidgetSettings.tsx
packages/hub/src/property-inspector/panels/setting-options.ts
packages/hub/src/property-inspector/panels/WidgetSettingsTab.test.ts
```

Add option list:

```ts
export const networkMetricKindOptionList = [
    { value: "traffic", label: "Traffic" },
    { value: "ping", label: "Ping" },
] as const satisfies readonly SelectOption[];
```

Panel behavior:

- The first control in the Metric section is `SelectSetting` labeled
  `Network Metric`.
- Selecting `Traffic` writes `{ network: { kind: "traffic" } }`.
- Selecting `Ping` writes `{ network: { kind: "ping" } }`.
- Traffic mode shows direction and interface controls.
- Traffic mode shows scale and unit settings.
- Traffic mode shows line traffic display controls when the current view and
  direction require them.
- Traffic mode shows network channel color settings only when direction is
  `both`.
- Ping mode shows `TextSetting` labeled `Ping Target`.
- Ping target placeholder is `8.8.8.8`.
- Ping target `onValueChange` normalizes with
  `normalizeNetworkPingTargetInput(value).targetHost` before writing
  `{ network: { pingTargetHost } }`.
- Ping mode hides interface, direction, traffic scale, unit, and traffic display
  controls.
- Ping mode uses `StandardColorSettings`.
- Polling settings remain visible in both modes.
- Appearance settings remain visible in both modes.

Do not add visible explanatory copy to the panel.

## Test Requirements

Add or update tests for these required behaviors:

| Area | Required assertions |
| --- | --- |
| Target normalization | Whitespace trim, URL scheme removal, path/query/hash strip, credentials/port strip, IPv4, IPv6, DNS lowercase, trailing dot strip, URL constructor throws default to `8.8.8.8`, invalid input defaults to `8.8.8.8`. |
| Settings resolver | Missing network kind resolves to traffic; ping resolves target host; invalid ping target defaults; traffic display settings do not affect ping. |
| Settings patch | Can switch traffic to ping; can switch ping to traffic; can write ping target; traffic scale patches stay traffic-only. |
| Quick-start settings | Network action initializes as traffic with the new nested traffic target. |
| Metric keys | Ping keys encode/decode target hosts; malformed encoding returns `undefined`; ping keys are network metric keys. |
| Source routing | Ping local:auto resolves to node-system only on Windows, macOS, and Linux. |
| Node source | Empty metric key request does not call `inetLatency`; empty ping helper input returns no metrics; ping-only request calls `inetLatency` and not traffic stats; traffic-only request does not call `inetLatency`; null/invalid latency omits metric; finite latency emits milliseconds unit. |
| Subscriptions | Ping subscribes to one ping key; traffic subscriptions remain unchanged. |
| Widget data | Ping rounds display value, clamps progress to 200 ms, preserves history, and exposes `ms`. |
| View builder | Ping renders single metric options; ping no-sample renders through existing `N/A`; traffic dual-channel behavior is unchanged. |
| Action shell | Ping does not publish runtime traffic maxima; traffic still publishes maxima. |
| Property Inspector | Ping shows only ping target plus shared settings; traffic shows existing traffic controls. |

## Verification

Run from `packages/hub` unless noted:

```powershell
npm.cmd run proto:format
npm.cmd run proto:lint
npm.cmd run proto:build
npm.cmd run generate:proto
npm.cmd run test:unit
npm.cmd run build
```

Do not run visual tests for this implementation because the planned work reuses
existing single-metric rendering and does not change SVG primitives, SVG layout,
or widget styles.

## Estimated LOC

Generated code is excluded.

| Group | Production LOC | Test LOC |
| --- | ---: | ---: |
| Contract and settings | 220-400 | 220-400 |
| Runtime and source | 230-430 | 260-470 |
| Action and PI | 220-420 | 220-400 |
| Verification-only adjustments | 0-40 | 0-80 |

Expected feature-complete hand-written LOC: 1,050-2,100.

The implementation intentionally includes the clean proto shape and full
upstream/downstream tests. Do not reduce LOC by keeping the old flat
`NetworkMetricTarget`, adding handwritten schema mirrors, or bypassing generated
proto updates.

## Completion Criteria

- Network widget can switch between Traffic and Ping.
- Ping target input stores normalized hosts for IP, domain, and URL-like input.
- Default ping target is `8.8.8.8`.
- Ping uses `systeminformation@5.31.5` `inetLatency(host)`.
- Empty source requests and traffic-only requests do not call `inetLatency()`.
- Ping emits `METRIC_UNIT_MILLISECONDS`.
- Ping route is node-system only on Windows, macOS, and Linux.
- Ping failure renders `N/A` through existing no-sample behavior.
- Traffic widgets keep existing upload/download/both behavior.
- Property Inspector shows only mode-relevant controls.
- No generated settings type leaks outside storage/generated boundaries.
- Only `validator@13.15.35` and `@types/validator@13.15.10` are added for ping
  target validation.
- Verification commands pass.


