# Protobuf-ES Performance Benchmark

## Summary

This benchmark compares `protobuf-es` and `protobufjs` on a deliberately complex persisted-object payload. The proto uses a fictional Kivotos rail transit system so the benchmark does not look like a production app schema.

Result on this machine:

- Binary size is identical: `36,129` bytes.
- JSON size is close: `protobuf-es 52,277` bytes vs `protobufjs 53,377` bytes.
- `protobufjs` is faster for every measured operation in this benchmark.
- The largest gap is binary encode: `protobuf-es toBinary` is about `9.3x` slower than `protobufjs encode`.

This benchmark measures runtime speed only. It does not measure conformance, generated TypeScript quality, API ergonomics, schema governance, or long-term compatibility discipline.

## Environment

```txt
OS: Windows
Node.js: v24.15.0
Architecture: x64
@bufbuild/protobuf: 2.12.0
@bufbuild/protoc-gen-es: 2.12.0
@bufbuild/buf: 1.69.0
protobufjs: 8.0.1
```

`protobufjs` is no longer a project dependency. Install it temporarily when you
want to rerun this historical comparison:

```powershell
cd packages/hub
npm.cmd install --no-save protobufjs
npm.cmd run benchmark:protobuf
```

## Benchmark Files

```txt
packages/hub/scripts/benchmark/protobuf/kivotos/rail/v1/transit_system.proto
packages/hub/scripts/benchmark/protobuf/buf.gen.yaml
packages/hub/scripts/benchmark/protobuf/protobuf-performance-benchmark.mjs
```

Run after temporarily installing `protobufjs`:

```powershell
cd packages/hub
npm.cmd run benchmark:protobuf
```

Optional iteration override:

```powershell
$env:PROTO_BENCH_ITERATIONS="5000"
npm.cmd run benchmark:protobuf
Remove-Item Env:PROTO_BENCH_ITERATIONS
```

Generated benchmark files are written under:

```txt
packages/hub/scripts/benchmark/protobuf/generated/
```

That directory is ignored and should not be committed.

## Payload Shape

The dummy proto is intentionally complex but unrelated to the product domain:

- romanized rail line enum values;
- destination stations and terminal stations;
- station index map;
- nested train sets and carriages;
- repeated platform readings;
- repeated telemetry histories;
- maps;
- bytes fields;
- uint64 values;
- control-room memo entries.

Measured payload:

```txt
lines: 4
stations: 12
trains: 12
reading samples: 2,880
protobuf-es binary bytes: 36,129
protobufjs binary bytes: 36,129
protobuf-es JSON bytes: 52,277
protobufjs JSON bytes: 53,377
```

## Main Run

Iterations: `20,000`  
Warmup iterations: `2,000`

| Operation | Ops/sec | Microseconds/op |
| --- | ---: | ---: |
| protobuf-es toBinary | 902 | 1109.137 |
| protobufjs encode | 8,387 | 119.232 |
| protobuf-es fromBinary | 4,698 | 212.843 |
| protobufjs decode | 13,118 | 76.233 |
| protobuf-es toJson | 6,229 | 160.529 |
| protobufjs toObject | 23,271 | 42.972 |
| protobuf-es fromJson | 4,153 | 240.815 |
| protobufjs fromObject | 25,548 | 39.142 |
| protobuf-es JSON.stringify | 6,064 | 164.918 |
| protobufjs JSON.stringify | 6,509 | 153.629 |
| protobuf-es JSON.parse + fromJson | 2,584 | 387.022 |
| protobufjs JSON.parse + fromObject | 6,256 | 159.847 |

## Interpretation

For this payload and Node version, `protobufjs` is clearly faster.

The result does not automatically mean `protobufjs` is the better persisted contract choice. This codec work is not a hot path like render updates. A persisted codec usually runs on action appearance, Property Inspector load/save, and explicit value changes. Even the slower `protobuf-es JSON.parse + fromJson` path is roughly `387 microseconds` per operation in this benchmark.

Performance therefore should not be the primary decision point unless profiling later shows codec work on a user-visible hot path.

## Caveats

- This is one synthetic payload, not the actual final persisted contract.
- The proto is intentionally complex and may be heavier than the eventual production payload.
- `protobufjs toObject/fromObject` is not the same API contract as canonical ProtoJSON, even though the benchmark uses string enum/long/bytes options to make the JSON shape comparable.
- `protobuf-es` generated JavaScript was produced by `protoc-gen-es`; `protobufjs` used runtime reflection from the same `.proto`.
- Results may differ on Node 20, smaller payloads, browser bundles, or generated/static `protobufjs` code.

## Decision Impact

If the decision is purely runtime speed, this benchmark favors `protobufjs`.

If the decision is production contract safety, the trade-off is different:

- `protobuf-es` gives a modern generated TypeScript API, canonical ProtoJSON support, and stronger schema-governance ergonomics.
- `protobufjs` is faster here, but its generated TypeScript workflow is less clean and its API is more conversion-oriented.

For low-frequency persisted data, performance does not currently block using `protobuf-es`.
