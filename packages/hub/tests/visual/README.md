# Visual Tests

Visual tests run separately from unit tests and are not part of normal local
verification. Run them only when changing SVG rendering, widget styles,
Property Inspector visuals, or when visual regression coverage is explicitly
requested.

Widget visual tests should render deterministic SVG to PNG through the same
renderer used by production code, then compare the PNG with Playwright
snapshots. Property Inspector visual tests may use browser screenshots when the
PI workflow needs coverage.

Use:

```powershell
npm.cmd run test:visual
npm.cmd run test:visual:update
```

The baseline suite is grouped by rendering surface:

- `widget-color-filled.visual.spec.ts`: original Color Filled smoke coverage.
- `widget-single-baseline.visual.spec.ts`: broader single-metric widget coverage
  generated from the first visual snapshot renderer baseline.
- `widget-dual-baseline.visual.spec.ts`: dual-channel widget coverage generated
  from the first visual snapshot renderer baseline.
- `widget-default-theme.visual.spec.ts`: representative default-theme coverage
  added after the baseline suite.
- `widget-terminal.visual.spec.ts`: Terminal theme coverage.
- `widget-title-card.visual.spec.ts`: Title-card text edge cases across square
  and wide keys.

On the Windows development machine used to expand the suite, the widget visual
suite stayed small enough for local review. Treat this as a rough local cost
estimate; CI hardware can differ.
