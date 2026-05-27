# Windows Helper gRPC IPC And Self-Contained Packaging Plan

This plan is written for a new coding session with no conversation context.

Status: implementation complete for the helper/plugin/control-panel IPC
migration. The production path is now gRPC over a Windows named pipe; the old
`source_ipc.proto` envelope, custom frame codec, custom pipe server, and custom
pipe clients have been removed. Remaining items in this document are release
validation gates and historical rationale, not instructions to keep both IPC
paths alive.

Read this after:

1. [Helper Source Reliability Implementation Plan](02-helper-source-reliability-implementation-plan.md)
2. [Windows Disk Throughput Implementation Plan](03-lhm-storage-reading-implementation-plan.md)
3. [Runtime Collection Demand-Driven Background Collection](../../runtime-collection/03-demand-driven-background-collection.md)

## Objective

Replace the current hand-rolled length-prefixed protobuf named-pipe IPC with a
real gRPC contract over a local Windows named-pipe transport, and package the
Windows helper so users do not need to install a separate .NET runtime.

This is a deliberate product decision:

```text
transport:
  use gRPC for helper <-> plugin/control-panel IPC

distribution:
  publish Windows helper as win-x64 self-contained
  do not require users to install .NET or ASP.NET Core runtimes

network exposure:
  preferred path does not open a localhost TCP port for the helper
  keep IPC local-machine/private through Windows named pipes if viable
```

## Product And Architecture Decisions

| Decision | Reason | Implementation meaning |
| --- | --- | --- |
| Use gRPC, not the current `SourceIpcRequest`/`SourceIpcResponse` envelope. | The helper API will grow. Continuing to add `oneof` cases and custom error semantics becomes a hand-made RPC framework. | Add a gRPC service for source health, descriptors, and snapshots. Remove the old envelope before finishing this plan. |
| Prefer Windows named pipes over localhost TCP / HTTP loopback. | The helper is local and privileged. Named pipes preserve a narrower OS-owned local IPC boundary. TCP/HTTP loopback adds firewall, port, browser-reachability, and token-lifecycle questions. | Use .NET gRPC over Kestrel named pipes as the preferred path. If this fails, stop and write a new loopback security design before choosing TCP/HTTP. |
| Package self-contained for `win-x64`. | Windows 10/11 do not ship the modern .NET runtime required by `net10.0-windows`. Users must not need to install .NET separately. | Installer/build scripts publish with `-r win-x64 --self-contained true`. |
| Accept the measured gRPC size increase. | The POC shows the cost is noticeable but acceptable for a helper installer. | Do not reject gRPC on size alone unless production publish grows far beyond the POC measurements. |
| Treat helper/plugin version skew as normal. | The plugin ships through Elgato Marketplace; the helper is self-managed. Users can update only one side. | Use additive protobuf changes, gRPC status codes, protocol version reporting, and conservative enum handling. Do not crash on unknown future data. |
| Do not preserve the old custom IPC as a production compatibility path. | The app is not in production yet, and dual transports create long-term confusion. | During implementation, temporary dual code is allowed only inside the migration branch. Final state has one production IPC path: gRPC. |

## POC Measurements

These measurements were taken on the local development machine during the gRPC
named-pipe POC. Treat them as sizing and latency guidance, not as final release
benchmarks.

### Latency

| Transport | Request | Session | p50 | p95 | Notes |
| --- | --- | --- | ---: | ---: | --- |
| Current custom pipe | `GetSourceHealth` | one request/connection | 0.141 ms | 0.310 ms | Length-prefixed protobuf. |
| Current custom pipe | `ReadMetricSnapshot` | one request/connection | 0.330 ms | 0.556 ms | Empty filter/all metrics, about 37 KB response. |
| gRPC named pipe POC | `GetSourceHealth` | persistent HTTP/2 session | 0.295 ms | 0.376 ms | Node core HTTP/2 POC client. |
| gRPC named pipe POC | `GetSourceHealth` | one-shot session | 0.412 ms | 0.716 ms | Includes connection setup. |
| gRPC named pipe POC | `ReadMetricSnapshot` | persistent HTTP/2 session | 0.803 ms | 1.363 ms | Static about 33 KB response. |
| gRPC named pipe POC | `ReadMetricSnapshot` | one-shot session | 0.920 ms | 1.337 ms | Includes connection setup. |

Observed conclusion: gRPC is slower than the custom frame protocol, but still
well below the 1 Hz polling budget. Transport latency is not a blocker.

One real Stream Deck plugin process health call was also measured at about
16-17 ms end-to-end. That sample was useful to prove instrumentation shape, but
it was not a steady-state GPU/snapshot benchmark and must not be used as a
transport benchmark by itself. The gap between sub-millisecond raw transport
numbers and this single plugin-process sample is expected to include Stream
Deck/plugin event loop scheduling, logging, request wiring, and process state.
Production work must keep both layers instrumented: raw RPC latency and
Stream Deck-to-helper end-to-end latency.

### Size

Self-contained `win-x64` publish is the relevant distribution model because
users should not install .NET separately.

| Artifact | Baseline | gRPC POC | Delta |
| --- | ---: | ---: | ---: |
| C# helper self-contained publish directory | 84.59 MiB | 111.22 MiB | +26.63 MiB |
| C# helper self-contained ZIP approximation | 37.12 MiB | 48.68 MiB | +11.57 MiB |
| Hub-side gRPC JS bundle, minified | n/a | n/a | about +0.42 MiB |
| Hub-side gRPC JS bundle, raw | n/a | n/a | about +1.15 MiB |

The framework-dependent publish directory can shrink after adding
`Microsoft.AspNetCore.App`, because DLLs move into the shared framework
dependency instead of the app folder. That is not a valid user-distribution
answer for this product.

### Node gRPC Named-Pipe Risk Signals

The transport decision is still gRPC over Windows named pipes, but the Node
client path must be proven before production work. The risk is not gRPC itself
and not .NET hosting; ASP.NET Core has named-pipe gRPC support. The risk is the
Node client library surface for Windows named pipes.

Relevant `grpc-node` signals:

| Signal | Meaning for this plan |
| --- | --- |
| [grpc/grpc-node#1244](https://github.com/grpc/grpc-node/pull/1244) attempted explicit UDS/named-pipe support but was closed. Maintainer discussion pointed toward using the `unix:` scheme for IPC paths rather than adding a separate Windows pipe URI. | Named pipes are not a clean first-class `npipe:` target in the public API. Expect path-format edge cases. |
| [grpc/grpc-node#1660](https://github.com/grpc/grpc-node/issues/1660) says Windows named-pipe client use worked for that reporter, but they could not access the underlying socket/file descriptor for ownership validation. | Basic calls may work, but low-level pipe identity/security checks may not be available from `@grpc/grpc-js`. Keep security at the server pipe ACL boundary. |
| [grpc/grpc-node#2099](https://github.com/grpc/grpc-node/issues/2099) reports a named-pipe client connecting and sending bytes, then stalling, plus Windows UDS server binding confusion. | A connect event is not enough. Batch 0 must verify actual unary request/response behavior. |
| [grpc/grpc-node#2649](https://github.com/grpc/grpc-node/issues/2649) reports name-resolution failure when trying to use a raw `\\.\pipe\...` target with `@grpc/grpc-js`. | The target string must be validated exactly. Do not assume raw Windows pipe paths work as gRPC targets. |
| [grpc/grpc-node#2642](https://github.com/grpc/grpc-node/issues/2642) and [grpc/grpc-node#2748](https://github.com/grpc/grpc-node/issues/2748) report idle-timeout/recovery problems over named pipes. | Batch 0 and Hub tests must include idle recovery and channel recreation, not just fast-loop latency. |
| [grpc/grpc-node#2857](https://github.com/grpc/grpc-node/issues/2857) reports Windows UDS connection failure from `grpc-js` to an ASP.NET Core UDS server. | Windows UDS and Windows named pipes are separate validation paths. Do not assume UDS success/failure answers named-pipe behavior. |

These issues do not veto gRPC. They change the order of work: prove the final
Node library and target string first, then implement the production migration.

### Batch 0 Short Result

A short Batch 0 spike was run with:

```text
server:
  ASP.NET Core Kestrel gRPC over ListenNamedPipe("ShoMetrics.GrpcBatch0")

client:
  Node v24.15.0
  @grpc/grpc-js 1.14.0
  @grpc/proto-loader 0.8.0
```

Observed target behavior:

| Target string | Result |
| --- | --- |
| `unix:\\.\pipe\ShoMetrics.GrpcBatch0` | Works. |
| `unix://\\.\pipe\ShoMetrics.GrpcBatch0` | Fails with `UNAVAILABLE` / `ENOENT`. |
| `unix:///\\.\pipe\ShoMetrics.GrpcBatch0` | Fails with `UNAVAILABLE` / `ENOENT`. |
| `\\.\pipe\ShoMetrics.GrpcBatch0` | Fails as `dns:\\.\pipe\...` name resolution. |

Short benchmark over the working target:

| Operation | Result |
| --- | ---: |
| First health call | about 75 ms in one run, about 60 ms in lifecycle run |
| Warm health p50/p95 | 0.397 ms / 0.721 ms |
| Warm snapshot p50/p95 | 1.085 ms / 1.959 ms |
| Missing pipe | gRPC code 14 `UNAVAILABLE`, `ENOENT` |
| 65-second idle then health | Success, about 2.7 ms |
| Stop helper then call | gRPC code 14 `UNAVAILABLE`, `ENOENT` |
| Restart helper, same client | Success, about 55 ms |
| Restart helper, new client | Success, about 1.6 ms |

These Batch 0 numbers include `@grpc/grpc-js` and `@grpc/proto-loader`
overhead. The earlier POC latency table used a hand-written Node core `http2`
client and should stay the lower-level transport baseline, not the production
Hub client baseline.

This is enough to proceed with gRPC-over-named-pipe implementation, with two
caveats:

1. The exact target string is load-bearing. Production code must use and test
   `unix:\\.\pipe\<pipe-name>`.
2. The 65-second idle test is not a substitute for the 35-minute idle/recovery
   gate listed below. Keep the longer test before release.

### Production Idle Soak Result

After the production gRPC path landed, a long idle soak was run against the
real helper pipe:

```text
script:
  packages/hub/scripts/diagnostics/windows-helper-grpc-idle-soak.mjs

helper:
  ShoMetrics.Source.Windows.Service --dev-pipe

client:
  Node v24.15.0
  @grpc/grpc-js 1.14.0

target:
  unix:\\.\pipe\ShoMetrics.Source.Windows.Grpc.v1

checkpoints:
  1m, 2m, 5m, 35m, 60m
```

Observed result:

| Checkpoint | Result |
| --- | --- |
| Warmup | Success, about 9 ms. |
| 1 minute idle | Success, about 2 ms. |
| 2 minute idle | First call hit `DEADLINE_EXCEEDED` at the 750 ms client deadline; channel reset and retry succeeded in about 127 ms. Helper/Kestrel logs showed a long server-side send/heartbeat delay around the same time, so this looked like transient helper/server stall rather than an unrecoverable `grpc-js` idle bug. |
| 5 minute idle | Success, about 320 ms. |
| 35 minute idle | Success, about 3 ms after the channel had entered `IDLE`. |
| 60 minute idle | Success, about 2 ms after the channel had entered `IDLE`. |

Conclusion: the production `@grpc/grpc-js` named-pipe target survived the known
35+ minute idle/recovery risk. The single 2-minute deadline miss confirms that
Hub must continue treating request deadlines as normal transient failures and
must be able to recover by resetting/recreating the channel.

### Security Model

The helper is a local privileged data source. The security goal is to keep the
API local, narrow, read-only, and auditable. The goal is not to prove that the
client process is literally the ShoMetrics Node process.

Required model:

```text
transport:
  Windows named pipe only
  no localhost TCP listener
  no browser-callable HTTP API

server-side access:
  pipe ACL allows only local allowed Windows identities
  preserve or improve the current custom-pipe access intent
  configure Kestrel named-pipe security explicitly; do not rely on defaults

client identity:
  do not rely on process name, process path, or "this is Node" checks
  @grpc/grpc-js may not expose the underlying pipe handle for server-owner checks
  treat client-side pipe-owner verification as unavailable unless Batch 0 proves
  a reliable API

application protocol:
  validate protocol version and message shape
  log malformed calls at a low frequency
  keep source warnings and metric unavailable reports data-plane only

API surface:
  read-only health, descriptors, and snapshots
  no arbitrary command execution
  no file read/write RPC
  no driver install/control RPC
  no settings mutation RPC
```

The helper can be secure enough with named-pipe ACLs plus a narrow read-only
gRPC API, even though it cannot perfectly authenticate "only the ShoMetrics
Node process." Windows ACLs identify users, groups, services, and SIDs; they do
not provide a simple trustworthy "only this JavaScript process" boundary.

#### Why HTTP Loopback Is Not The Preferred Transport

HTTP on `localhost` is not the preferred production helper transport. It is
simpler to prototype, but it moves a privileged local helper from an
OS-owned IPC boundary to a browser-callable local network service.

Non-preferred shape:

```text
helper listens on 127.0.0.1 or ::1
Hub calls http://localhost:<port>/...
auth token or random port protects the endpoint
```

Reasons:

- Any local process can attempt to connect. A named pipe can use Windows ACLs
  to narrow access by local identity; loopback HTTP starts from a wider local
  network surface.
- Browsers, webviews, extensions, local apps, malware, and scripts can all
  originate HTTP requests to loopback. Even if CORS blocks reading responses,
  request side effects still matter if the API ever grows beyond read-only
  metrics.
- A token-based loopback API adds new secret lifecycle problems: generation,
  storage, rotation, logging redaction, and recovery when the plugin/helper
  versions are out of sync.
- Port selection adds operational failure modes: conflicts, firewall prompts,
  stale listeners, and endpoint discovery.
- The helper is privileged and sensor/driver-adjacent. Its transport should
  stay as narrow as the product allows.

Loopback HTTP remains a fallback candidate if the final Node gRPC client cannot
reliably use Windows named pipes. Choosing it requires a new security design,
not a silent transport swap.

If a future RPC performs writes, driver control, install/uninstall, privileged
actions, or anything beyond local metric reading, stop and design a separate
authentication/authorization model. Do not add privileged write RPCs to this
pipe by analogy with read-only telemetry.

Production validation must include:

```text
Stream Deck plugin running as normal user -> helper service running elevated or
as LocalSystem:
  can call GetSourceHealth
  can call ReadMetricSnapshot
  does not require running Stream Deck as administrator

unauthorized local client shape:
  malformed calls are rejected/logged
  unknown services/methods do not expose sensitive behavior

transport exposure:
  no TCP listener appears
  no unauthenticated HTTP endpoint appears
```

## Non-Goals

- Do not add a remote monitoring API in this plan.
- Do not silently switch helper gRPC to TCP/HTTP loopback.
- Do not keep both old custom IPC and gRPC in the final production path.
- Do not use gRPC to move raw LHM parsing into Hub or PI.
- Do not require users to install .NET, ASP.NET Core, Visual C++ redistributables,
  or developer SDKs manually.

## Implementation Batches

Each batch should compile and test on its own. Temporary compatibility code is
allowed only when it is removed by the end of the same batch or the immediately
following batch. Do not leave a hidden second transport path.

### Batch 0: Prove Final Node gRPC Named-Pipe Client (completed short spike)

**Goal:** remove the largest transport unknown before changing the production
contract or deleting the old IPC path.

The earlier POC proved that Kestrel gRPC over a Windows named pipe can speak
HTTP/2 to a Node core `http2` client with a custom `net.connect("\\\\.\\pipe\\...")`
transport. It did not prove that the final Node gRPC client library works over
Windows named pipes.

The short spike recorded in [Batch 0 Short Result](#batch-0-short-result)
proved the intended library and target shape:

```text
@grpc/grpc-js 1.14.0
@grpc/proto-loader 0.8.0
target string: unix:\\.\pipe\<pipe-name>
Kestrel ListenNamedPipe(...)
```

Completed proof:

```text
GetSourceHealth-style unary call succeeds
ReadMetricSnapshot-style unary call succeeds
missing pipe maps to gRPC UNAVAILABLE / ENOENT
65-second idle then follow-up call succeeds
helper stop maps to gRPC UNAVAILABLE / ENOENT
helper restart recovers with the same client
no TCP port is required for the short spike
```

Still pending production gates:

```text
deadline/cancellation failure maps to a gRPC error
channel can go idle for at least 35 minutes, then recover or be recreated
normal-user plugin can call elevated/LocalSystem helper without admin rights
production payload shape and 30-40 KB unary response still pass
production security/ACL behavior matches the Security Model section
```

These pending gates belong to Batch 2/3 production tests, not another
throwaway transport spike.

If the production integration contradicts the short spike, stop and choose one
of these explicitly:

```text
A. use a small project-owned Node gRPC transport wrapper over node:http2
   and net.connect("\\\\.\\pipe\\...")

B. use a different maintained Node gRPC-compatible client that supports the
   required transport

C. revisit the transport decision and write a loopback security design if
   named pipes are not viable
```

Do not silently fall back to localhost TCP/HTTP loopback.

**Estimated code LOC:** throwaway only. No production code should survive this
batch unless it is the chosen client adapter skeleton.

### Batch 1: Define The gRPC Service Contract

**Goal:** make `source_api.proto` the source API contract and retire
`source_ipc.proto` as an envelope contract.

1. Add a service to `contracts/proto/shometrics/v1/source_api.proto`:

   ```proto
   service MetricSourceService {
     rpc GetSourceHealth(GetSourceHealthRequest) returns (GetSourceHealthResponse);
     rpc ListMetricDescriptors(ListMetricDescriptorsRequest) returns (ListMetricDescriptorsResponse);
     rpc ReadMetricSnapshot(ReadMetricSnapshotRequest) returns (ReadMetricSnapshotResponse);
   }
   ```

   Keep the request/response messages already in `source_api.proto`. Do not add
   a new `Any`, generic operation name, or bytes extension lane.

2. Do not add `capability_ids` in this migration.

   The three RPCs above are required for a usable helper. For this contract,
   gRPC already gives a clear version-skew signal: an older helper returns
   `UNIMPLEMENTED` for a method it does not know. Add explicit capability ids
   only when a future optional behavior cannot be represented by additive proto
   fields or gRPC status handling.

3. Keep enum compatibility rules:

   ```text
   unknown value freshness:
     treat as retained / do not append to history

   unknown unavailable reason:
     map to "unknown" for DEBUG

   unknown value kind or descriptor kind:
     drop that descriptor/attribution, log a throttled warning
   ```

   Every dropped wire item must have a low-frequency warn log. No silent drops.

4. Update proto generation:

   - C# `ShoMetrics.Source.Windows.Contracts.csproj` should generate
     server/client gRPC code for `source_api.proto`.
   - Hub TypeScript should keep using generated message types at the source
     adapter boundary only. Do not let generated gRPC/proto types leak into PI,
     actions, rendering, or settings.

5. Run:

   ```powershell
   npm.cmd run proto:format
   npm.cmd run proto:lint
   npm.cmd run proto:build
   npm.cmd run test:unit
   dotnet build .\packages\source-windows\ShoMetrics.Source.Windows.slnx --no-restore
   ```

**Estimated code/docs LOC:** 60-140 proto/project/generated-adapter changes, plus
generated output.

### Batch 2: Replace The C# Custom Pipe Server With gRPC Named Pipes

**Goal:** host the helper source API through ASP.NET Core gRPC on a Windows
named pipe without changing source/Core ownership.

1. Add the required C# dependencies:

   - `Grpc.AspNetCore.Server` to `ShoMetrics.Source.Windows.Service`
   - `Grpc.Core.Api` only where generated gRPC base types require it
   - `Microsoft.AspNetCore.App` framework reference if required by the selected
     gRPC hosting path

   Keep package versions pinned and lock-file checked in.

   Kestrel named-pipe hosting uses ASP.NET Core named-pipe transport APIs
   available in modern .NET/ASP.NET Core. The current helper target is
   `net10.0-windows`; do not downgrade the service target below a version that
   supports `ListenNamedPipe(...)`.

2. Add a gRPC service implementation in `ShoMetrics.Source.Windows.Service`.
   It should adapt existing owners:

   ```text
   gRPC service method
     -> existing SourceRequestHandler or equivalent operation-specific handler
     -> SourceProtocolMapper
     -> existing Core session/snapshot/descriptor code
   ```

   Do not move hardware traversal, metric ranking, or LHM parsing into the gRPC
   service class.

3. Replace `WindowsPipeSourceServer` with a Kestrel named-pipe gRPC host.

   Required behavior:

   ```text
   transport:
     Windows named pipe
     HTTP/2
     no TCP listener

   security:
     local-machine only
     preserve the current pipe access intent
     reject remote clients if the transport exposes any remote-client concept
   ```

   Stop and ask before switching to localhost TCP/HTTP loopback or weakening
   pipe security. That would be a product/security decision, not an
   implementation detail.

4. Map helper failures to gRPC status codes:

   | Condition | gRPC result |
   | --- | --- |
   | Healthy response | normal response |
   | Source temporarily unavailable | `UNAVAILABLE` |
   | Operation timeout | `DEADLINE_EXCEEDED` |
   | Invalid request shape | `INVALID_ARGUMENT` |
   | Required precondition absent / incompatible version | `FAILED_PRECONDITION` |
   | Future RPC not implemented by old helper | `UNIMPLEMENTED` |
   | Unexpected helper exception | `INTERNAL` |

   Keep metric-level no-data in `ReadMetricSnapshotResponse.unavailable_metrics`;
   do not turn no sensor data into a transport error.

5. Do not delete the old custom pipe server until Hub has a working gRPC
   client. During this migration, the code can be temporarily broken inside the
   branch, but the deletion order must remain clear:

   ```text
   first:
     add gRPC server
     keep old pipe server if Hub/ControlPanel still use it

   then:
     migrate Hub to gRPC

   then:
     migrate ControlPanel to gRPC

   last:
     delete old pipe server, old C# client, envelope proto, and frame codec
   ```

   This project is not in production, so there is no requirement to ship a dual
   transport compatibility period. The rule is only to avoid accidentally
   deleting the server side while the current working tree still has clients
   that can only speak the old protocol.

6. Remove these old production pieces after Hub and ControlPanel have both
   migrated:

   - `SourceIpcFrameCodec`
   - `SourceIpcFrameException`
   - `SourceIpcRequest` / `SourceIpcResponse` usage
   - `SourceRequestHandler.HandleAsync` and `DispatchAsync` old envelope dispatch
   - `SourceProtocolMapper` request-id overloads and old envelope response builders
   - `WindowsPipeSourceServer`
   - frame accumulator and length-prefix handling tests

   Keep or rename constants such as service name and pipe name only if they
   still describe the gRPC named-pipe transport.

7. C# tests:

   - Unit test service methods with fake Core/session dependencies.
   - Integration test the named-pipe gRPC host locally.
   - Verify `GetSourceHealth`, `ListMetricDescriptors`, and
     `ReadMetricSnapshot` return the same semantic payload as the old IPC path.
   - Verify gRPC deadlines/cancellation stop work and do not leave active
     request tasks.

**Estimated code LOC:** 350-700 C# production, 200-500 C# tests. Deleting the old
IPC server should remove a meaningful amount of custom framing code.

### Batch 3: Replace Hub Windows Helper Client With gRPC

**Goal:** make `windows-helper-source-client.ts` call the gRPC helper while
preserving the current runtime source contract.

1. Use the client path proven in Batch 0. Do not re-litigate transport in this
   batch unless the production integration contradicts the spike.

   Add one owner for the gRPC target string, for example:

   ```text
   buildWindowsNamedPipeGrpcTarget(pipeName) -> unix:\\.\pipe\<pipe-name>
   ```

   The string is load-bearing for `@grpc/grpc-js`. Do not URL-encode it, do not
   change it to `unix://...`, and do not pass a raw `\\.\pipe\...` DNS-looking
   target. Add a unit test for this helper with the Batch 0 known-good target
   and comments listing the known-bad forms from the spike.

2. Keep `WindowsHelperSourceClient` as the adapter boundary.

   It still exposes the current runtime source contract:

   ```typescript
   readSnapshot(...)
   readMetricDescriptors(...)
   getCachedStatus(...)
   ```

   Generated gRPC/proto types stay inside the source client adapter. Do not
   pass them into `MetricStore`, actions, PI, rendering, or settings.

3. Preserve current runtime behavior:

   - source status cache
   - helper install/service probe behavior
   - 60-second active-demand retry window
   - descriptor cache and fingerprint invalidation
   - fallback composer behavior
   - retained value handling: retained updates current display, not history
   - all existing wire sanity checks and warn logs

4. Replace custom request framing:

   Remove or rewrite these old client concerns:

   ```text
   encodeSourceIpcFrame
   decodeSourceIpcFrame
   SourceIpcFrameAccumulator
   request id envelope handling
   payload oneof switch
   manual frame length validation
   ```

   gRPC message-size limits should replace `MaximumFrameBytes`. Configure both
   client and server limits explicitly. Document the value near the source API
   service contract and in the Hub source client constant so both sides stay in
   sync.

5. Error mapping in Hub:

   | gRPC status | Hub source status |
   | --- | --- |
   | connection refused / pipe missing | `unavailable` with `pipeMissing` or install/service-derived reason |
   | `UNAVAILABLE` | `unavailable` |
   | `DEADLINE_EXCEEDED` | timeout |
   | `UNIMPLEMENTED` for future RPC | version skew / unsupported method |
   | `UNIMPLEMENTED` for core RPC | helper error / incompatible helper |
   | `FAILED_PRECONDITION` | protocol/precondition mismatch |
   | `INVALID_ARGUMENT` from our own request | log error; treat as helper/client bug |
   | `INTERNAL` / unknown | helper error |

   Do not throw in hot polling code for ordinary helper/plugin version skew.
   Log a throttled warning and degrade that source or metric.

6. Hub tests:

   - fake gRPC server success responses
   - pipe missing / helper unavailable
   - deadline exceeded
   - `UNIMPLEMENTED` future-method vs core-method behavior
   - unknown enum values normalize conservatively
   - malformed descriptors/attributions are dropped with warn logs
   - retained values do not append history
   - descriptor cache invalidates on fingerprint changes
   - a 35+ minute idle channel either recovers on the next call or is lazily
     recreated without user-visible failure

7. Performance instrumentation:

   Add low-frequency debug timing around:

   ```text
   gRPC connect/channel creation
   first RPC after channel reset
   each RPC duration
   response decode/mapping duration
   snapshot ingest duration
   ```

   Keep logs throttled. Do not log per-key or per-sample payloads. Keep
   first-call latency separate from steady-state RPC latency; the short spike
   measured about 60-75 ms for the first health call.

8. Channel lifecycle:

   The current custom client opens a pipe connection per request. gRPC normally
   wants a longer-lived channel. Implement an explicit channel owner inside
   `WindowsHelperSourceClient`:

   ```text
   create channel lazily when helper-backed demand appears
   reuse channel while healthy
   close/recreate channel after pipe missing, UNAVAILABLE, protocol/version
   failure, service status transition, or helper restart evidence
   dispose channel when the source client is disposed
   ```

   Do not put channel state into `MetricStore`, fallback composer, actions, or
   PI. The source client owns transport lifecycle.

**Estimated code LOC:** 400-900 TS production, 250-600 TS tests, depending on
the selected Node gRPC client library.

### Batch 4: Migrate Control Panel To gRPC

**Goal:** remove the C# control panel's dependency on the old custom IPC client.

1. Replace `WindowsSourceIpcClient` usage in ControlPanel with the generated
   gRPC client.

2. Keep ControlPanel behavior equivalent:

   - read Windows service status through SCM as it does today;
   - read helper health through gRPC;
   - read a small snapshot/descriptor set for display;
   - report helper stopped, starting, incompatible, and error states without
     requiring Stream Deck to be running.

3. Test:

   - unit test status mapping from gRPC success/errors;
   - integration smoke test against the local named-pipe gRPC helper when
     practical.

**Estimated code LOC:** 150-350 C# production, 100-250 tests.

### Batch 5: Self-Contained Windows Helper Packaging

**Goal:** ship helper bits that run on Windows 10 22H2 and Windows 11 without
requiring users to install .NET or ASP.NET Core.

Installer framework choice is out of scope for this IPC migration. MSI/WiX,
NSIS, PowerShell bootstrapper, or another installer path must be defined in a
separate installer plan before release. This batch only defines the publish and
validation requirements the eventual installer must satisfy.

1. Add an explicit publish profile or packaging script for the service:

   ```powershell
   dotnet publish `
     packages/source-windows/ShoMetrics.Source.Windows.Service/ShoMetrics.Source.Windows.Service.csproj `
     -c Release `
     -r win-x64 `
     --self-contained true
   ```

   Do not rely on framework-dependent output for installer inputs.

2. Keep Debug/dev builds convenient. Do not force every local `dotnet build` to
   publish self-contained. Put self-contained behavior in release packaging or a
   publish profile.

3. Installer/package validation:

   - clean Windows 10 22H2 VM with no installed .NET runtime;
   - clean Windows 11 VM with no installed .NET runtime;
   - install helper;
   - service starts;
   - ControlPanel can read health;
   - Stream Deck plugin can read `GetSourceHealth`;
   - helper logs include version and transport startup;
   - uninstall removes service and installed files.

4. Size validation:

   Compare production self-contained output against the POC baseline:

   ```text
   expected order of magnitude:
     baseline helper self-contained directory: about 85 MiB
     gRPC helper self-contained directory: about 111 MiB
     compressed delta: about +12 MiB
   ```

   If production gRPC self-contained output exceeds the POC by more than about
   20% without a known reason, stop and inspect dependencies before shipping.

   Known size drivers:

   ```text
   Microsoft.AspNetCore.App:
     Kestrel, hosting, HTTP/2, and named-pipe transport. This is expected to be
     the main self-contained size increase.

   Grpc.AspNetCore.Server / Grpc.Core.Api / protobuf runtime:
     smaller but still measurable additions.
   ```

   Also measure the Stream Deck plugin bundle after Hub gRPC integration:

   ```text
   plugin .sdPlugin bundle delta:
     measure before/after gRPC integration
     flag if minified growth exceeds about +1 MiB
   ```

5. Trimming and installer size:

   The current accepted baseline is the POC result: about 49 MiB compressed for
   a self-contained gRPC helper. That is materially larger than a tiny Stream
   Deck plugin, but acceptable for this Windows helper because the product
   requirement is no user-installed .NET runtime.

   This plan does not claim the size is ideal. It only says the measured cost is
   acceptable enough to proceed. Before release, run one publish-size pass with
   production dependencies and record:

   ```text
   self-contained directory size
   compressed installer or zip size
   largest added assemblies
   ```

   Consider `PublishTrimmed` only as a separate measured pass. Do not enable it
   blindly: LHM, protobuf/gRPC, hosting, and driver-related libraries may use
   reflection or dynamic access patterns that need explicit trim annotations and
   tests.

6. Do not enable NativeAOT in this plan.

   NativeAOT may be useful later, but LHM, protobuf/gRPC, hosting, reflection,
   and driver interactions need a separate compatibility pass. Do not use
   NativeAOT to offset the gRPC size cost in this migration.

**Estimated code LOC:** 80-220 build/packaging/script LOC plus installer changes.

### Batch 6: Remove Old IPC Contract And Update Docs

**Goal:** leave one supported helper IPC path.

1. Delete old contract and tests when no production code imports them:

   - `contracts/proto/shometrics/v1/source_ipc.proto`
   - generated `source_ipc_pb.*`
   - C# generated `SourceIpc*`
   - frame codec and frame codec tests
   - Node frame encoder/decoder tests

2. Update references:

   - architecture docs that mention length-prefixed helper IPC;
   - helper install FAQ if it mentions pipe/protocol behavior;
   - runtime source docs;
   - support/debug docs for helper logs and gRPC status interpretation.

3. Add a short support note:

   ```text
   The helper and plugin may be different versions. DEBUG/support logs should
   report helper version, plugin version, source protocol version, and gRPC
   status when a call fails.
   ```

4. Add a dependency-upgrade note:

   ```text
   Bumping @grpc/grpc-js or @grpc/proto-loader requires re-running the named-pipe
   gates: target string, idle recovery, helper restart recovery, and normal-user
   plugin -> elevated helper access. Do not auto-merge these bumps.
   ```

**Estimated docs/code cleanup LOC:** 100-300.

## Final Acceptance Checklist

Implementation checklist status: the migration code is landed. Before release,
rerun the command/test gates below against the current build and installer
candidate.

- `npm.cmd run proto:lint`
- `npm.cmd run proto:build`
- `npm.cmd run test:unit`
- `dotnet build .\packages\source-windows\ShoMetrics.Source.Windows.slnx --no-restore`
- C# gRPC service tests pass.
- Hub Windows helper gRPC client tests pass.
- ControlPanel gRPC status tests pass.
- No imports or generated references to `source_ipc.proto` remain.
- No production `SourceIpcFrame*` types remain.
- Preferred named-pipe build opens no localhost TCP listener.
- Named-pipe transport security is at least as strict as the old custom pipe.
- Batch 0 proves the final Node client library can call Kestrel gRPC over a
  Windows named pipe.
- Hub has a unit-tested named-pipe gRPC target-string helper using the
  `unix:\\.\pipe\<pipe-name>` form proven by Batch 0.
- Hub gRPC client survives 35+ minutes of idle plus a follow-up call, either by
  recovery or by lazy channel recreation. Verified locally with the production
  gRPC path at 35 minutes and 60 minutes; rerun when bumping `@grpc/grpc-js`,
  `@grpc/proto-loader`, .NET, or Kestrel hosting dependencies.
- Stream Deck plugin running as a normal user can call the elevated/LocalSystem
  helper without launching Stream Deck as administrator.
- Self-contained `win-x64` publish succeeds.
- Clean Windows 10 22H2 and Windows 11 smoke tests run without installing .NET.
- Production package validation records helper self-contained size, compressed
  installer/zip size, and plugin bundle delta; plugin minified growth over about
  +1 MiB requires review.
- Runtime logs include low-frequency gRPC timing/status diagnostics.
- Unknown future enum values and unsupported future methods degrade without
  crashing the plugin.

## Stop Conditions

Stop and ask before proceeding if any of these happen:

- The selected Node gRPC library cannot connect over Windows named pipes.
- The only working gRPC option opens localhost TCP/HTTP loopback and therefore
  needs a separate security design.
- Kestrel named-pipe gRPC cannot preserve the old local/private security model.
- Self-contained publish grows far beyond the POC size without a clear
  dependency reason.
- Implementation requires passing generated gRPC/proto types into PI, actions,
  rendering, or settings.
- A compatibility workaround would leave both custom IPC and gRPC as long-term
  production paths.
