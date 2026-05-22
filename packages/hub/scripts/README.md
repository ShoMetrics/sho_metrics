# Hub Scripts

| Directory | Purpose |
| --- | --- |
| `benchmark/` | Synthetic microbenchmarks for isolated libraries or formats. These do not need a running Stream Deck plugin. |
| `diagnostics/` | Runtime and source diagnostics for real local systems. These may read plugin logs, process counters, optional helper probes, or optional LHM JSON endpoints. |
| `proto/` | Protobuf generation support files used by package scripts. |

Diagnostic scripts must not write machine names, local paths, LAN IPs, or other
PII into committed output. Pass local endpoints and probe paths as command-line
arguments when running them.

## Source Comparison

`diagnostics/metric-source-comparison.mjs` can compare:

- `node`: direct Node/systeminformation and `nvidia-smi` reads.
- `windows-helper`: the running Windows helper named pipe.
- `lhm-json`: an explicitly provided LHM desktop JSON URL.
- `external-probe`: an explicitly provided local executable that writes NDJSON
  `{"event":"sample", ...}` lines. The current summarizer understands the
  Windows C# metric-source probe shape with `native` and `lhmDll` sample
  objects, but the script itself does not require that probe to exist.

Examples:

```powershell
npm.cmd run diagnostics:source -- --sources=node --metrics=cpu,ram --duration-ms=30000
npm.cmd run diagnostics:source -- --sources=node,windows-helper --metrics=cpu,ram --duration-ms=30000 --warmup-ms=5000
npm.cmd run diagnostics:source -- --sources=node,lhm-json --lhm-json-url=http://127.0.0.1:8085/data.json
npm.cmd run diagnostics:source -- --sources=node,lhm-json --metrics=cpu --stress --workload-start-ms=5000 --reaction-metric=cpuUsagePercent --reaction-threshold=80
```
