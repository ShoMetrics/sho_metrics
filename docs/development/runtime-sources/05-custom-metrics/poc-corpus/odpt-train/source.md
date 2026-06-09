# ODPT Train POC Source

Reference page:

- https://sophie-app.github.io/odpt-openapi/#operation/TrainOperations_getTrains

This is not treated as a v1 no-auth source. The documented API requires
`acl:consumerKey`; this case only tests transform complexity if a user can
provide an already-fetched JSON payload.

The sample combines documented train fields such as `odpt:railway`,
`odpt:delay`, `odpt:fromStation`, `odpt:toStation`, and station title fields.
It also includes an occupancy scale and a precomputed next-train minutes array
to model future multi-request or lookup scenarios without adding v1 runtime
support for multiple HTTP requests.
