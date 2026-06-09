# Home Assistant Sample Source

Reference:

- https://developers.home-assistant.io/docs/api/rest/

Sample provenance:

- `input.json` follows the official `/api/states/<entity_id>` state object
  shape. The official docs show a state update payload for
  `sensor.kitchen_temperature` with state `"25"` and unit `"°C"`, and describe
  state objects as containing `entity_id`, `state`, `last_changed`, and
  `attributes`.

Transform capabilities covered:

- auth-required local REST API shape;
- numeric parsing from string state;
- unit mapping from `attributes.unit_of_measurement`;
- stable metric ID from `entity_id`.

