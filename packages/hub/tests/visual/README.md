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
