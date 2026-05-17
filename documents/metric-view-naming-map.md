# Metric View Naming Map

Status: migrated to the project skill `naming-guidance`.

Use `.agents/skills/naming-guidance/SKILL.md` as the source of truth for metric
view, renderer contract, WidgetData, and historical appearance vocabulary.

This document is kept only as a stable pointer for older discussion links. It
is no longer a rollout plan or rename checklist.

Current high-level mapping:

| Product View | Settings Field | Resolved Field | Renderer Contract | Current SVG Widget |
|---|---|---|---|---|
| Text | `selected_view = METRIC_VIEW_TEXT` | `selectedView = "text"` | `renderPrimitive = "text"` | `text-metric` |
| Line | `selected_view = METRIC_VIEW_LINE` | `selectedView = "line"` | `renderPrimitive = "sparkline"` | `sparkline` |
| Bar | `selected_view = METRIC_VIEW_BAR` | `selectedView = "bar"` | `renderPrimitive = "bar"` | `progress-bar` |
| Circle | `selected_view = METRIC_VIEW_CIRCLE` | `selectedView = "circle"` | `renderPrimitive = "circle"` | `progress-circle` |

Theme mapping:

| Product Concept | Settings Field | Resolved Field | Renderer Contract |
|---|---|---|---|
| Theme | `selected_theme` | `selectedTheme` | `themePreset` |
| Theme Variant | theme-owned variant field | theme-owned variant field | flattened concrete `themePreset` value |

Historical terms such as `graph`, `layout`, `graphicType`, `circleStyle`,
`linear-bar`, `arc-gauge`, `MetricDisplay*`, and `metric-view-runner` should not
be used as current vocabulary. See the skill for allowed exceptions and
boundary-specific names.
