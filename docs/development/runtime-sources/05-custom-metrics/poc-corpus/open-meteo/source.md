# Open-Meteo Sample Source

Reference:

- https://open-meteo.com/en/docs

Sample provenance:

- `input.json` is a real response captured on 2026-06-08 from:
  `https://api.open-meteo.com/v1/forecast?latitude=35.6812&longitude=139.7671&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`

Transform capabilities covered:

- no-auth public JSON API;
- provider unit metadata under `current_units`;
- numeric scalar values under `current`;
- unit mapping from provider text to ShoMetrics canonical units.

POC note:

- `wind_speed_10m` is intentionally not in `expected.metrics.json` because the
  current ShoMetrics canonical unit set does not include speed such as km/h or
  m/s. This is a real product/schema gap exposed by the corpus.

