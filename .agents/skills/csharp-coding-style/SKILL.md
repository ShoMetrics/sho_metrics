---
name: csharp-coding-style
description: Use when writing, reviewing, or changing C#/.NET code in this repo, especially packages/source-windows Core, Helper, ControlPanel, .csproj, .editorconfig, NativeAOT, nullable, async/threading, and modern C# feature decisions. Pair with coding-style for language-neutral naming, comments, tests, and ownership rules.
---

# C# Coding Style

Use this skill for C#/.NET-specific decisions. Use `coding-style` for language-neutral naming, comments, tests, and ownership rules.

Baseline: follow dotnet/runtime C# style unless this repo overrides it. Use Microsoft Learn C# conventions where runtime style is silent. Prefer `.editorconfig` and built-in analyzers over prose-only rules.

Rules here are defaults, not blind transformations. If generated code, WinUI/XAML requirements, dependency APIs, NativeAOT limitations, or a file's clear local style conflicts with a rule, preserve correctness and state the reason. Where examples use `Too rigid`, that means mechanically following the rule would make the code worse.

## 1. Project Defaults

* **PREFER: Target .NET 10 and C# 14 for new Windows source projects** unless a dependency, packaging, or Windows SDK constraint requires otherwise.
  - Good: `<TargetFramework>net10.0-windows</TargetFramework>`
  - Bad: `<TargetFramework>netstandard2.0</TargetFramework>` for the Windows hardware source.
  - Too rigid: using `net10.0-windows10.0.19041.0` in `Helper` just because `ControlPanel` needs WinUI/Windows SDK APIs.

* **DO: Enable nullable reference types**. Treat non-nullable references as the default. Use `?` only when null is a real domain state or boundary result.
  - Good: `public string? ParentSensorId { get; init; }`
  - Bad: `public string SensorId { get; init; } = null!;`
  - Too rigid: `public string ParentSensorId { get; init; } = "";` when "no parent sensor" is a real state.

* **PREFER: Keep `Core` free of UI, CLI, and Node IPC concerns**. LHM/PawnIO access, sensor cataloging, and metric mapping belong in `Core`; `Helper` and `ControlPanel` consume `Core`.
  - Good: `Core` returns `IReadOnlyList<SensorSnapshot>`.
  - Bad: `Core` references `Microsoft.UI.Xaml` or writes to `Console.Out`.
  - Too rigid: moving `SensorSnapshot` out of `Core` only because `Helper` later serializes it.

## 2. Types And Construction

* **PREFER: Make internal and private classes `sealed` by default**. Leave a type unsealed for a real inheritance, framework, proxy, or test-substitution need.
  - Good: `internal sealed class LibreHardwareReader`
  - Bad: `internal class SensorMapper` with no subclassing requirement.
  - Too rigid: `public sealed class HardwareSource` when `LibreHardwareSource : HardwareSource` is the intended extension point.

* **PREFER: Use `required` plus `init` for object-initialized DTOs and options**. Use constructors or factories when invariants span multiple values or construction has behavior.
  - Good: `public required string Identifier { get; init; }`
  - Bad: `public string Identifier { get; set; } = "";` on an immutable snapshot DTO.
  - Too rigid: `public required double Minimum { get; init; } public required double Maximum { get; init; }` when a constructor must validate `minimum <= maximum`.

* **PREFER: Use records only for immutable values and results**. Avoid records for hardware owners, long-lived runtime state, mutable caches, and types where `with` copying hides cost or ownership.
  - Good: `public readonly record struct SensorKey(string HardwareId, string SensorId);`
  - Bad: `public record HardwareMonitorSession(Computer Computer);`
  - Too rigid: replacing every immutable result with `record` when it owns large mutable arrays or disposable handles.

* **PREFER: Use primary constructors for small sealed types or records when parameters only initialize fields/properties or pass to `base`**. In larger types, assign constructor parameters to explicitly named `_camelCase` fields so ownership stays visible.
  - Good: `public readonly record struct SensorReading(string SensorId, double Value);`
  - Bad: `public readonly record struct SensorReading { public SensorReading(string sensorId, double value) { SensorId = sensorId; Value = value; } public string SensorId { get; } public double Value { get; } }`
  - Too rigid: `internal sealed class ControlPanelViewModel(IHardwareReader reader, ISettingsStore settingsStore, ILogger logger, IDispatcher dispatcher, IFilePicker filePicker) { }`

* **CONSIDER: Use the C# 14 `field` keyword only for local property validation**. Use an explicit backing field when the state needs a domain name, debugging clarity, or multi-accessor behavior.
  - Good: `public int PollingIntervalSeconds { get; set => field = value > 0 ? value : throw new ArgumentOutOfRangeException(nameof(value)); }`
  - Bad: `private int _pollingIntervalSeconds; public int PollingIntervalSeconds { get => _pollingIntervalSeconds; set => _pollingIntervalSeconds = value > 0 ? value : throw new ArgumentOutOfRangeException(nameof(value)); }`
  - Too rigid: `set => field = NormalizePollingInterval(value);` when several other members also need the normalized value.

## 3. NativeAOT And Trimming

* **DO: Treat NativeAOT and trimming warnings as design-affecting**. Fix them at the boundary, or annotate the narrow incompatible member with `RequiresDynamicCode`, `RequiresUnreferencedCode`, or `DynamicDependency` and explain why it remains.
  - Good: `[JsonSerializable(typeof(SensorSnapshot))] internal partial class SourceJsonContext : JsonSerializerContext`
  - Bad: `<NoWarn>IL2026;IL3050</NoWarn>` to silence the whole project.
  - Too rigid: rejecting LHM integration because one adapter method needs `[RequiresUnreferencedCode("LibreHardwareMonitor reflection usage is isolated here.")]`.

* **AVOID: Runtime type construction or reflection dispatch in production paths**. Use it only when isolated, annotated, and tested under NativeAOT publish.
  - Good: `private static readonly Dictionary<string, Func<IMetricReader>> ReaderFactories = ...;`
  - Bad: `Activator.CreateInstance(typeNameFromSettings)`
  - Too rigid: replacing `typeof(SensorSnapshot).Name` because all `typeof(...)` usage was mistaken for reflection dispatch.

* **PREFER: Use explicit factories, interface dispatch, source generators, and `System.Text.Json` source generation** instead of reflection-heavy discovery.
  - Good: `JsonSerializer.Serialize(snapshot, SourceJsonContext.Default.SensorSnapshot)`
  - Bad: `JsonSerializer.Serialize(snapshot)` in a NativeAOT-published helper.
  - Too rigid: adding a source generator for test-only JSON fixtures that are not published with NativeAOT.

* **AVOID: `TypeDescriptor`, `DataContractSerializer`, `BinaryFormatter`, `Reflection.Emit`, and dynamic assembly loading** in Windows source projects.
  - Good: `JsonSerializer.Deserialize(json, SourceJsonContext.Default.SensorSnapshot)`
  - Bad: `new DataContractSerializer(typeof(SensorSnapshot))`
  - Too rigid: deleting `LibreHardwareMonitor.Hardware.Computer` usage solely because the package may use reflection internally; isolate the adapter instead.

* **PREFER: Use source-generated interop for NativeAOT boundaries**. Use `LibraryImport` for new P/Invoke and CsWinRT or source-generated `ComWrappers` for COM/WinRT instead of built-in COM interop.
  - Good: `[LibraryImport("kernel32", SetLastError = true)] private static partial nint GetCurrentProcess();`
  - Bad: `[ComImport] interface IWmiLocator { ... }` in a NativeAOT-published helper.
  - Too rigid: rewriting a dependency-owned interop layer that is already isolated and tested under NativeAOT.

* **CONSIDER: Use `UnsafeAccessor` only at a narrow interop or test boundary** when an explicit API, factory, or source generator cannot express the required access.
  - Good: `[UnsafeAccessor(UnsafeAccessorKind.Method, Name = "ReadMsr")] private static extern int ReadMsr(Cpu cpu);`
  - Bad: `[UnsafeAccessor(UnsafeAccessorKind.Field, Name = "_cache")] private static extern ref Dictionary<string, object> Cache(object owner);`
  - Too rigid: adding `public int ReadMsrForTests()` to production APIs only to avoid a test-boundary `UnsafeAccessor`.

## 4. Async And Threading

* **DO: Accept `CancellationToken` as the last parameter on public or internal async, polling, blocking, or I/O methods when the caller can control lifetime**. Do not make it optional on Core/Helper APIs that participate in shutdown.
  - Good: `Task<IReadOnlyList<SensorSnapshot>> ReadAsync(CancellationToken cancellationToken)`
  - Bad: `Task PollAsync()` for a long-running polling loop.
  - Too rigid: `double NormalizePercentage(double value, CancellationToken cancellationToken)` for pure CPU math.

* **DO: Use `ConfigureAwait(false)` in Core and Helper library code**. Do not use it in WinUI code that must resume on the UI thread.
  - Good: `await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);`
  - Bad: `await process.WaitForExitAsync(cancellationToken);` in Core/Helper library code.
  - Too rigid: `await RefreshUiAsync().ConfigureAwait(false); statusText.Text = "Ready";`

* **DON'T: Use `async void` except for event handlers**. Event handlers must catch and report exceptions at the UI or process boundary.
  - Good: `private async void OnRefreshClicked(object sender, RoutedEventArgs args) { try { await RefreshAsync(); } catch (Exception exception) { ReportError(exception); } }`
  - Bad: `public async void PollAsync()`
  - Too rigid: refusing `async void` for a WinUI event handler and inventing awkward sync wrappers.

* **DON'T: Block on async work with `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()`** except at an explicit synchronous process boundary with a documented reason.
  - Good: `await RunAsync(cancellationToken).ConfigureAwait(false);`
  - Bad: `ReadAsync(cancellationToken).Result`
  - Too rigid: rewriting a required synchronous host entry point instead of using `RunAsync(cancellationToken).GetAwaiter().GetResult(); // Host requires sync entry.`

* **PREFER: Return `Task` or `Task<T>` by default**. Use `ValueTask<T>` only for measured hot paths or APIs that usually complete synchronously and have clear single-consumption semantics.
  - Good: `Task<SensorSnapshot> ReadAsync(CancellationToken cancellationToken)`
  - Bad: storing `ValueTask<SensorSnapshot>` in a field, returning it to multiple consumers, or awaiting it twice.
  - Too rigid: refusing `ValueTask<T>` for a measured hot-path cache lookup that usually completes synchronously.

* **PREFER: Use a dedicated `System.Threading.Lock` for synchronous private locks in .NET 9+ / C# 13+ code**. Use async-compatible coordination, such as `SemaphoreSlim`, when the protected operation awaits.
  - Good: `private readonly Lock _gate = new();`
  - Bad: `private readonly object _lock = new();` in new .NET 9+ / C# 13+ code without a compatibility reason.
  - Too rigid: using `lock (_gate) { await RefreshAsync(); }` instead of `SemaphoreSlim`.

* **PREFER: Match disposal syntax to the resource and scope**. Use `await using` whenever the type implements `IAsyncDisposable`, even if it also implements `IDisposable`; the synchronous path may skip async cleanup. Use `using var` when the enclosing block is the intended synchronous lifetime; use a `using (...)` statement when early disposal matters.
  - Good: `await using HardwareMonitorSession session = await HardwareMonitorSession.OpenAsync(cancellationToken);`
  - Bad: `using HardwareMonitorSession session = await HardwareMonitorSession.OpenAsync(cancellationToken);` when the session implements `IAsyncDisposable`.
  - Bad: `using var session = new HardwareMonitorSession();` inside an async method when `HardwareMonitorSession` implements `IAsyncDisposable`.
  - Too rigid: wrapping every disposable in `using (...) { }` even when method-scope `using var` is clearer and equivalent.

* **CONSIDER: Use `IAsyncEnumerable<T>` for real streams**. Keep one-shot snapshots as `Task<IReadOnlyList<T>>`.
  - Good: `await foreach (SensorSnapshot snapshot in session.ReadSnapshotsAsync(cancellationToken)) { ... }`
  - Bad: repeatedly returning growing `Task<IReadOnlyList<SensorSnapshot>>` batches for an unbounded polling stream.
  - Too rigid: exposing `IAsyncEnumerable<T>` for a single hardware snapshot request.

## 5. Span And Ref Safety

* **PREFER: Use `ReadOnlySpan<T>` or `Span<T>` for hot in-process parsing and formatting helpers**. Keep spans, `ref struct`, and `scoped` values out of JSON, IPC, UI, and long-lived domain contracts unless profiling or interop requires them.
  - Good: `static bool TryParseSensorPath(ReadOnlySpan<char> path, out SensorPath result)`
  - Bad: `public ReadOnlySpan<char> SensorPath { get; init; }` on a JSON DTO.
  - Too rigid: changing `public required string SensorPath { get; init; }` to span-based DTO plumbing for theoretical performance.

* **CONSIDER: Use `params ReadOnlySpan<T>` only for low-level helpers where caller convenience avoids repeated array allocations**.
  - Good: `static bool IsAny(SensorType value, params ReadOnlySpan<SensorType> allowed)`
  - Bad: `public SensorQuery Include(params ReadOnlySpan<SensorType> sensorTypes)` on a durable public domain API.
  - Too rigid: keeping `static bool IsAny(SensorType value, params SensorType[] allowed)` in a measured hot helper.

* **CONSIDER: Use `allows ref struct` only in generic helpers that already operate on spans or other `ref struct` values**. Keep it out of ordinary domain APIs.
  - Good: `static bool TryRead<TReader>(scoped ref TReader reader) where TReader : allows ref struct`
  - Bad: `MetricRepository<T> where T : allows ref struct`
  - Too rigid: duplicating parser helpers for each span-backed reader only to avoid `allows ref struct`.

## 6. Local C# Syntax

* **PREFER: Use modern argument guards and pattern null checks**. Use `ThrowIf...` helpers for ordinary parameter validation, and `is null` / `is not null` for explicit null tests.
  - Good: `ArgumentNullException.ThrowIfNull(snapshot);`
  - Good: `if (snapshot is null) return;`
  - Bad: `if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));`
  - Too rigid: replacing a domain-specific validation error with `ArgumentNullException.ThrowIfNull(...)`.

* **DO: Follow the dotnet/runtime `var` rule**: use `var` only when the type is explicitly named on the right-hand side, typically `new` or an explicit cast. Do not use `var` for method return values, LINQ results, or built-in scalar literals.
  - Good: `var reader = new LibreHardwareReader();`
  - Bad: `var snapshot = reader.Read();`
  - Bad: `var retryLimit = 3;`

* **PREFER: Use target-typed `new()` only when the left-hand side explicitly names the type**.
  - Good: `List<SensorSnapshot> snapshots = new();`
  - Bad: `List<SensorSnapshot> snapshots = new List<SensorSnapshot>();`

* **PREFER: Use collection expressions for target-typed arrays, lists, and spans**. Avoid them when the target type is not obvious or allocation behavior matters to the code being reviewed.
  - Good: `SensorType[] supportedTypes = [SensorType.Load, SensorType.Temperature];`
  - Bad: `var supportedTypes = [SensorType.Load, SensorType.Temperature];`
  - Too rigid: replacing `ImmutableArray<SensorType>.Empty` with `[]` without checking the target type and allocation semantics.

* **PREFER: Use LINQ method chains, not query syntax**.
  - Good: `sensors.Where(sensor => sensor.Type == SensorType.Temperature).Select(sensor => sensor.Value)`
  - Bad: `from sensor in sensors where sensor.Type == SensorType.Temperature select sensor.Value`

* **PREFER: Use pattern matching for simple null/type/enum dispatch**. Use `switch` expressions for value-producing dispatch; keep `switch` statements or `if` chains when side-effect order is clearer.
  - Good: `return sensor.Type switch { SensorType.Load => "load", SensorType.Temperature => "temp", _ => "unknown" };`
  - Good: `if (value is SensorSnapshot snapshot) { ... }`
  - Bad: `SensorSnapshot? snapshot = value as SensorSnapshot; if (snapshot is not null) { ... }`
  - Too rigid: forcing a large side-effecting workflow into a `switch` expression.

* **DO: Use PascalCase for C# constants** except interop constants that intentionally mirror an external API name.
  - Good: `private const int DefaultPollingIntervalSeconds = 1;`
  - Bad: `private const int DEFAULT_POLLING_INTERVAL_SECONDS = 1;`
  - Too rigid: renaming `WM_DEVICECHANGE` when intentionally mirroring Win32.

* **DO: Use `nameof(...)` for strings that refer to C# members, parameters, or properties**.
  - Good: `throw new ArgumentOutOfRangeException(nameof(pollingIntervalSeconds));`
  - Bad: `throw new ArgumentOutOfRangeException("pollingIntervalSeconds");`

* **PREFER: Keep global usings limited to namespaces that are truly universal for the project**. Do not add a global using to save one local `using`.
  - Good: `using LibreHardwareMonitor.Hardware;` only in the LHM adapter file.
  - Bad: `global using LibreHardwareMonitor.Hardware;` for one adapter.
  - Too rigid: banning `global using System;` in a project that consistently uses implicit/global base usings.

## 7. Organization And Caller Readability

* **PREFER: Order class members consistently**: nested types/events, static/const/readonly fields, instance fields/properties, constructors, methods. Within a group, prefer `public`, `internal`, `protected`, then `private`; keep related interface implementation members together without adding `#region` unless the file already uses regions.
  - Good: constants and fields before constructors; public API before private helpers in the same member group.
  - Bad: private helpers before fields, constructor between unrelated methods, and interface members scattered through the class.
  - Too rigid: moving a private helper far away from the only method that uses it when local readability is better.

* **DO: Keep call sites self-explanatory when arguments are non-obvious**. Use named arguments for boolean/null literals, named constants for repeated literals, and local variables for complex expressions.
  - Good: `service.Start(useSsl: true);`
  - Good: `TimeSpan timeout = TimeSpan.FromSeconds(5); client.Connect(endpoint, timeout);`
  - Bad: `service.Start(true);`
  - Bad: `client.Connect(endpoint, TimeSpan.FromMilliseconds(Math.Max(100, retryCount * 250)));`

* **PREFER: Use the narrowest truthful collection type at API boundaries**. Inputs should not require `List<T>` unless the method needs list-specific mutation or indexing. Outputs should communicate ownership: `IReadOnlyList<T>` for snapshots, `List<T>` when transferring a mutable container, arrays for fixed-size buffers or constants.
  - Good: `void Publish(IReadOnlyList<SensorSnapshot> snapshots)`
  - Bad: `void Publish(List<SensorSnapshot> snapshots)` when the method only enumerates.
  - Too rigid: `IEnumerable<SensorSnapshot>` when the method indexes or enumerates the sequence multiple times.

* **DO: Use formatter-stable C# layout**. Use 4-space indentation, braces on control statements, one statement per line, and one blank line between members. Prefer the repo's `.editorconfig` if one is added later.
  - Good: `if (isReady) { ... }` with braces before formatting expands it.
  - Bad: `if (isReady) Start();`
