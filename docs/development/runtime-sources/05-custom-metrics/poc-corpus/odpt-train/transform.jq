. as $input
| {
    "metrics": [
      {
        "metricId": "odpt.tozai.crowd",
        "label": "Crowd",
        "value": (
          [
            $input.trains[]
            | select(.["odpt:railway"] == "odpt.Railway:TokyoMetro.Tozai")
            | select(.["odpt:railDirection"] == "odpt.RailDirection:TokyoMetro.NishiFunabashi")
            | $input.occupancyStatusScale[.["odpt:occupancyStatus"]]
          ]
          | max
        ),
        "unit": "unitless",
        "maximum": 4
      },
      {
        "metricId": "odpt.tozai.nihombashi_eta",
        "label": "ETA",
        "value": (
          $input.nextTrainMinutes[]
          | select(.station == "odpt.Station:TokyoMetro.Tozai.Nihombashi")
          | select(.direction == "odpt.RailDirection:TokyoMetro.NishiFunabashi")
          | .minutes
        ),
        "unit": "custom",
        "customUnit": "min"
      }
    ]
  }
