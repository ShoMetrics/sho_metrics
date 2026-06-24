# Stats-Derived Bluetooth Readers

This directory is for traceable ports from Stats, not for ShoMetrics-owned
Bluetooth battery design.

Keep ports mechanical:

- Preserve the source file/function structure when porting Stats query logic.
- Preserve source comments unless they are confirmed to describe only unused
  Stats app behavior.
- Add comments for every deliberate divergence from Stats.
- Keep ShoMetrics-owned adapters, identity mapping, caching, retry, polling,
  and product decisions outside this directory.
- Do not invent merged helpers or convenience abstractions here. If Node needs
  an equivalence shim for a Swift/native API, isolate it and label it as a
  Node-only equivalence helper.

The goal is reviewable provenance: a later reader should be able to compare a
ported function with the referenced Stats implementation and understand exactly
where ShoMetrics intentionally differs.
