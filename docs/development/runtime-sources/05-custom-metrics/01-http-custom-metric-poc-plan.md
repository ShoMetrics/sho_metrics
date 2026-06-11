# HTTP Custom Metric Transform Engine Report

## Status

Stage 1 POC is complete enough to choose the v1 transform-engine direction.

Recommendation: use **jq through `jq-wasm`** for the next HTTP Custom Metric
design pass.

JSONata should remain a comparison/fallback candidate, not the default v1
engine. It is operationally attractive because it is pure JavaScript and faster
in this POC harness, but model-generated JSONata was less reliable on nested
array/filter cases and ODPT-style colon-containing keys.

Do not implement runtime settings, protobuf fields, source polling, or Property
Inspector panels from this document directly. Use this report as the evidence
base for the next implementation design document.

## Product Baseline

User-facing product name: **Custom Metric**.

HTTP is only the v1 source type. Internal code should name the source type
explicitly, such as `custom-http`, so future source types like local command
execution do not inherit HTTP-specific assumptions.

v1 scope:

- HTTP GET returning JSON;
- scalar metrics only;
- no arbitrary text metric;
- no auth, cookies, secrets, POST body, local command execution, or
  multi-request pipeline;
- one source definition owns one HTTP request and one polling/failure domain;
- one transform can output `metrics[]`;
- widgets select one app-assigned metric from that output catalog.

The user provides:

1. an HTTP GET JSON URL;
2. a natural-language display request, for example "display current temperature
   and wind speed";
3. a transform rule generated from the sample JSON plus that display request;
4. a selected metric from the validated output catalog.

The AI-generated transform output should not author final ShoMetrics metric IDs.
Only the app knows source-definition identity, duplicate URL cases, selected row
identity, and persisted widget references. The transform output should contain
display metadata and values; the app assigns stable metric IDs after validation.

Stage 1 seed fixtures still include `metricId` in expected output for exact
comparison of hand-written seed transforms. Model-generation tests use
app-assigned temporary IDs and reject AI-authored `metricId`.

## Decision Summary

Choose `jq-wasm` for v1 because:

- jq was more reliable across local models and hosted manual final exams;
- jq is widely represented in model training data;
- jq handles object construction, array filtering, aggregation, recursive
  traversal, and string-to-number conversion without inventing a ShoMetrics DSL;
- jq handled ODPT-style colon-containing keys more consistently than JSONata;
- `jq-wasm` avoids native executable installation and can run inside a Worker
  with timeout and output-size guards.

Do not choose JSONata as default because:

- it needed more generic syntax tutoring in the prompt;
- Gemma4 failed the Prometheus JSONata nested-array/filter case 0/5;
- Doubao failed ODPT JSONata 4/4 across recorded hosted manual runs;
- JSONata failures were syntax/DSL-shape failures, not product-schema failures.

Do not build a ShoMetrics-specific transform DSL for v1. A short local custom
JSON DSL experiment made simple API cases workable only after providing a
generic skeleton, while array/filter/aggregation cases caused models to invent
unsupported behavior. A custom DSL would shift complexity from runtime
integration to model instruction quality, validation, documentation, and
long-term feature drift.

This conclusion has limits. `jq-wasm` is not a silver bullet, and the POC
scripts are not a full product safety or usability proof. The tests measured a
bounded corpus, schema-valid output, selected manual hosted-model runs, and
basic Worker safety guards; they did not prove every future API, every model, or
production packaging. The decision is narrower: among the evaluated options,
`jq-wasm` is the strongest current choice. If jq cannot handle a user transform
scenario, the tested alternatives are less likely to handle it reliably. This
is enough evidence to proceed to the next HTTP Custom Metric design step.

## Evaluated Engines

| Candidate | Decision | Reason |
| --- | --- | --- |
| `jq-wasm` | Recommended | Best model-generation reliability; mature transform language; no native install step. |
| JSONata | Fallback only | Pure JS and fast, but less reliable for generated syntax on hard cases. |
| JSONPath | Reject | Query language; not enough for constructing a full metric catalog. |
| JMESPath | Reject | More expressive than JSONPath, but awkward for catalog construction and recursive transforms. |
| `jqts` | Reject | Subset drift from real jq; users and AI will write real jq syntax. |
| `@michaelhomer/jqjs` | Research fallback only | Serious pure JS effort, but not full jq and has compatibility/performance caveats. |
| `jq-web` | Reference only | Older Emscripten jq port; not preferred for a new dependency. |
| Starlark | Reject | Attractive language, but Node runtime ecosystem is not mature enough for product dependency. |

## Corpus

Committed corpus root:

```text
docs/development/runtime-sources/05-custom-metrics/poc-corpus/
```

Each committed case contains:

- `input.json`;
- `intent.txt`;
- `expected.metrics.json`;
- `source.md`;
- `transform.jq`;
- `transform.jsonata`.

Committed cases:

| Case | Role | Reference |
| --- | --- | --- |
| CodexBar | Local/localhost tool JSON and optional fields | https://github.com/steipete/CodexBar/blob/main/docs/cli.md |
| Open-Meteo | No-auth weather API with provider units | https://open-meteo.com/en/docs |
| GitHub repo stats | Simple public API baseline | https://docs.github.com/en/rest/repos/repos#get-a-repository |
| Home Assistant | Local dashboard state object with string numeric values | https://developers.home-assistant.io/docs/api/rest/ |
| Prometheus | Self-hosted monitoring vector result with label sets and string values | https://prometheus.io/docs/prometheus/latest/querying/api/ |
| ODPT train | Future-auth transform-complexity add-on | https://sophie-app.github.io/odpt-openapi/#operation/TrainOperations_getTrains |

Deferred or add-on-only cases:

- Flight status: deferred because useful flight-number ETA APIs require auth.
  OpenSky does not satisfy the product CUJ.
- LHM remote JSON: add-on attempted from a real
  `http://192.168.4.48:8085/data.json` response. Direct full-tree prompting was
  unstable; future design should likely precompute a sensor summary/catalog
  before asking AI to write a transform.

ODPT is intentionally committed as a final-exam stress case but must not count
as v1 no-auth core pass-rate evidence.

## Output Contract Used In The POC

Model-generated transform output targets this shape:

```json
{
  "metrics": [
    {
      "label": "CPU",
      "value": 123.45,
      "unit": "percent",
      "maximum": 100
    }
  ]
}
```

POC validation rules:

- output is one object with non-empty `metrics[]`;
- every metric has `label`, numeric `value`, and `unit`;
- `maximum` is optional, but must be positive when present;
- known units use an enum;
- real provider units outside the enum use `unit: "custom"` plus
  `customUnit`, for example `km/h` or `min`;
- model-generated output must omit `metricId`;
- labels are compact enough for Stream Deck display;
- string-valued source fields such as names, statuses, descriptions, IDs, and
  timestamps do not become metrics.

The final product should replace the POC validator with a formal output schema,
likely JSON Schema + Ajv at the transform-output boundary. Persisted settings
should remain protobuf-backed.

## Prompt Findings

The model prompt must include the user's natural-language display request. A
sample JSON alone is not enough; APIs often contain many numeric fields, and the
model otherwise chooses fields as if it were designing the widget.

Prompt rules that materially improved results:

- state the data-conversion goal directly; do not rely on the model knowing
  "ShoMetrics";
- repeat the user display request after large JSON samples;
- tell the model to output only the transform expression;
- forbid `<think>`, Markdown fences, explanations, copied input JSON, and
  authored `metricId`;
- require only the requested values, not every numeric field;
- ask the model to emit JSON numbers for metric values. The final runtime may
  accept strict decimal numeric strings as a tolerance layer, but the prompt
  should still push jq to convert provider string values explicitly;
- add engine-specific syntax guardrails for common model mistakes.

Important jq guardrails:

- object construction and pipes are jq syntax, not JavaScript;
- string-to-number is `(.field | tonumber)`;
- lowercase is `ascii_downcase`;
- keys containing colons use bracket syntax, for example
  `.["odpt:railway"]`;
- top-level fields are properties, not variables;
- recursive trees should use recursive descent rather than guessed fixed depth.

Important JSONata guardrails:

- functions are `$number()`, `$map()`, `$filter()`, not JavaScript functions;
- string concatenation is `&`;
- top-level paths do not start with `.`;
- do not invent `$input`, `$root`, `$data`, or `$result`;
- keys containing colons use backtick property access, for example
  ``$v.`odpt:railway```; 
- object entries must be `"key": value`;
- `$map($filter(...), function($v) { ... })` is safer than shorthand syntax.

Even with these generic guardrails, JSONata remained less stable on hard cases.

## Tooling

Transform checker:

```text
packages/hub/scripts/custom-metric-transform-check.mjs
```

Example:

```text
node packages/hub/scripts/custom-metric-transform-check.mjs \
  --engine jq-wasm \
  --input docs/development/runtime-sources/05-custom-metrics/poc-corpus/open-meteo/input.json \
  --transform docs/development/runtime-sources/05-custom-metrics/poc-corpus/open-meteo/transform.jq \
  --expected docs/development/runtime-sources/05-custom-metrics/poc-corpus/open-meteo/expected.metrics.json
```

Responsibilities:

- read input and transform as UTF-8;
- enforce input size before parse;
- execute transform in a Worker;
- terminate Worker on timeout;
- enforce output size before schema validation;
- validate output;
- optionally compare exact expected output;
- print structured JSON results.

Model/manual exam runner:

```text
packages/hub/scripts/custom-metric-transform-exam.mjs
```

Examples:

```text
node packages/hub/scripts/custom-metric-transform-exam.mjs \
  --case codexbar \
  --engine jq-wasm \
  --rounds 3

node packages/hub/scripts/custom-metric-transform-exam.mjs --interactive
```

Interactive mode lists corpus cases, asks for case selection, engine, round
count, and whether to copy the prompt to the clipboard. A pasted rule is
terminated by a line containing only:

```text
<<<SHOMETRICS_RULE_DONE>>>
```

The terminator is intentionally not `END`, because jq filters may contain
`end` on its own line. EOF also submits after pasted rule content.

Local model tests should use Ollama native `/api/chat` with `think: false`.
OpenAI-compatible local endpoints can expose reasoning in provider-specific
fields, which makes transform-only validation less reliable.

## Dependency Safety Review

Installed POC dev dependencies in `packages/hub`:

- `jq-wasm@1.1.0-jq-1.8.1`;
- `jsonata@2.0.6`.

`packages/hub/package.json` intentionally pins these exact versions instead of
using semver ranges. This avoids accidentally pulling a newer JSONata release
that was rejected by the POC safety window when installing without an existing
lockfile.

Safety notes:

| Package | Result |
| --- | --- |
| `jq-wasm@1.1.0-jq-1.8.1` | No install lifecycle scripts in npm metadata; no runtime dependencies; tarball has 7 files; jq/Emscripten payload appears bundled in `dist/build/jq.js`; MIT license. |
| `jsonata@2.0.6` | No install lifecycle scripts in npm metadata; no runtime dependencies; pure JS package shape; MIT license. |

`jsonata@2.2.1` was not used because it was published on 2026-05-19, inside the
30-day safety window at the time of review.

`npm.cmd audit --omit=dev --json` reported existing production issues in
`systeminformation` and `ws`; neither came from the POC transform packages. Full
audit also reported dev-only issues in `brace-expansion` and `fast-uri`; neither
came from the POC transform packages.

`jq-wasm` is acceptable for POC and next design work, but production use needs a
dependency ownership decision. The upstream package wraps a large Emscripten jq
payload and has a small apparent test surface. Before production implementation,
decide whether to vendor, fork, or rebuild jq WebAssembly from upstream jq and a
pinned Emscripten toolchain.

Recommended hardening if forking/vendorizing:

- pin upstream jq tag and checksum;
- pin Emscripten Docker image or SDK version;
- make CI produce reproducible artifacts;
- run jq upstream tests plus this corpus;
- whitelist runtime flags;
- keep Worker timeout, input-size, output-size, and schema guards;
- document bundled licenses and generated artifact provenance.

## Safety Results

| Aspect | jq-wasm | JSONata | Notes |
| --- | --- | --- | --- |
| Timeout enforcement | Pass | Pass | A normal seed transform with `--timeout-ms 1` returns timeout for both engines. |
| Malformed schema rejection | Pass | Pass | String-valued `value` is rejected with bounded schema errors. |
| Output size rejection | Pass | Pass | Large generated output fails before schema validation. |
| Host environment access | Partial | N/A | jq-wasm did not expose a user-injected host environment variable; `$ENV` returned only Emscripten-style simulated values. |
| Current time access | Known limitation | N/A | jq's `now` can read wall-clock time. V1 accepts this as a low-severity determinism limitation; prompts should not rely on time unless explicitly requested. |
| Placeholder metric ID rejection | Pass | Pass | Validator rejects copied placeholder IDs and duplicate IDs in require mode. |
| Expensive transform fixture | Inconclusive | Inconclusive | Pathological samples either failed fast or exited the worker. Timeout enforcement is still proven by deadline tests. |

The POC did not prove memory ceilings, full host-access isolation, or
browser-bundle behavior. Stage 2 must design those as product safety
requirements, not rely on this script.

## Performance Results

Each row is 100 runs through the checker, including Worker startup, transform
execution, schema validation, and expected-output comparison.

| Case | jq-wasm avg | jq-wasm p95 | JSONata avg | JSONata p95 |
| --- | ---: | ---: | ---: | ---: |
| CodexBar | 46.35 ms | 48.13 ms | 31.62 ms | 32.87 ms |
| Open-Meteo | 46.98 ms | 48.48 ms | 32.65 ms | 34.34 ms |
| GitHub repo stats | 44.78 ms | 46.76 ms | 31.27 ms | 32.49 ms |
| Prometheus | 46.37 ms | 48.05 ms | 32.00 ms | 33.23 ms |
| Home Assistant | 44.71 ms | 46.28 ms | 31.73 ms | 32.77 ms |

Interpretation:

- both engines met the Stage 1 p95 <= 50 ms target on small responses with a
  new Worker per transform;
- JSONata was consistently faster in this harness;
- this is not a final runtime budget because large LHM trees, 100-row
  Prometheus payloads, repeated warm workers, and memory use were not fully
  measured.

## Model Generation Results

### Local Ollama: `qwen3.6:latest`

Native `/api/chat`, `think: false`, 5 rounds per core case and engine.

| Case | jq-wasm schema-valid | JSONata schema-valid |
| --- | ---: | ---: |
| CodexBar | 5/5 | 5/5 |
| Open-Meteo | 5/5 | 5/5 |
| GitHub repo | 5/5 | 5/5 |
| Prometheus | 5/5 | 5/5 |
| Home Assistant | 5/5 | 5/5 |

Qwen result:

- jq-wasm: 25/25 schema-valid;
- JSONata: 25/25 schema-valid after generic syntax guardrails;
- raw outputs contained no reasoning, `<think>`, or Markdown fences with
  Ollama native `/api/chat` and `think: false`;
- this validates schema only, not perfect labels, units, maxima, or selected
  fields.

### Local Ollama: `gemma4-26b-a4b-it-q4km:latest`

Native `/api/chat`, `think: false`, 5 rounds per core case and engine.

| Case | jq-wasm schema-valid | JSONata schema-valid | Notes |
| --- | ---: | ---: | --- |
| CodexBar | 5/5 | 5/5 | One sampled JSONata run used `unitless` for credits instead of a custom credit unit. |
| Open-Meteo | 5/5 | 5/5 | Both engines handled current weather and wind custom unit. |
| GitHub repo | 5/5 | 5/5 | Both engines produced requested repository stats. |
| Prometheus | 5/5 | 0/5 | JSONata consistently failed nested array/filter handling. |
| Home Assistant | 5/5 | 5/5 | Both engines handled string-to-number conversion. |

Gemma result:

- jq-wasm: 25/25 schema-valid;
- JSONata: 20/25 schema-valid;
- the only JSONata failure group was Prometheus;
- further JSONata prompt tuning would have become engine-specific tutoring, so
  the POC stopped there.

### Manual Hosted Web UI

These runs are capability signals, not local-runner stability statistics.

| Model / condition | jq-wasm | JSONata | Notes |
| --- | ---: | ---: | --- |
| GPT web model labeled "gpt 5.5 instant", no visible thinking, fresh private session per prompt | 6/6 | 6/6 | Six-case final exam passed for both engines. |
| GPT web ODPT follow-up | 3/3 | 2/3 | ODPT remained harder for JSONata. |
| Doubao, new conversation per prompt | 6/6 | 5/6 | Six-case final exam; JSONata failed ODPT. |
| Doubao ODPT follow-up, new conversation per prompt | 3/3 | 0/3 | Strong signal that ODPT separates the engines. |

Hosted ODPT aggregate across recorded runs:

- jq-wasm: 8/8;
- JSONata: 3/8.

Interpretation: stronger hosted models make both engines look viable on easy and
medium cases, but ODPT still separates the engines. jq remains more robust for
colon-containing keys, filtering, and aggregation.

## Result Table

| Case | jq-wasm result | JSONata result | Notes |
| --- | --- | --- | --- |
| CodexBar | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Official sample. |
| Open-Meteo | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Custom unit fallback handles wind speed. |
| GitHub repo stats | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Simple baseline. |
| Home Assistant | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Empty-catalog false positive fixed by requiring at least one metric. |
| Prometheus | Seed pass; Qwen 5/5; Gemma 5/5; hosted final 2/2 | Seed pass; Qwen 5/5; Gemma 0/5; hosted final 2/2 | Gemma JSONata failed nested-array filtering. |
| ODPT | Seed pass; local add-on mini failed; hosted ODPT 8/8 | Seed pass; local add-on mini failed; hosted ODPT 3/8 | Future-auth stress case. Not counted in v1 no-auth core rate. |
| Flight | Deferred | Deferred | Real ETA APIs require auth; OpenSky does not satisfy CUJ. |
| LHM remote JSON | Add-on failed mini | Not run after jq failed | Full-tree prompting needs sensor-summary preprocessing. |

## Stage 2 Implications

The next design document should start from these constraints:

- source definitions are global runtime source of truth;
- widgets store references to a source definition and selected app-assigned
  metric ID;
- transform output validation happens before descriptors enter runtime source
  caches;
- one source definition equals one HTTP request and one polling/failure domain;
- transform execution runs off the main event loop with timeout, input-size,
  output-size, and bounded error reporting;
- v1 supports GET JSON only and no auth/secrets;
- UI should provide a copyable prompt, schema, sample JSON, and user display
  request field; it should not embed AI in v1;
- detailed transform errors belong in PI, while key rendering should stay
  simple: `Configure`, `...`, `Error`, or `N/A`.

Open product questions for the implementation design:

- how the app assigns stable metric IDs from transform output rows;
- whether row identity is position-based in v1 or requires an explicit
  model/user-authored stable row key that is not the final metric ID;
- exact output JSON Schema and unit enum shape;
- how source definitions are created, edited, and reused from widgets;
- how much sample JSON is shown to the model when responses are large;
- whether LHM-like trees need a source-specific summarization step before AI
  transform generation.

## File Inventory

Commit-ready files from this POC:

- `docs/development/runtime-sources/05-custom-metrics/01-http-custom-metric-poc-plan.md`;
- `docs/development/runtime-sources/05-custom-metrics/README.md`;
- `docs/development/runtime-sources/05-custom-metrics/poc-corpus/**`;
- `packages/hub/scripts/custom-metric-transform-check.mjs`;
- `packages/hub/scripts/custom-metric-transform-exam.mjs`;
- `packages/hub/package.json`;
- `packages/hub/package-lock.json`.

Ignored local files under `artifacts/` should not be committed unless a later
review explicitly promotes a small fixture into `poc-corpus/`.
