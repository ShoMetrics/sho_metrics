{
  metrics: [
    .data.result[]
    | select(.value[1] != null)
    | {
      metricId: (
        "prometheus."
        + (.metric.instance | split(":")[0])
        + ".cpu."
        + .metric.cpu
        + "."
        + .metric.mode
      ),
      label: ("CPU" + .metric.cpu + " Idle"),
      value: (.value[1] | tonumber),
      unit: "percent",
      maximum: 100
    }
  ]
}
