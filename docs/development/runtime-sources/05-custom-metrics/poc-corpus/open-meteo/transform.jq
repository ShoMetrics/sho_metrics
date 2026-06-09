{
  metrics: (
    [
      if .current.temperature_2m != null then {
        metricId: "weather.temperature_2m",
        label: "Temp",
        value: .current.temperature_2m,
        unit: "celsius",
        maximum: 50
      } else empty end,
      if .current.relative_humidity_2m != null then {
        metricId: "weather.relative_humidity_2m",
        label: "Humidity",
        value: .current.relative_humidity_2m,
        unit: "percent",
        maximum: 100
      } else empty end,
      if .current.wind_speed_10m != null then {
        metricId: "weather.wind_speed_10m",
        label: "Wind",
        value: .current.wind_speed_10m,
        unit: "custom",
        customUnit: "km/h",
        maximum: 100
      } else empty end
    ]
  )
}
