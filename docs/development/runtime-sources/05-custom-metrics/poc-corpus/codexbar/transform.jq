{
  metrics: (
    [
      if .usage.primary.usedPercent != null then {
        metricId: "codex.primary.used_percent",
        label: "Codex",
        value: .usage.primary.usedPercent,
        unit: "percent",
        maximum: 100
      } else empty end,
      if .usage.secondary.usedPercent != null then {
        metricId: "codex.secondary.used_percent",
        label: "Weekly",
        value: .usage.secondary.usedPercent,
        unit: "percent",
        maximum: 100
      } else empty end,
      if .credits.remaining != null then {
        metricId: "codex.credits.remaining",
        label: "Credits",
        value: .credits.remaining,
        unit: "unitless",
        maximum: 200
      } else empty end
    ]
  )
}
