# Prometheus Sample Source

Reference:

- https://prometheus.io/docs/prometheus/latest/querying/api/
- https://prometheus.io/docs/prometheus/3.5/querying/api/

Sample provenance:

- `input.json` follows the official instant vector result format documented by
  the Prometheus HTTP API. Prometheus documents sample values as quoted JSON
  strings because JSON cannot represent special float values like NaN/Inf.

Transform capabilities covered:

- array mapping;
- label-based metric ID construction;
- numeric parsing from string sample values;
- multiple metrics from one query result.

