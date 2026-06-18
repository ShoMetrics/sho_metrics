# Contributing

Keep contributions small, focused, and reviewable. Explain the reason for the change, not just the files that changed.

Start with the [command playbook](docs/development/command-playbook.md) before running setup, build, test, or packaging commands.

## Project rules

Read [AGENTS.md](AGENTS.md) before changing code. It contains project rules for humans and AI tools, including workflow expectations and coding standards.

For coding style and architecture-sensitive changes, also check the relevant files under [.agents/skills](.agents/skills). These skill files document the project's preferred style, boundaries, naming, TypeScript rules, C# rules, proto rules, and other domain-specific conventions.

## Before opening a PR

- Review your own full diff.
- Keep unrelated refactors out of the PR.
- Use the command playbook to choose the verification commands that match the changed code.
- Explain any skipped verification in the PR.

For hub TypeScript work, run verification from `packages/hub`. Common commands include:

```powershell
npm run build
npm run test:unit
npm run proto:lint
```

Use the command form that works for your shell. The repository playbook lists the supported entry points.

For Windows Source .NET work, run verification from `packages/source-windows`. Common commands include:

```powershell
./scripts/Test-SourceWindowsLint.ps1
dotnet test ShoMetrics.Source.Windows.UnitTests.slnx --configuration Release --no-restore
```

## AI-assisted contributions

AI-assisted contributions are allowed, but the human contributor owns the final change.

If you used AI assistance:

- Manually review the full diff.
- Confirm the tool could read `AGENTS.md` and `.agents/skills/`.

Do not submit code you do not understand. Be ready to explain the change, the trade-offs, and any reviewer feedback in your own words.
