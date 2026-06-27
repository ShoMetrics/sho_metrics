# Command Playbook

This playbook lists the supported command entry points for common ShoMetrics
development and release tasks. Keep detailed implementation steps in the owning
scripts, package scripts, and GitHub workflows; this file should stay as an
index of stable commands.

When changing a build, release, generated-asset, or verification command, update
this playbook if the supported entry point changes.

## First Local Setup

Use these from the repository root on a new dev machine.

These commands assume Windows development. On macOS, replace `npm.cmd`
and `npx.cmd` with `npm` and `npx`.

| Task | Command | Source of truth |
| --- | --- | --- |
| Install Hub dependencies | `npm.cmd ci --prefix packages/hub` | `packages/hub/package-lock.json` |
| Install brand tooling | `npm.cmd ci --prefix packages/assets/brand` | `packages/assets/brand/package-lock.json` |
| Enable Stream Deck developer mode | `npx.cmd streamdeck dev` from `packages/hub` | Elgato Stream Deck CLI |
| Link the local plugin | `npx.cmd streamdeck link com.ez.sho-metrics.sdPlugin` from `packages/hub` | `packages/hub/com.ez.sho-metrics.sdPlugin/manifest.json` |

The Hub `build`, `test:*`, and `lint` scripts run proto generation through their
`pre*` scripts. You only need to run `npm.cmd run generate:proto` directly after
editing `.proto` files or when debugging generated output.

## Hub / Stream Deck

Use these from `packages/hub`.

| Task | Command | Source of truth |
| --- | --- | --- |
| Install dependencies | `npm.cmd ci` | `packages/hub/package-lock.json` |
| Build plugin | `npm.cmd run build` | `packages/hub/package.json` |
| Package Stream Deck plugin | `npm.cmd run pack:streamdeck -- --version 0.1.0.0` | `packages/hub/package.json` |
| Unit tests | `npm.cmd run test:unit` | `packages/hub/package.json` |
| Property Inspector DOM tests | `npm.cmd run test:pi` | `packages/hub/package.json` |
| Lint | `npm.cmd run lint` | `packages/hub/package.json` |
| Stream Deck dev watch | `npm.cmd run watch` | `packages/hub/package.json` |
| Restart linked plugin | `npx.cmd streamdeck restart com.ez.sho-metrics` | Elgato Stream Deck CLI |
| Regenerate i18n locale JSON | `npm.cmd run i18n:generate` | `packages/hub/package.json` |
| Check i18n catalogs and generated locale JSON | `npm.cmd run i18n:check` | `packages/hub/package.json` |

`npm.cmd run build` writes the runnable local plugin output under
`packages/hub/com.ez.sho-metrics.sdPlugin/bin/` and
`packages/hub/com.ez.sho-metrics.sdPlugin/ui/property-inspector.js`. That output
is for local linked-plugin development. The final local distributable is written
by `npm.cmd run pack:streamdeck -- --version 0.1.0.0` to
`artifacts/hub/streamdeck-plugin/package/com.ez.sho-metrics.streamDeckPlugin`.
The pack script stages through `artifacts/hub/streamdeck-plugin/staging/` because
the repository `.gitignore` hides generated `bin/` files from direct Stream Deck
CLI packing. The official CLI still owns manifest packaging behavior: it writes
the passed `--version` into the packaged manifest and strips `Nodejs.Debug` from
the package.

Do not run visual tests as a default gate. Use `npm.cmd run test:visual` only
when changing widget visuals, SVG/raster output, or Property Inspector UI.

To inspect Property Inspector translations without changing Stream Deck's app
language, run a development build with a build-time locale override:

```powershell
$env:SHO_METRICS_BUILD_MODE = "development"
$env:SHO_METRICS_DEV_LOCALE_OVERRIDE = "ja" # en, zh_CN, or ja
npm.cmd run watch
```

Clear `SHO_METRICS_DEV_LOCALE_OVERRIDE` and rebuild before returning to normal
Stream Deck-language behavior. The override is injected at build time and is
ignored outside development builds.

## Proto

Use these from `packages/hub`.

| Task | Command | Source of truth |
| --- | --- | --- |
| Format proto files | `npm.cmd run proto:format` | `packages/hub/package.json` |
| Lint proto files | `npm.cmd run proto:lint` | `packages/hub/package.json` |
| Build proto image | `npm.cmd run proto:build` | `packages/hub/package.json` |
| Regenerate TypeScript proto bindings | `npm.cmd run generate:proto` | `packages/hub/package.json` |

The TypeScript bindings are generated from `contracts/proto`. Do not hand-edit
generated files.

## Brand Assets

Use these from the repository root unless noted otherwise.

| Task | Command | Source of truth |
| --- | --- | --- |
| Install brand tooling | `npm.cmd ci --prefix packages/assets/brand` | `packages/assets/brand/package-lock.json` |
| Regenerate all brand assets | `npm.cmd run brand:sync` from `packages/hub` | `packages/assets/brand/sync-brand-assets.ts` |
| Verify generated brand assets | `npm.cmd run brand:verify` from `packages/hub` | `packages/assets/brand/sync-brand-assets.ts` |

`packages/assets/brand/README.md` owns the asset source-of-truth explanation,
renderer requirements, and generated consumer list.

## Windows Source

Use these from `packages/source-windows`.

| Task | Command | Source of truth |
| --- | --- | --- |
| Build/lint release solution | `./scripts/Test-SourceWindowsLint.ps1` | `packages/source-windows/scripts/Test-SourceWindowsLint.ps1` |
| Unit tests | `dotnet test ShoMetrics.Source.Windows.UnitTests.slnx --configuration Release --no-restore` | `.github/workflows/source-windows-ci.yml` |
| Integration smoke | `dotnet test ShoMetrics.Source.Windows.IntegrationTests/ShoMetrics.Source.Windows.IntegrationTests.csproj --configuration Release --no-restore` | `.github/workflows/source-windows-ci.yml` |
| Run Control Panel locally | `dotnet watch --no-hot-reload --project ShoMetrics.Source.Windows.ControlPanel/ShoMetrics.Source.Windows.ControlPanel.csproj` | `ShoMetrics.Source.Windows.ControlPanel` |
| Run service dev pipe | `dotnet watch --no-hot-reload --project ShoMetrics.Source.Windows.Service/ShoMetrics.Source.Windows.Service.csproj run -- --dev-pipe` | `ShoMetrics.Source.Windows.Service` |

Use `dotnet build ... -p:OutDir=C:\tmp\...` when the local Control Panel exe is
running and locking the default output directory.

Run the dev pipe from an elevated terminal when testing hardware-backed Windows
metrics. If the installed ShoMetrics Helper service is running, stop it before
starting the dev pipe; both hosts use the same local named pipe and the dev pipe
is the process the Hub should talk to during local iteration.

## Windows Installer

Use these from the repository root.

| Task | Command | Source of truth |
| --- | --- | --- |
| Installer invariants | `./packages/installer/windows/scripts/Test-WindowsInstallerInvariants.ps1` | `packages/installer/windows/scripts/Test-WindowsInstallerInvariants.ps1` |
| Standalone installer | `./packages/installer/windows/Build-WindowsInstaller.ps1 -Configuration Release -RuntimeIdentifier win-x64 -ShoMetricsVersionPrefix 0.1.0` | `packages/installer/windows/Build-WindowsInstaller.ps1` |
| Framework-dependent installer | `./packages/installer/windows/Build-WindowsInstaller.ps1 -Configuration Release -RuntimeIdentifier win-x64 -ShoMetricsVersionPrefix 0.1.0 -Distribution FrameworkDependent` | `packages/installer/windows/Build-WindowsInstaller.ps1` |

Pass `-PawnIoSetupPath` only when intentionally testing a local PawnIO setup
payload. The normal build script downloads and verifies the pinned official
PawnIO setup.

## Website / Appcast

Use the GitHub Actions workflows as the release-grade source of truth.

| Task | Command | Source of truth |
| --- | --- | --- |
| Local live preview (edit + auto-reload) | `hugo server --source site --disableFastRender` | `site/AGENTS.md` |
| Site preview in CI | `Site Preview` workflow | `.github/workflows/site-preview.yml` |
| Publish site/appcast | `Publish ShoMetrics site` workflow | `.github/workflows/site-publish.yml` |
| Local build + smoke | `hugo --source site --destination public --minify` then `./.github/scripts/Test-SitePreview.ps1 -PublicRoot site/public` | `.github/scripts/Test-SitePreview.ps1` |

Run all commands from the repository root (`--source site` points Hugo at the
site subtree). Live preview serves from memory at `http://localhost:1313/` and
reloads on save; it does not write `site/public/`. Use the build + smoke row to
verify the final generated output.

## Docs

Use these from the repository root.

| Task | Command | Source of truth |
| --- | --- | --- |
| Command playbook lint | `npm.cmd --prefix .github/scripts run check-command-playbook` | `.github/scripts/test-command-playbook.ts` |
| Release plan lint | `npm.cmd --prefix .github/scripts run check-release-plan` | `.github/scripts/read-release-plan.mjs` |

The repository lint checks that this playbook still points at stable command entry
points and package script names. It does not run the expensive build or release
commands.

## Release

Use the GitHub Actions workflows as the release-grade source of truth. CI
artifacts are for validation only; production artifacts come from the manual
Release workflow.

| Task | Command | Source of truth |
| --- | --- | --- |
| CI Stream Deck plugin package | `Hub CI` workflow | `.github/workflows/hub-ci.yml` |
| CI Windows helper installers | `Windows Source CI` workflow | `.github/workflows/source-windows-ci.yml` |
| Production release dry run | `Release` workflow, run manually with `tag` and `dry_run=true` | `.github/workflows/release.yml` |
| Production release | `Release` workflow, run manually with `tag` and `dry_run=false` | `.github/workflows/release.yml` |
| Regenerate source-windows third-party notices | `node scripts/generate-third-party-notices.mjs --target source-windows` | `scripts/generate-third-party-notices.mjs` |

The Release workflow creates the requested tag, creates a GitHub Release,
uploads the selected product artifacts, and uploads `checksums.txt`.
Releases that include only one product are created with `--latest=false` so the
website's GitHub `latest` download links continue to point at the latest
combined release.

`.github/release-plan.yml` must contain the requested tag and the product
versions to publish. `CHANGELOG.md` must contain a non-empty `## <tag>` section
before the Release workflow runs. The workflow adds a short product/version
summary before that section and publishes the combined text as the GitHub
Release notes.

When NuGet dependencies, Windows runtime dependencies, installer payloads, or
published `.deps.json` files change, regenerate
`packages/source-windows/THIRD_PARTY_NOTICES.md` after building both Windows
installer distributions. The source-windows third-party notice generator reads
the full release dependency matrix for framework-dependent and standalone
payloads, so CI runs the matching `--check` after both installer builds and
fails if the tracked license notice is stale.

Before any production release, complete:

```text
docs/release/manual-verification-checklist.md
```

The checklist owns human verification for real hardware, installer behavior,
Control Panel behavior, site/download pages, and appcast behavior.
