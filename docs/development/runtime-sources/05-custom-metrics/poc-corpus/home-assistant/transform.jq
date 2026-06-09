{
  metrics: (
    if .state != null and .attributes.unit_of_measurement == "°C" then [
      {
        metricId: ("home_assistant." + .entity_id),
        label: "Kitchen",
        value: (.state | tonumber),
        unit: "celsius",
        maximum: 50
      }
    ] else [] end
  )
}
