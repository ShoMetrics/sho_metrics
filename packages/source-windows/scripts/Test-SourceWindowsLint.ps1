$ErrorActionPreference = "Stop"

function Invoke-LintCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Command,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

Invoke-LintCommand dotnet restore ShoMetrics.Source.Windows.slnx
Invoke-LintCommand dotnet format ShoMetrics.Source.Windows.slnx style --verify-no-changes --no-restore --verbosity minimal
Invoke-LintCommand dotnet format ShoMetrics.Source.Windows.slnx analyzers --verify-no-changes --no-restore --verbosity minimal
Invoke-LintCommand dotnet build ShoMetrics.Source.Windows.slnx --configuration Release --no-restore -warnaserror
