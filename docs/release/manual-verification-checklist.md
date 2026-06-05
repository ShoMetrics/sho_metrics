# Manual Release Verification Checklist

Use this checklist before a production release. Record the release build details below and
attach notes for every failed or skipped item.

## Release Build

- [ ] Version:
- [ ] Commit:
- [ ] Build artifact:
- [ ] Tester:
- [ ] Date:
- [ ] Windows test machine:
- [ ] Stream Deck device:

## CI Gates

- [ ] Hub CI passed: proto lint/build, lint, unit tests with coverage, PI DOM tests, build.
- [ ] Hub visual snapshots passed without updating snapshots in the release PR.
- [ ] Windows unit CI passed with coverage artifact uploaded.
- [ ] Windows helper integration smoke passed with diagnostics artifact uploaded.
- [ ] Site preview built and site smoke checks passed.
- [ ] Command playbook was reviewed if build, release, generated-asset, or verification commands changed.

## Install And Startup

- [ ] Inno installer starts without minute-level UI freeze on the Windows test machine.
- [ ] Installer opens on the ShoMetrics disclaimer/license page before Optional Driver.
- [ ] Clean install succeeds on Windows 11.
- [ ] Clean install succeeds on one additional supported Windows version, if available.
- [ ] Finish page can open ShoMetrics Control Panel as the logged-in user when the option is checked.
- [ ] Start Menu contains ShoMetrics Helper and ShoMetrics Logs shortcuts.
- [ ] Stream Deck app starts with the Sho Metrics plugin loaded.
- [ ] Property Inspector opens for every action.
- [ ] First render appears on a physical key.
- [ ] Settings save, close, reopen, and load the saved values.
- [ ] Stream Deck restart keeps existing action settings.

## Helper And Driver States

- [ ] Helper not installed shows the expected install guidance.
- [ ] Helper stopped shows recovery guidance without breaking rendering.
- [ ] Helper running reports version, protocol, descriptor count, and status.
- [ ] Helper protocol mismatch shows bounded recovery guidance.
- [ ] Helper unavailable shows bounded recovery guidance.
- [ ] Helper install, start, restart, upgrade, and uninstall paths were exercised.
- [ ] Installer verifies that the helper service reaches Running after service start.
- [ ] Existing helper service is stopped and replaced before files are overwritten.
- [ ] Setup shows the Inno close-applications page while ShoMetrics Helper is still running.
- [ ] Uninstall refuses to continue while ShoMetrics Helper is still running.
- [ ] If the existing helper service cannot stop, setup aborts before file replacement and gives restart/retry guidance.
- [ ] PawnIO not installed is reported correctly in Control Panel.
- [ ] PawnIO not installed shows an enabled, default-checked installer option with default-declined PawnIO notice.
- [ ] PawnIO not installed allows Next after accepting the PawnIO notice or after unchecking PawnIO.
- [ ] PawnIO installed shows a disabled installer option, a pawnio.eu link, and does not run bundled PawnIO setup.
- [ ] PawnIO install failure is visible to the user and includes the exit code when available.
- [ ] Uninstall does not remove PawnIO; release docs explain manual PawnIO removal from Windows Installed Apps.
- [ ] PawnIO not elevated or unusable is reported correctly in Control Panel.
- [ ] PawnIO OK state is reported correctly in Control Panel.

## Control Panel

- [ ] Control Panel opens from the installed build and from the installer finish page.
- [ ] Open logs action opens `%ProgramData%\ShoMetrics\logs`.
- [ ] Control Panel startup failures show a minimal dialog that points to the local startup log.
- [ ] Copy diagnostics includes bounded support text.
- [ ] Diagnostics text includes helper version, protocol, descriptor count, service state, and driver state.
- [ ] Diagnostics text does not include unbounded raw sensor dumps.

## Metrics

- [ ] CPU built-in widgets display meaningful values or correct unavailable notices.
- [ ] GPU built-in widgets display meaningful values or correct unavailable notices.
- [ ] RAM built-in widgets display meaningful values or correct unavailable notices.
- [ ] Disk built-in widgets display meaningful values or correct unavailable notices.
- [ ] Network built-in widgets display meaningful values or correct unavailable notices.
- [ ] One Advanced Sensor selection survives a Stream Deck restart.
- [ ] Pending refresh transitions to a value after helper warmup.
- [ ] Retained values do not create misleading history spikes.
- [ ] Built-in Node sources are used when helper-backed data is unavailable and fallback is allowed.
- [ ] 16-32 visible keys run for several minutes without runaway CPU, memory growth, or log spam.

## Non-Windows Behavior

- [ ] Windows-only helper readings are hidden or blocked on macOS/non-Windows.
- [ ] Built-in CPU, memory, disk, and network metrics still work on macOS/non-Windows where supported.

## Site And Docs

- [ ] Install page matches the current installer and plugin package behavior.
- [ ] Download page points to the current approved artifacts or release location.
- [ ] Troubleshooting page matches current logs, helper states, and recovery actions.
- [ ] Helper FAQ accurately describes PawnIO, helper optionality, and Windows-only behavior.
- [ ] Color Compensation tutorial matches the current Property Inspector flow.
