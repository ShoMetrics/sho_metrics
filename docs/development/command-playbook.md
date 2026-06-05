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
| Unit tests | `npm.cmd run test:unit` | `packages/hub/package.json` |
| Property Inspector DOM tests | `npm.cmd run test:pi` | `packages/hub/package.json` |
| Lint | `npm.cmd run lint` | `packages/hub/package.json` |
| Stream Deck dev watch | `npm.cmd run watch` | `packages/hub/package.json` |
| Restart linked plugin | `npx.cmd streamdeck restart com.ez.sho-metrics` | Elgato Stream Deck CLI |

Do not run visual tests as a default gate. Use `npm.cmd run test:visual` only
when changing widget visuals, SVG/raster output, or Property Inspector UI.

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
| Site preview in CI | `Site Preview` workflow | `.github/workflows/site-preview.yml` |
| Publish site/appcast | `Publish ShoMetrics site` workflow | `.github/workflows/site-publish.yml` |
| Local site smoke after Hugo build | `./.github/scripts/Test-SitePreview.ps1 -PublicRoot site/public` | `.github/scripts/Test-SitePreview.ps1` |

For local preview, run Hugo from `site` if Hugo is installed:

```powershell
hugo --destination public --minify --printPathWarnings
```

Then run the site smoke command from the repository root.

## Docs

Use these from the repository root.

| Task | Command | Source of truth |
| --- | --- | --- |
| Command playbook lint | `npm.cmd --prefix .github/scripts run check-command-playbook` | `.github/scripts/test-command-playbook.ts` |

The repository lint checks that this playbook still points at stable command entry
points and package script names. It does not run the expensive build or release
commands.

## Release

The release workflow is still a P0 todo. Until it exists, do not treat locally
built installers as production release artifacts.

Before any production release, complete:

```text
docs/release/manual-verification-checklist.md
```

The checklist owns human verification for real hardware, installer behavior,
Control Panel behavior, site/download pages, and appcast behavior.
