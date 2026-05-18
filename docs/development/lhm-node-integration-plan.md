# LHM to Node Integration Plan

This plan describes how LibreHardwareMonitor data becomes ShoMetrics runtime telemetry without requiring the Stream Deck plugin process to run as administrator.

## Fixed Decisions

- The Stream Deck plugin remains a non-admin Node.js process.
- Windows deep sensors use an installed ShoMetrics Windows helper/service, not a Node-spawned elevated child.
- Phase 1 Windows helper service runs as `LocalSystem`.
- Phase 1 service SID type is `unrestricted`.
- Local Windows helper transport is Windows named pipe + length-prefixed protobuf.
- Remote monitoring is a separate transport concern. It will use gRPC over TLS with shared protobuf contracts.
- The protobuf message contract is shared where possible. The transport adapters differ.
- C# source API and IPC messages use `Google.Protobuf` generated classes from `contracts/proto`; do not hand-write mirrored DTOs.
- Node pulls data from sources. Helpers do not push into the plugin.
- Node owns polling cadence, timeout, fallback, history, and rendering.
- The helper owns hardware access and raw-source normalization only. It does not own history.
- Actions must not know whether telemetry came from LHM, systeminformation, a Windows service, or a remote agent.
- Windows helper distribution uses a WiX/MSI installer. Do not ship a script-based portable installer as the product installation path.
- Phase 1 Windows helper builds are unsigned. SmartScreen and security software warnings are accepted until the signing phase.
- The first Windows service implementation is not NativeAOT/trimming-enabled. Publish-mode hardening happens after named pipe end-to-end validation.

## Not Decided Yet

- Exact WiX/MSI upgrade codes, product codes, and UI flow.
- Code signing release timing after unsigned alpha builds.
- Final Windows helper production publish mode after dev-pipe end-to-end validation.

## Current State vs Target State

| Area | Current | Target |
|---|---|---|
| Action subscription | Action classes expose only metric keys. | `MetricAction` converts resolved source policy plus metric keys into a `MetricReadPlan`. |
| Scheduler | Owns one global `MetricSource`. | Groups by read plan signature plus interval, then polls a `SourceRunner`. |
| MetricStore | Stores history by bare metric key. | Stores history by source-scoped metric identity. |
| Runtime source | `NodeSystemSource` directly backs all polling. | `SourceRunner` tries source candidates and merges fallback results for missing metrics. |
| Windows LHM | One-shot C# CLI prints JSON. | Installed Windows service exposes read-only source API over named pipe. |
| Dynamic LHM sensors | C# has explicit curated mappings only. | C# returns stable aliases for common metrics and descriptors for dynamic sensors. |
| Local IPC | None. | Named pipe with OS ACLs and length-prefixed protobuf. |
| Remote source | Not implemented. | Later remote agent uses gRPC over TLS with compatible protobuf messages. |

## Runtime Boundary

The runtime boundary must stay:

```txt
Action
  -> MetricReadPlan
  -> Scheduler
  -> SourceRunner
  -> SourceClient transport adapter
  -> MetricStore
  -> WidgetData/rendering
```

Actions may choose a metric target from resolved settings, but they must not choose a concrete transport. `MetricAction` converts resolved source policy into a read plan; source availability and fallback execution belong to `SourceRunner` and `SourceClient`.

## Proto Contract

Create source API protos separate from persisted settings:

```txt
contracts/proto/shometrics/v1/source_api.proto
contracts/proto/shometrics/v1/source_ipc.proto
```

Do not put source availability, runtime descriptors, helper install state, or resolved read plans into Stream Deck settings.

`source_api.proto` contains business request and response messages shared by local IPC and future remote RPC:

```proto
syntax = "proto3";
package shometrics.v1;

import "shometrics/v1/snapshot.proto";

message GetSourceHealthRequest {}

message GetSourceHealthResponse {
  string source_id = 1;
  string protocol_version = 2;
  string helper_version = 3;
  repeated SourceWarning warnings = 4;
}

message ListMetricDescriptorsRequest {
  repeated string metric_ids = 1;
}

message ListMetricDescriptorsResponse {
  repeated MetricDescriptor descriptors = 1;
  repeated SourceWarning warnings = 2;
}

message ReadMetricSnapshotRequest {
  repeated string metric_ids = 1;
  bool include_descriptors = 2;
}

message ReadMetricSnapshotResponse {
  MetricSnapshot snapshot = 1;
  repeated MetricDescriptor descriptors = 2;
  repeated SourceWarning warnings = 3;
}

message MetricDescriptor {
  string metric_id = 1;
  string source_sensor_id = 2;
  string hardware_id = 3;
  string hardware_name = 4;
  string sensor_name = 5;
  string sensor_type = 6;
  string unit = 7;
  bool is_dynamic = 8;
}
```

`source_ipc.proto` contains the local IPC envelope. Windows named pipes and future macOS/Linux local IPC transports should use this envelope unless the transport already provides method routing and correlation:

```proto
syntax = "proto3";
package shometrics.v1;

import "shometrics/v1/source_api.proto";

message SourceIpcRequest {
  string request_id = 1;

  oneof payload {
    GetSourceHealthRequest get_source_health = 2;
    ListMetricDescriptorsRequest list_metric_descriptors = 3;
    ReadMetricSnapshotRequest read_metric_snapshot = 4;
  }
}

message SourceIpcResponse {
  string request_id = 1;

  oneof payload {
    GetSourceHealthResponse get_source_health = 2;
    ListMetricDescriptorsResponse list_metric_descriptors = 3;
    ReadMetricSnapshotResponse read_metric_snapshot = 4;
    SourceError error = 5;
  }
}
```

Implementation notes:

- Business operations use dedicated request and response messages so local IPC and future remote RPC can share the same core contract.
- `SourceIpcRequest` and `SourceIpcResponse` are transport envelopes for local IPC routing and correlation. Do not add IPC-specific fields to the business request messages.
- Do not create `WindowsPipeRequest` or platform-specific envelope messages unless a platform transport needs fields that the shared IPC envelope cannot model.
- `protocol_version` is the source API compatibility version. Node must reject helpers with an unsupported protocol version and fallback.
- `helper_version` is the installed helper build/version string for diagnostics and support logs. Node must not parse feature behavior from `helper_version`.
- `metric_id` is the ShoMetrics metric key consumed by Node.
- `source_sensor_id` is source-owned and opaque. For LHM it can be the LHM sensor path.
- Stable aliases such as `cpu.usage_percent`, `gpu.temp`, `ram.used`, `net.down`, and `disk.throughput.read` are explicit.
- Dynamic metrics are still exposed through descriptors. Node must not parse LHM-specific path structure.
- `MetricSnapshot` may need extension if per-value source diagnostics or descriptor references become necessary.

Proto generation:

- Keep `contracts/proto` as the single source of truth.
- TypeScript continues to use Buf + `protoc-gen-es` through `packages/hub/scripts/proto/buf.gen.yaml`, generated into `packages/hub/src/generated`.
- C# uses the same proto files from `contracts/proto`; do not create hand-written mirrored DTOs for source API or IPC messages.
- Generated TypeScript remains build output and is not committed unless the repo policy changes for all generated proto outputs.
- Generated C# must stay build output under `obj`. If a generator cannot do this, stop and document the blocker before adding checked-in generated files.
- New proto files must pass `npm.cmd run proto:format`, `npm.cmd run proto:lint`, and `npm.cmd run proto:build` from `packages/hub`.

## Runtime Refactor

### Before

```ts
protected getMetricSubscriptionKeys(event: WillAppearEvent): readonly string[] {
    return [CPU_USAGE_METRIC_KEY];
}

export const scheduler = new Scheduler(new NodeSystemSource());
```

### After

Introduce a read plan type under `packages/hub/src/runtime/sources/`:

```ts
export interface SourceCandidate {
    readonly sourceId: string;
}

export interface MetricReadPlan {
    readonly sourceScopeId: string;
    readonly metricKeys: readonly string[];
    readonly sourceCandidates: readonly SourceCandidate[];
    readonly failureMode: "fallback" | "empty";
}
```

Action shape:

```ts
protected getMetricKeys(event: WillAppearEvent): readonly string[] {
    return [CPU_USAGE_METRIC_KEY, CPU_MODEL_METRIC_KEY];
}
```

`MetricAction` builds the runtime plan:

```ts
return buildMetricReadPlanFromSourcePolicy({
    metricKeys,
    sourcePolicy: settings.widget.slot.metric.source,
    defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
});
```

Scheduler group identity becomes:

```txt
pollingIntervalMilliseconds + sourceScopeId + failureMode + sourceCandidates
```

Scheduler grouping rules:

- The scheduler must coalesce subscriptions that share the same polling interval, source scope, and source candidate order.
- Coalesced subscriptions must produce one `MetricReadPlan` whose `metricKeys` are the sorted unique union of requested metric keys.
- The scheduler must send one snapshot request for the coalesced plan, then fan out store/render notifications to the subscribed actions.
- Do not issue one `ReadSnapshot` request per action when multiple actions can be served by the same source scope and polling interval.

`MetricStore` identity becomes source-scoped:

```ts
export interface MetricStoreKey {
    readonly sourceScopeId: string;
    readonly metricKey: string;
}
```

Rules:

- Do not keep source selection in action classes.
- Do not persist `MetricReadPlan`.
- Do not import settings proto in runtime source adapters.
- Do not let generated proto enter rendering code.
- Do not maintain a legacy bare-key path after actions are converted.

## Source Runner

Add a source runner under:

```txt
packages/hub/src/runtime/sources/source-runner.ts
packages/hub/src/runtime/sources/source-registry.ts
```

Target interface:

```ts
export interface SourceClient {
    readonly sourceId: string;
    readSnapshot(metricKeys: readonly string[]): Promise<MetricSnapshot>;
    listMetricDescriptors?(metricKeys: readonly string[]): Promise<readonly MetricDescriptor[]>;
    checkHealth?(): Promise<SourceHealth>;
    getCachedStatus?(): SourceClientStatus;
    dispose?(): void;
}

export interface SourceRunner {
    poll(readPlan: MetricReadPlan): Promise<MetricSnapshot>;
    dispose(): void;
}
```

Fallback behavior:

- Try source candidates in order.
- For each requested metric key, keep the first valid value returned by the highest-priority available source.
- If the primary source returns only some metrics, fill missing metrics from fallback sources.
- If all candidates fail for a metric, omit that metric from the snapshot.
- Log fallback reasons at the source runner boundary with throttling.
- Do not mutate settings or action state based on fallback results.
- SourceRunner does not decide sensor semantics. Source adapters must omit semantically invalid values before returning a snapshot.

## Source Policy To Read Plan

Resolved settings source policy is converted into a runtime `MetricReadPlan` by:

```txt
packages/hub/src/runtime/sources/metric-read-plan-builder.ts
```

Rules:

- `metric-read-plan-builder.ts` owns only resolved source policy -> runtime read plan conversion.
- It does not probe helper availability, open pipes, read source health, or mutate settings.
- It receives only the resolved widget source policy and resolved global `defaultSourceProfileId`; it must not consume `sourceProfiles` directly.
- Built-in local source profile ids use a reserved `local:*` namespace and are recognized before any user-defined profile handling.
- Known built-in ids:
  - `local:auto`
  - `local:windows-helper`
  - `local:node-system`
- `local:auto` expands to `[windows-helper, node-system]` on Windows and `[node-system]` elsewhere until macOS/Linux helpers exist.
- Unknown `local:*` ids resolve to local scope with no source candidates. They must not be passed to `SourceRunner` as registry source ids.
- User-defined source profile ids map to runtime source ids with the `source-profile:` prefix. The registry owns whether a matching `SourceClient` exists.
- `checkHealth()` performs source-owned I/O and may update the client's cached status.
- `getCachedStatus()` returns the latest client-owned runtime status without I/O. It is for diagnostics and future PI debug views, not for render decisions.

### Runtime Case Table

| Case | Read plan | Runtime behavior |
|---|---|---|
| User never installed helper | `local:auto` -> `windows-helper`, `node-system` on Windows | Helper client fails with pipe-missing, caches a 5 minute retry cooldown, and `SourceRunner` falls back to `node-system`. |
| Helper installed but unhealthy | `local:auto` or explicit helper | Helper client uses transient backoff of 5 s, then 15 s, then 60 s max; fallback runs only when the read plan allows it. |
| Explicit source is `node-system`, no fallback | `local:node-system` only, `failureMode=empty` | Only `node-system` is queried. Helper health does not matter. |
| Explicit source is `node-system`, fallback enabled | `node-system` plus configured fallback ids | `node-system` is primary. Fallback candidates are tried only for missing/failed metrics. |
| Explicit source is `windows-helper`, no fallback | `local:windows-helper` only, `failureMode=empty` | Helper failure yields missing metrics/placeholders. `node-system` is not queried. |
| Explicit source is `windows-helper`, fallback enabled | `windows-helper` plus configured fallback ids | Helper is primary; missing or failed metrics may be filled from fallback candidates such as `node-system`. |
| Helper installed, user never touched settings | `local:auto` | Windows tries helper first and fills from `node-system` when needed. Non-Windows uses `node-system` until native helpers exist. |
| Helper was healthy but stops returning data | Existing plan unchanged | Request failure updates cached status/backoff; success later resets transient backoff; fallback continues when allowed. |
| User installs plugin and helper without opening PI | Runtime plan is built from resolved settings on action appear | No PI dependency. A Stream Deck/plugin restart gives the process a fresh helper client; no system reboot is required unless the driver stack itself requires it. |
| Helper broken and user opens PI | No settings mutation | Future PI debug can call `getCachedStatus()` and optional `checkHealth()` through the runtime source registry to show current source, last success, and retry time. |
| Remote source without fallback | `source-profile:<id>` only, `failureMode=empty` | Remote failure produces missing metrics/placeholders; local fallback is not implicit. |
| Future macOS/Linux helper | Same builder, new built-in candidate expansion | Add platform helper source id and registry client; `SourceRunner` fallback logic is reused. |

## Metric Value Validation

Validation rules are part of the source contract. They must be implemented consistently by local helpers, Node fallback sources, and future remote agents. Invalid values are omitted from the snapshot and reported through source warnings so `SourceRunner` can fallback.

| Metric type | Valid zero? | Invalid examples | Notes |
|---|---:|---|---|
| CPU/GPU load percent | Yes | `< 0`, `> 100`, `NaN`, `Infinity` | Clamp is not allowed at source boundaries. Bad source values are omitted. |
| CPU/GPU temperature celsius | No for normal hardware sensors | `<= 0`, `< -20`, `> 130`, `NaN`, `Infinity` | `0C` from LHM is treated as sensor failure, not real ambient data. |
| RAM used bytes | Yes | `< 0`, `NaN`, `Infinity` | `0` can be valid on tiny/test fixtures, but not useful in normal production. |
| RAM total bytes | No | `<= 0`, `NaN`, `Infinity` | If total is invalid, omit derived memory percent/total metrics. |
| VRAM used bytes | Yes | `< 0`, `NaN`, `Infinity` | Requires valid total for percent-style display. |
| VRAM total bytes | No | `<= 0`, `NaN`, `Infinity` | Omit total when the device does not report capacity. |
| Network throughput bytes per second | Yes | `< 0`, `NaN`, `Infinity` | `0` is a valid idle network reading. |
| Disk throughput bytes per second | Yes | `< 0`, `NaN`, `Infinity` | `0` is a valid idle disk reading. |
| Power watts | Source-specific | `< 0`, `NaN`, `Infinity` | `0W` may be valid at idle for some sensors but is suspicious for GPU package power. Adapter must use descriptor context. |
| Frequency hertz/gigahertz | No | `<= 0`, `NaN`, `Infinity` | Omit when the source cannot distinguish base/current/boost semantics. |
| Text descriptors | Non-empty only | empty or whitespace-only string | Model names may be normalized, but not invented. |

If a metric is outside these rules, add the validation rule here before implementing it in any adapter.

## Windows Helper Service

Add a real service project:

```txt
packages/source-windows/ShoMetrics.Source.Windows.Service/
```

Keep the current one-shot helper:

```txt
packages/source-windows/ShoMetrics.Source.Windows.Helper/
```

Project ownership:

| Project | Owns |
|---|---|
| `ShoMetrics.Source.Windows.Core` | LHM access, PawnIO diagnostics, metric/descriptors mapping. |
| `ShoMetrics.Source.Windows.Service` | Windows service host, named pipe server, protobuf request/response loop, service logs. |
| `ShoMetrics.Source.Windows.Helper` | One-shot and dev diagnostics only. |
| `ShoMetrics.Source.Windows.ControlPanel` | Future helper install/status UI. |

The service API is read-only:

- health
- list metric descriptors
- read snapshot

It must not expose:

- command execution
- arbitrary file reads/writes
- arbitrary DLL loading
- driver installation
- setting mutation from Node

Phase 1 service account:

- Install the service under `LocalSystem`.
- Set the service SID type to `unrestricted`.
- Do not use `LocalService`, `NetworkService`, or a custom user account for Phase 1.
- Revisit restricted service hardening only after LHM/PawnIO access is proven under the service host.
- The installer requires UAC. The Stream Deck plugin and Node process must remain non-admin.
- Code signing is not required for dev/alpha functionality. Unsigned installer/service binaries may trigger SmartScreen and security software warnings.

Service host implementation:

- Use .NET Generic Host with Windows Service lifetime.
- Support a console/dev mode in the same service executable so elevated PowerShell can run the pipe server without installing the service.
- Do not create a second service-only entry point or a second dev-only host.
- The service host owns cancellation, shutdown, dependency injection, logging setup, and pipe server lifetime.
- The LHM `Computer` lifetime belongs to `ShoMetrics.Source.Windows.Core` or a Core-owned service wrapper injected into the service host.
- Pipe connections may be concurrent, but LHM hardware update/read access must be serialized inside the Core/service boundary.

Required service packages:

- `Microsoft.Extensions.Hosting.WindowsServices` for Windows Service lifetime integration.
- `Serilog.Extensions.Hosting` for `UseSerilog()`.
- `Serilog.Sinks.Console` for dev pipe console diagnostics.
- `Serilog.Sinks.EventLog` for Windows Event Log output.
- `Serilog.Sinks.File` for `%ProgramData%` rolling file output.
- `Google.Protobuf` for generated protobuf message runtime.
- `Grpc.Tools` with `GrpcServices="None"` for build-time C# message generation only.
- `System.IO.Pipes.AccessControl` for named pipe ACL creation.

Service executable modes:

| Mode | Trigger | Behavior |
|---|---|---|
| Windows Service | launched by Service Control Manager | Runs pipe server with Windows Service lifetime and writes service logs. |
| Dev pipe | `--dev-pipe` | Runs the same host and pipe server as a console process for elevated local testing. |
| Help/version | `--help`, `--version` | Prints command help or helper version and exits without touching LHM/PawnIO. |

The service executable must not install or uninstall itself. Installation belongs to WiX/MSI.

Service logging:

- Use Serilog with Generic Host `UseSerilog()`. Do not wire Serilog only through `ILoggingBuilder.AddSerilog()`.
- Write `Warning` and higher events to Windows Event Log.
- Write `Debug` and higher events to a rolling file under `%ProgramData%\ShoMetrics\Source.Windows\logs`.
- Flush logs during service shutdown.
- Do not log successful `ReadSnapshot` requests.
- Log service startup failure, LHM initialization failure, pipe bind failure, unauthorized clients, malformed frames, oversized frames, protobuf decode failures, timeouts, and unhandled request errors.
- Validation warnings must be throttled per metric or source sensor. A bad sensor must not flood logs.
- Do not log complete protobuf payloads, full hardware dumps, arbitrary file paths, or other large/sensitive payloads. Prefer request id, metric id, source id, source sensor id, and error code.

## C# Service Implementation Spec

The current C# code has a Core snapshot reader and a one-shot Helper CLI. It does not yet have an implementation-level service spec. The rules below are the source of truth for the next C# implementation pass.

### C# Step 1: Add Service Project

Create:

```txt
packages/source-windows/ShoMetrics.Source.Windows.Service/
```

Add the project to:

```txt
packages/source-windows/ShoMetrics.Source.Windows.slnx
```

Project file requirements:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0-windows</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\ShoMetrics.Source.Windows.Core\ShoMetrics.Source.Windows.Core.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Google.Protobuf" Version="[PINNED_VERSION]" />
    <PackageReference Include="Grpc.Tools" Version="[PINNED_VERSION]" PrivateAssets="all" />
    <PackageReference Include="Microsoft.Extensions.Hosting.WindowsServices" Version="[PINNED_VERSION]" />
    <PackageReference Include="Serilog.Extensions.Hosting" Version="[PINNED_VERSION]" />
    <PackageReference Include="Serilog.Sinks.Console" Version="[PINNED_VERSION]" />
    <PackageReference Include="Serilog.Sinks.EventLog" Version="[PINNED_VERSION]" />
    <PackageReference Include="Serilog.Sinks.File" Version="[PINNED_VERSION]" />
    <PackageReference Include="System.IO.Pipes.AccessControl" Version="[PINNED_VERSION]" />
  </ItemGroup>
</Project>
```

Rules:

- Do not enable NativeAOT or trimming in the first service project. Publish-mode hardening is a later step after the service passes end-to-end IPC validation.
- Do not add gRPC server/client packages. `Grpc.Tools` is used only for protobuf message generation.
- `[PINNED_VERSION]` is a placeholder in this spec, not a literal package version.
- Replace every `[PINNED_VERSION]` with an exact bracketed version after checking NuGet metadata. Do not use floating versions and do not guess package versions.
- Keep `packages.lock.json` updated. If NuGet metadata cannot be checked, stop and ask instead of committing guessed dependency versions.
- Keep `signatureValidationMode=require`. If Microsoft-authored dependencies require author trust, add exact Microsoft author certificate fingerprints to `packages/source-windows/NuGet.config`; do not disable package signature validation.
- Do not make the service executable install or uninstall itself.
- Do not move ControlPanel or installer code into the service project.

### C# Step 2: Generate Protobuf Contracts

The service must generate C# messages from the same proto files used by Node:

```txt
contracts/proto/shometrics/v1/snapshot.proto
contracts/proto/shometrics/v1/source_api.proto
contracts/proto/shometrics/v1/source_ipc.proto
```

Add `csharp_namespace` options before generating C#:

```proto
option csharp_namespace = "ShoMetrics.Contracts.V1";
```

Project file protobuf items:

```xml
<ItemGroup>
  <Protobuf Include="..\..\..\contracts\proto\shometrics\v1\snapshot.proto"
            ProtoRoot="..\..\..\contracts\proto"
            GrpcServices="None" />
  <Protobuf Include="..\..\..\contracts\proto\shometrics\v1\source_api.proto"
            ProtoRoot="..\..\..\contracts\proto"
            GrpcServices="None" />
  <Protobuf Include="..\..\..\contracts\proto\shometrics\v1\source_ipc.proto"
            ProtoRoot="..\..\..\contracts\proto"
            GrpcServices="None" />
</ItemGroup>
```

Rules:

- `contracts/proto` remains the only source of truth.
- Do not hand-write mirrored DTOs for `SourceIpcRequest`, `SourceIpcResponse`, `MetricSnapshot`, `MetricValue`, `MetricDescriptor`, `SourceWarning`, or `SourceError`.
- Generated C# stays build output under `obj`; do not commit generated C# files.
- If proto generation fails, fix generation. Do not introduce handwritten replacements.
- After proto changes, run `npm.cmd run proto:format`, `npm.cmd run proto:lint`, and `npm.cmd run proto:build` from `packages/hub`.
- After C# project changes, run `dotnet restore .\packages\source-windows\ShoMetrics.Source.Windows.slnx --locked-mode`, then `dotnet build .\packages\source-windows\ShoMetrics.Source.Windows.slnx --no-restore`.

### C# Step 3: Service Executable Modes

Implement one entry point:

```txt
packages/source-windows/ShoMetrics.Source.Windows.Service/Program.cs
```

Supported modes:

| Mode | Trigger | Behavior |
|---|---|---|
| Windows Service | launched by SCM | Runs the same Generic Host and pipe server with Windows Service lifetime. |
| Dev pipe | `--dev-pipe` | Runs the same Generic Host and pipe server as a console process for elevated local testing. |
| Help | `--help`, `-h` | Prints supported modes and exits `0`. |
| Version | `--version` | Prints helper version and exits `0`. |

Rules:

- Unknown arguments exit `1` and do not touch LHM/PawnIO.
- `--help` and `--version` must not initialize LHM/PawnIO or bind the named pipe.
- `--dev-pipe` must use the same request handler, pipe server, protobuf mapping, and Core reader as Windows Service mode.
- Use `Host.CreateDefaultBuilder(args)` so the host can call `UseWindowsService()` and Serilog `UseSerilog()` at the host boundary.
- Use `UseWindowsService()` for service lifetime integration.
- Do not replace `UseSerilog()` with only `ILoggingBuilder.AddSerilog()`.

Required files:

```txt
Program.cs
WindowsSourceWorker.cs
WindowsPipeSourceServer.cs
SourceRequestHandler.cs
SourceProtocolMapper.cs
SourceIpcFrameCodec.cs
WindowsPipeSecurity.cs
WindowsPipeClientVerifier.cs
SourceServiceConstants.cs
```

Do not split further unless a file exceeds 800 lines or starts owning two unrelated responsibilities.

### C# Step 4: Pipe Server

`WindowsPipeSourceServer` owns the named pipe accept loop and per-connection request loop.

Required constants:

```csharp
internal static class SourceServiceConstants
{
    public const string SourceId = "windows-helper";
    public const string ProtocolVersion = "1";
    public const string PipeName = "ShoMetrics.Source.Windows.v1";
    public const int MaximumFrameBytes = 1024 * 1024;
}
```

Pipe creation must use `NamedPipeServerStreamAcl.Create` with:

```txt
PipeDirection.InOut
PipeTransmissionMode.Byte
PipeOptions.Asynchronous
NamedPipeServerStream.MaxAllowedServerInstances
```

Pipe ACL rules:

| SID | Rights |
|---|---|
| `LocalSystem` | `FullControl` |
| `BUILTIN\Administrators` | `FullControl` |
| `BUILTIN\Users` | `ReadWrite` |

Rules:

- Do not use `PipeOptions.CurrentUserOnly`; the service runs as `LocalSystem` and must accept the non-admin Stream Deck plugin user.
- Reject remote pipe clients after connection using `GetNamedPipeClientComputerNameW`. Accept only the local computer name.
- If remote-client verification fails, close the connection without executing a request.
- Each pipe connection is processed as ordered request/response pairs.
- Do not implement request pipelining.
- Server may accept multiple clients concurrently, but the hardware read path must be serialized.
- Track active client tasks and stop accepting new clients during host shutdown.
- On shutdown, cancel active request loops, dispose active pipe streams, and await client completion with a bounded timeout.

### C# Step 5: Frame Codec

`SourceIpcFrameCodec` owns length-prefixed protobuf framing.

Read frame algorithm:

```txt
read exactly 4 bytes
interpret as uint32 little-endian payload_length
reject payload_length == 0
reject payload_length > 1 MiB before allocating payload buffer
read exactly payload_length bytes
parse SourceIpcRequest
```

Write frame algorithm:

```txt
serialize SourceIpcResponse
reject payload size == 0
reject payload size > 1 MiB
write uint32 little-endian payload_length
write payload bytes
flush pipe
```

Rules:

- Use `BinaryPrimitives.ReadUInt32LittleEndian` and `BinaryPrimitives.WriteUInt32LittleEndian`.
- Do not use JSON on the service IPC path.
- Do not reuse the one-shot Helper CLI JSON serializer for service IPC.
- Malformed protobuf responses are impossible on the server side; malformed requests must return `malformed_request` when a response can still be written, otherwise close the connection.
- Oversized frames must close the connection; do not allocate the payload.

### C# Step 6: Request Handler

`SourceRequestHandler` owns command dispatch from `SourceIpcRequest` to source API responses.

Target shape:

```csharp
internal sealed class SourceRequestHandler
{
    public Task<SourceIpcResponse> HandleAsync(SourceIpcRequest request, CancellationToken cancellationToken);
}
```

Dispatch rules:

| Request payload | Handler behavior |
|---|---|
| Empty payload | Return `SourceError` with `code="invalid_request"`. |
| `get_source_health` | Return source id, protocol version, helper version, and warnings. Must not read a full LHM snapshot. |
| `read_metric_snapshot` | Read Core snapshot, map requested metrics to proto `MetricSnapshot`, include descriptors only when requested. |
| `list_metric_descriptors` | Return descriptors for requested metric ids, or all stable descriptors when request list is empty. |

Timeout rules:

| Operation | Service hard cap |
|---|---:|
| Health | 1 s |
| Read snapshot | 3 s |
| List descriptors | 8 s |

Implementation rules:

- Wrap each request with a linked `CancellationTokenSource` using the operation hard cap.
- Return `SourceError` with `code="timeout"` when the operation exceeds the service hard cap.
- Return `SourceError` with `code="source_unavailable"` when the Core reader cannot initialize LHM/PawnIO.
- Return `SourceError` with `code="internal_error"` for unexpected exceptions after logging the exception.
- Echo `request_id` from request to response.
- Do not mutate settings, install drivers, execute commands, read arbitrary files, or load arbitrary DLLs.

### C# Step 7: Core Reader Ownership

The service must not create and dispose a LibreHardwareMonitor `Computer` for every 1 Hz read in production service mode.

Add a Core-owned long-lived reader before wiring the service hot path:

```txt
packages/source-windows/ShoMetrics.Source.Windows.Core/LibreHardwareMonitorSession.cs
packages/source-windows/ShoMetrics.Source.Windows.Core/HardwareMetricDescriptor.cs
```

Target shape:

```csharp
public sealed class LibreHardwareMonitorSession : IDisposable
{
    public Task<MetricSnapshot> ReadSnapshotAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken);

    public Task<HardwareMetricDescriptorSnapshot> ListMetricDescriptorsAsync(
        IReadOnlyCollection<string> metricIds,
        CancellationToken cancellationToken);
}
```

Rules:

- The session owns the LHM `Computer` lifetime.
- Open LHM once during session initialization.
- Serialize LHM `Update()` and sensor traversal with `SemaphoreSlim`.
- Do not expose LHM types outside Core.
- `MetricSnapshot` in this step means `ShoMetrics.Source.Windows.Core.MetricSnapshot`, not the protobuf `MetricSnapshot`.
- `HardwareMetricDescriptor` is a Core DTO with descriptor metadata only. It must not reference generated protobuf types.
- `HardwareMetricDescriptorSnapshot` carries descriptors plus source warnings. It must not reference generated protobuf types.
- The existing one-shot `ShoMetrics.Source.Windows.Helper` may keep using the existing CLI path until it is intentionally migrated.
- If long-lived LHM session initialization fails, service health must report a warning and snapshot reads must return `source_unavailable`.

### C# Step 8: Metric Mapping

Service responses must use ShoMetrics canonical metric ids consumed by Node. The current C# POC metric ids such as `cpu.load.percent` and `cpu.package.temperature.celsius` are diagnostic-only and must not be returned by the service API unless Node also consumes them.

Initial stable aliases required for service MVP:

| Node metric id | C# source mapping |
|---|---|
| `cpu.usage_percent` | LHM CPU Total load |
| `gpu.usage_percent` | LHM GPU Core load |
| `gpu.temp` | LHM GPU Core temperature |
| `gpu.power` | LHM GPU Package or GPU Power |
| `gpu.vram_used` | LHM GPU Memory Used converted to bytes |
| `gpu.vram_total` | LHM GPU Memory Total converted to bytes |
| `ram.used` | LHM Memory Used converted to bytes |
| `ram.total` | LHM Memory Used + Memory Available converted to bytes |
| `net.down` | Aggregate LHM Download Speed |
| `net.up` | Aggregate LHM Upload Speed |
| `disk.throughput.read` | Aggregate LHM Read Rate |
| `disk.throughput.write` | Aggregate LHM Write Rate |
| `disk.throughput.total` | Read + write aggregate |

Rules:

- Units returned in proto must match Node expectations: `%`, `°C`, `W`, `B`, or `B/s`.
- LHM `Data` values in GB must be converted to bytes before writing `MetricValue.scalar`.
- Unknown requested metric ids are omitted from the snapshot and reported through `SourceWarning` with `code="metric_unavailable"`.
- Semantically invalid values are omitted and reported through `SourceWarning`; do not clamp at the service boundary.
- `0C` for normal CPU/GPU temperature is invalid and must be omitted.
- Network and disk throughput may validly be `0`.
- Dynamic LHM sensor descriptors may be listed later, but the first service MVP must not expose dynamic metric ids as widget values until Node has a selector UI for them.

### C# Step 9: Proto Mapping

`SourceProtocolMapper` owns conversion from Core models to protobuf messages.

Rules:

- Core must not reference generated protobuf types.
- Service may reference generated protobuf types.
- Service files that use both Core and protobuf snapshot types must alias at least one of them at the top of the file. Do not rely on ambiguous bare `MetricSnapshot` names.
- `MetricSnapshot.source_id` must be `windows-helper`.
- `MetricSnapshot.timestamp_ms` must use Unix time milliseconds from `MetricSnapshot.CapturedAt`.
- `MetricValue.scalar` is used for numeric readings.
- `MetricValue.text` is used only for model/name descriptors when Node requests text metrics in the future.
- `MetricValue.progress` must be set for percentage values as `value / 100`. Non-percentage values must leave progress at proto default `0` because Node render adapters compute progress from metric-specific maxima.
- Descriptors use:
  - `metric_id` = ShoMetrics canonical metric id
  - `source_sensor_id` = LHM sensor identifier
  - `hardware_id` = LHM hardware identifier
  - `hardware_name` = LHM hardware name
  - `sensor_name` = LHM sensor name
  - `sensor_type` = LHM sensor type
  - `unit` = proto value unit
  - `is_dynamic` = `false` for stable aliases

### C# Step 10: Logging

Logging owners:

| Owner | Logs |
|---|---|
| `Program` | mode selection, startup failure |
| `WindowsSourceWorker` | service start/stop |
| `WindowsPipeSourceServer` | pipe bind, connection reject, malformed frame, oversized frame |
| `SourceRequestHandler` | request timeout, source unavailable, unexpected handler exception |
| `LibreHardwareMonitorSession` | LHM init failure, hardware update failure, validation warning throttles |

Rules:

- Do not log successful `ReadSnapshot` requests.
- Do not log full sensor dumps or complete protobuf payloads.
- Use request id, source id, metric id, source sensor id, and error code for diagnostics.
- Validation warnings must be throttled per metric id or source sensor id.
- Dev pipe mode may log to console in addition to file and Event Log.

### C# Step 11: Service Acceptance Tests

Before considering the service implementation complete, verify:

```powershell
dotnet restore .\packages\source-windows\ShoMetrics.Source.Windows.slnx --locked-mode
dotnet build .\packages\source-windows\ShoMetrics.Source.Windows.slnx --no-restore
dotnet run --project .\packages\source-windows\ShoMetrics.Source.Windows.Service\ShoMetrics.Source.Windows.Service.csproj -- --help
dotnet run --project .\packages\source-windows\ShoMetrics.Source.Windows.Service\ShoMetrics.Source.Windows.Service.csproj -- --version
```

Manual elevated test:

```powershell
dotnet run --project .\packages\source-windows\ShoMetrics.Source.Windows.Service\ShoMetrics.Source.Windows.Service.csproj -- --dev-pipe
```

Node-side validation while dev pipe is running:

```powershell
cd .\packages\hub
npm.cmd run test:unit
```

Manual behavior acceptance:

- Non-admin Node can connect to the elevated dev pipe.
- Helper absent still falls back to `node-system`.
- Helper present returns at least one requested metric on a machine where LHM can see sensors.
- CPU/GPU temperature availability matches elevated LHM behavior.
- Killing the dev pipe while widgets are active causes fallback without action recreation.
- Restarting the dev pipe allows later helper reads without restarting the Stream Deck plugin process.

## Windows Installer

- Use WiX/MSI for the Windows helper installer from the first user-facing distribution.
- The installer owns service registration, service account, service SID configuration, start/stop during install and uninstall, upgrade, repair, rollback, installation directory, and `%ProgramData%` log directory permissions.
- The installer owns the future WinUI 3 ControlPanel installation, shortcuts, and runtime prerequisites when ControlPanel becomes part of user-facing distribution.
- The installer requires UAC. This does not change the non-admin requirement for the Stream Deck plugin process.
- Do not make a portable zip plus PowerShell service installer the product path. Dev scripts may exist only for local engineering convenience.

Installer usage rules:

- Local service development must use `--dev-pipe`; do not require MSI reinstall for every C# code edit.
- The MSI is required for user-facing distribution and installed-service upgrade testing.
- End users install the MSI once. Later helper updates are delivered as MSI upgrades or repairs, not by asking users to manually replace binaries.
- A developer does not reinstall the MSI for ordinary service/Core code edits. Reinstall or upgrade MSI only when validating installer behavior, service registration, service account/SID changes, install paths, log directory permissions, or the real installed-service upgrade path.
- When testing the installed Windows Service path, every service binary change requires stopping/upgrading the installed service through MSI or an explicit dev-only service replacement step.
- Do not let installer convenience change the runtime architecture. Node must work with either an installed service or an elevated `--dev-pipe` host exposing the same pipe protocol.

## Named Pipe Transport

Target pipe:

```txt
\\.\pipe\ShoMetrics.Source.Windows.v1
```

Security requirements:

- Allow `LocalSystem` and `BUILTIN\Administrators` full pipe access.
- Phase 1 allows `BUILTIN\Users` to connect/read/write to the read-only pipe API so a non-admin Stream Deck plugin can connect after helper installation.
- Reject remote pipe clients when the Windows API path supports it.
- Validate max frame size before allocating.
- Validate request type before executing work.
- Add per-request timeout and rate protection.
- Log unauthorized, malformed, oversized, and timed-out requests.
- Multi-user and Fast User Switching behavior must be reviewed before claiming multi-user support. A later version may replace `BUILTIN\Users` with installer-recorded per-user SIDs or a brokered per-session pipe.

Framing:

```txt
uint32 little-endian payload_length
protobuf SourceIpcRequest bytes

uint32 little-endian payload_length
protobuf SourceIpcResponse bytes
```

This is length-prefixed protobuf framing. It is not a different kind of protobuf.

Node transport adapter:

```txt
packages/hub/src/runtime/sources/windows-helper-source-client.ts
```

C# transport owner:

```txt
packages/source-windows/ShoMetrics.Source.Windows.Service/WindowsPipeSourceServer.cs
```

Only the transport adapters know about pipe handles and frame bytes. The source runner consumes `SourceClient`.

IPC behavior:

- Reuse a pipe connection when practical, but allow reconnect after any failed request.
- Phase 1 is strictly one in-flight request per connection. Do not implement request pipelining.
- The client must not send a second request on the same pipe until it has read the response for the previous request.
- The server may accept multiple pipe clients, but each client connection is processed as ordered request/response pairs.
- If a response `request_id` does not match the pending request, the Node client must close the pipe, mark the helper request failed, and fallback for that poll.
- The service must treat an empty `oneof payload` as `invalid_request`.

Frame limits:

- Maximum protobuf payload size is `1 MiB`.
- Reject frames with payload length `0`.
- Reject frames larger than `1 MiB` before allocating a payload buffer.
- Use unsigned 32-bit little-endian length prefixes only. Negative lengths are impossible at the byte level and must not be represented in code.

Timeout budgets:

| Operation | Node timeout | Service hard cap | Notes |
|---|---:|---:|---|
| Pipe connect | 750 ms | n/a | Absence of service should fallback quickly. |
| Health | 750 ms | 1 s | Used for availability and protocol checks. |
| Read snapshot | 2 s | 3 s | Runtime polling path. Do not retry within the same poll. |
| List descriptors | 5 s | 8 s | Discovery/manual path, not the 1Hz hot path. |

Rate protection:

- Limit each pipe connection to one active request by protocol.
- Apply a per-client soft limit of 10 requests/second.
- Apply a process-wide soft limit of 60 requests/second.
- When limits are exceeded, return a throttling error instead of blocking the pipe thread indefinitely.
- Do not rate-limit service shutdown, cancellation, or cleanup.

Source error mapping:

| Condition | Source error code | Node behavior |
|---|---|---|
| Unsupported `protocol_version` | `unsupported_protocol` | Disable helper client for the current process lifetime or until health is retried after a cooldown; fallback. |
| Empty payload / unknown command | `invalid_request` | Log at helper boundary; fallback. |
| Malformed protobuf | `malformed_request` | Close connection; fallback. |
| Oversized frame | `frame_too_large` | Close connection; fallback. |
| Request timeout | `timeout` | Close connection; fallback. |
| Rate limit exceeded | `rate_limited` | Fallback; retry on next scheduled poll. |
| Unauthorized pipe client | no protobuf response required | Log in service; reject connection. |
| LHM/PawnIO unavailable | `source_unavailable` | Fallback. |
| Requested metric unavailable | no value plus warning | Fill from fallback source if possible. |
| Unexpected service exception | `internal_error` | Log once with throttling; fallback. |

Protocol compatibility retry:

- If health returns `unsupported_protocol`, Node must not retry helper health on every poll.
- Minimum health retry cooldown after `unsupported_protocol` is 60 seconds.
- Logs for unsupported protocol must also be throttled so a 1Hz scheduler cannot emit one failure per second.
- During the cooldown, the helper client fails fast without pipe I/O and `SourceRunner` reads from fallback sources when the read plan allows fallback.

Helper availability retry:

- If the named pipe is missing (`ENOENT`), Node treats the helper as not installed or not started and uses a 5 minute retry cooldown.
- If helper I/O fails transiently, Node uses 5 s, then 15 s, then 60 s maximum retry cooldown.
- A successful health, descriptor, or snapshot request resets the transient helper backoff.
- The helper client must not start an interval timer. Retry is lazy and happens only when a source request reaches the client after the cooldown.

## Node Integration Files

Add:

```txt
packages/hub/src/runtime/sources/source-client.ts
packages/hub/src/runtime/sources/metric-read-plan-builder.ts
packages/hub/src/runtime/sources/source-runner.ts
packages/hub/src/runtime/sources/source-registry.ts
packages/hub/src/runtime/sources/windows-helper-source-client.ts
```

Update:

```txt
packages/hub/src/runtime/scheduler.ts
packages/hub/src/runtime/metric-store.ts
packages/hub/src/actions/metric-action.ts
packages/hub/src/actions/cpu.ts
packages/hub/src/actions/gpu.ts
packages/hub/src/actions/memory.ts
packages/hub/src/actions/network.ts
packages/hub/src/actions/disk.ts
```

Do not update Property Inspector or settings in the first local LHM landing step unless source scope cannot be represented without it.

## Node Runtime Refactor Implementation Steps

The Node refactor must land before the Windows helper client becomes the default source path. Do not make action classes branch on Windows helper availability.

### Step 1: Add Source-Scoped Runtime Types

Add the source runtime contract without changing behavior:

```txt
packages/hub/src/runtime/sources/metric-read-plan.ts
packages/hub/src/runtime/sources/source-client.ts
```

Required types:

```ts
export interface SourceCandidate {
    readonly sourceId: string;
}

export interface MetricReadPlan {
    readonly sourceScopeId: string;
    readonly metricKeys: readonly string[];
    readonly sourceCandidates: readonly SourceCandidate[];
    readonly failureMode: "fallback" | "empty";
}

export interface MetricStoreKey {
    readonly sourceScopeId: string;
    readonly metricKey: string;
}
```

Acceptance:

- Existing actions still render from `NodeSystemSource`.
- No generated proto imports in rendering, actions, or settings code.
- Unit tests cover read plan normalization and stable grouping keys.

### Step 2: Convert MetricStore to Source-Scoped Keys

Before:

```ts
metricStore.recordSnapshot(snapshot);
metricStore.getWidgetData(metricKey);
```

After:

```ts
metricStore.recordSnapshot(sourceScopeId, snapshot);
metricStore.getWidgetData({ sourceScopeId, metricKey });
```

Rules:

- Do not keep a parallel bare-key store.
- Do not persist `sourceScopeId` in Stream Deck settings.
- Rendering still receives plain `WidgetData`; source identity stops at the runtime data boundary.

Acceptance:

- Existing widgets still render the same values when all actions use the default local source scope.
- Tests prove two different source scopes do not share history for the same metric key.

### Step 3: Convert Actions from Bare Keys to Read Plans

Before:

```ts
protected getMetricSubscriptionKeys(event: WillAppearEvent): readonly string[] {
    return [CPU_USAGE_METRIC_KEY];
}
```

After:

```ts
protected getMetricKeys(event: WillAppearEvent): readonly string[] {
    return [CPU_USAGE_METRIC_KEY];
}
```

Rules:

- `MetricAction` owns the transition from action lifecycle events to scheduler subscriptions.
- `MetricAction` calls `buildMetricReadPlanFromSourcePolicy()` with the action metric keys, resolved widget source policy, and resolved global default source profile id.
- Concrete action classes may choose metric keys, but must not choose pipe, LHM, systeminformation, or remote transports.
- Remove the legacy `getMetricSubscriptionKeys()` path after all actions are converted.

Acceptance:

- CPU, GPU, RAM, network, and disk actions compile without `getMetricSubscriptionKeys()`.
- Action tests assert metric keys and read-plan behavior, not transport-specific behavior.

### Step 4: Add SourceRunner and SourceRegistry

Before:

```ts
const scheduler = new Scheduler(new NodeSystemSource());
```

After:

```ts
const sourceRegistry = createDefaultSourceRegistry();
const sourceRunner = new DefaultSourceRunner(sourceRegistry);
const scheduler = new Scheduler(sourceRunner, metricStore);
```

Rules:

- `SourceRegistry` owns source client lookup by `sourceId`.
- `SourceRunner` owns per-metric fallback across source candidates.
- `Scheduler` owns timing and subscription grouping only.
- `Scheduler` must pass coalesced metric keys to `SourceRunner`; `SourceRunner` must not receive one request per action when subscriptions can share a source poll.
- `NodeSystemSource` must be wrapped or adapted into a `SourceClient`; do not special-case it in `Scheduler`.

Acceptance:

- Unit tests cover primary success, primary partial result, primary failure, and all sources missing.
- Logs for fallback are throttled at the `SourceRunner` boundary.

### Step 5: Add Windows Helper Client Behind Registry

Add:

```txt
packages/hub/src/runtime/sources/windows-helper-source-client.ts
```

Rules:

- The pipe client owns frame encode/decode, request ids, timeouts, protocol version checks, and protobuf conversion.
- The pipe client returns ShoMetrics `MetricSnapshot` and source warnings. Generated protobuf types must not leak past the source adapter boundary.
- If the pipe is absent, slow, malformed, unauthorized, or incompatible, the client fails the request and `SourceRunner` falls back.
- The pipe client owns cached runtime status. `checkHealth()` performs I/O; `getCachedStatus()` does not.
- Do not spawn or elevate the Windows helper from Node.

Acceptance:

- Tests cover frame encode/decode, mismatched request id, oversized frame, malformed protobuf, timeout, and unsupported protocol.
- Tests cover pipe-missing cooldown, transient failure backoff, and backoff reset after successful reads.
- Manual test: helper absent still renders via `NodeSystemSource`.

### Step 6: Enable Local Candidate Order

Default Windows local candidate order:

```txt
windows-helper
node-system
```

Rules:

- Candidate order is runtime configuration owned by source read-plan/bootstrap code.
- `metric-read-plan-builder.ts` expands built-in local source profile ids into runtime source candidates.
- Actions and rendering code must not know this order.
- The Windows registry includes `windows-helper` plus `node-system`; non-Windows registries include only `node-system` until their helpers exist.
- When the Windows helper is absent, the helper client must fail quickly, apply a retry cooldown, and let `SourceRunner` fallback to `node-system`.

Acceptance:

- Adding `windows-helper` changes only registry/bootstrap and tests, not action classes.

## C# Metric Mapping

This is the cross-platform mapping invariant. The implementation-level Windows service rules live in [C# Step 8: Metric Mapping](#c-step-8-metric-mapping).

The C# side maps raw LHM readings into ShoMetrics output:

```txt
LHM raw sensor
  -> MetricDescriptor
  -> stable alias if known
  -> optional dynamic descriptor later
  -> MetricSnapshot value
```

Rules:

- Stable aliases must cover existing UI metrics first.
- The first Windows service MVP returns stable aliases as metric values. Dynamic LHM sensors may be listed later as descriptors, but must not be emitted as widget metric values until Node has a selector UI for them.
- Dynamic metrics must keep `source_sensor_id` opaque when they are introduced.
- Node must not parse `/intelcpu/0/temperature/26` or other LHM identifiers.
- New macOS/Linux helpers must emit the same stable aliases for the same UI metrics.
- Existing C# POC metric ids such as `cpu.load.percent` are diagnostic ids and are not the service contract.

Example mappings:

| LHM reading | ShoMetrics alias |
|---|---|
| CPU Total load | `cpu.usage_percent` |
| Memory Used | `ram.used` |
| Memory Used + Available | `ram.total` |
| GPU Core temperature | `gpu.temp` |
| GPU Power or GPU Package | `gpu.power` |
| GPU Memory Used | `gpu.vram_used` |
| GPU Memory Total | `gpu.vram_total` |
| Download Speed aggregate | `net.down` |
| Upload Speed aggregate | `net.up` |
| Read Rate aggregate | `disk.throughput.read` |
| Write Rate aggregate | `disk.throughput.write` |
| Read + write aggregate | `disk.throughput.total` |

## Development Flow

Before the Windows service exists:

- Use `ShoMetrics.Source.Windows.Helper snapshot` for one-shot validation.
- Use non-admin runs to validate ordinary sensors.
- Use elevated PowerShell manually for admin-only LHM/PawnIO validation.

After the service project exists:

- Elevated PowerShell runs the service host in dev mode.
- Normal non-admin Stream Deck Node plugin connects to the named pipe.
- Node must still fallback to `NodeSystemSource` when the pipe is absent.
- Installer work is not required for local dev validation. The MSI is required for user-facing distribution.
- The inner development loop is two processes: one elevated C# `--dev-pipe` process plus one normal Stream Deck plugin process.

Manual developer operations:

| Situation | Manual operation required | Notes |
|---|---|---|
| Validate admin-only LHM/PawnIO sensors before the service exists | Open an elevated PowerShell and run the one-shot Helper CLI. | Non-admin runs are still useful for sensors available without elevation. |
| Run the service during local development | Open an elevated PowerShell and run the service executable with `--dev-pipe`. | This is required because the Stream Deck Node process must remain non-admin and cannot spawn an elevated helper. |
| C# service/Core code changed while `--dev-pipe` is running | Stop the `--dev-pipe` process with `Ctrl+C`, rebuild if needed, then run it again. | Node should reconnect on a later poll; a Stream Deck restart and MSI reinstall should not be required for ordinary C# service edits. |
| Proto contract changed | Regenerate/build Node proto, rebuild C#, restart `--dev-pipe`, and restart the Stream Deck plugin process. | Both sides must load the same wire contract. |
| Node source client/runtime/rendering code changed | Run `npm.cmd run watch` from `packages/hub` for the normal Node loop, or run `npm.cmd run build` and restart the plugin manually. | The current watch script rebuilds and runs `streamdeck restart com.ez.sho-metrics` after each build. The C# `--dev-pipe` process can keep running if the pipe contract did not change. |
| First helper/MSI install on a user machine | Run the MSI with UAC approval. | A Stream Deck/plugin restart is acceptable after installation so Node gets a fresh helper client. System reboot is only required if the driver stack or installer explicitly requires it. |
| Test the real installed service path | Install or upgrade through MSI, then start the service from the installer or Service Control Manager. | This is slower than `--dev-pipe` and is not the inner dev loop. |

Hot reload policy:

- Do not design the service around in-process hot reload.
- The supported C# inner loop is elevated `dotnet watch` plus `--dev-pipe`. Treat this as automatic rebuild plus clean process restart, not true hot reload and not installer reinstall.
- Tests and product behavior must not depend on `dotnet watch`; they depend only on the service host being able to shut down and restart cleanly.
- The supported Node inner loop is `npm.cmd run watch` from `packages/hub`, which rebuilds and restarts the Stream Deck plugin process.
- The service host, named pipe server, LHM session, and PawnIO/native dependencies must be written so process restart is clean and cheap.

Example future commands:

```powershell
dotnet watch --project .\packages\source-windows\ShoMetrics.Source.Windows.Service\ShoMetrics.Source.Windows.Service.csproj run -- --dev-pipe
cd .\packages\hub
npm.cmd run watch
```

## Remote Source Phase

Remote source is not part of Phase 1.

Remote requirements already known:

- Authentication.
- Transport security.
- Same source API semantics as local helpers where practical.
- Source profiles in settings only when runtime source scoping is already complete.
- No remote samples may overwrite local samples with the same metric key.

Remote transport:

- Use gRPC over TLS.
- Reuse `source_api.proto` business request and response messages where practical.
- Do not reuse `source_ipc.proto` for remote RPC unless a future gRPC transport explicitly needs a local-style envelope.
- Do not implement a JSON-only remote source contract.

Do not implement remote source by exposing the local Windows helper named pipe over the network.

## Test Plan

Add unit tests for:

- `MetricReadPlan` normalization.
- scheduler grouping by source scope and metric keys.
- `MetricStore` source-scoped history.
- `SourceRunner` per-metric fallback.
- Windows helper pipe frame encode/decode.
- Oversized frame rejection.
- malformed protobuf rejection.
- LHM descriptor and alias mapping.

Add integration/manual tests for:

- helper absent -> `NodeSystemSource` fallback.
- helper present non-admin -> basic metrics work.
- helper present elevated/service -> CPU temp/power availability.
- helper timeout -> fallback and throttled warning.
- helper restart while widgets are active -> recovery without action recreation.

## Explicit Non-Goals

- Do not make Stream Deck or Node run as administrator.
- Do not spawn an elevated helper from Node.
- Do not use spawn-per-snapshot in production.
- Do not expose local privileged helper through localhost HTTP.
- Do not parse LHM-specific IDs in Node.
- Do not persist runtime helper availability into Stream Deck settings.
- Do not add remote source settings before source-scoped runtime storage exists.
