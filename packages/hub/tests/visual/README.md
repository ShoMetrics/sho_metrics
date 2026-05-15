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

Current widget visual coverage has 8 snapshots. On the Windows development
machine used to add the suite, 5 consecutive runs averaged 1.814 seconds total,
or 0.227 seconds per snapshot. Treat this as a rough local cost estimate; CI
hardware can differ.
