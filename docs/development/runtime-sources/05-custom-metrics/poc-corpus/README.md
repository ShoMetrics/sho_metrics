# Custom Metric POC Corpus

This folder contains the small, stable corpus files that should travel with the
HTTP Custom Metric POC document.

Commit these files with the design document:

- source sample JSON;
- human-reviewed expected metric output;
- display intent;
- source metadata notes;
- seed jq and JSONata transforms;
- small safety-case transforms.

The corpus may include add-on cases such as auth-gated future scenarios. Keep
their source notes explicit so they can be run as final-exam stress cases
without being counted as v1 no-auth core pass-rate evidence.

Do not commit local model raw outputs, temporary runner output, local hardware
trees, or ad hoc DSL experiments here. Keep those under ignored `artifacts/`.
