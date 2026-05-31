[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",

    [ValidateNotNullOrEmpty()]
    [string] $RuntimeIdentifier = "win-x64",

    [ValidateNotNullOrEmpty()]
    [string] $ShoMetricsVersionPrefix
)

$ErrorActionPreference = "Stop"

$installerRoot = Resolve-Path -LiteralPath $PSScriptRoot
$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")
$artifactRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts"))
$payloadRoot = [System.IO.Path]::GetFullPath((Join-Path $artifactRoot "installer\windows\payload"))
$msiOutputRoot = [System.IO.Path]::GetFullPath((Join-Path $artifactRoot "installer\windows\msi"))
$artifactRootWithSeparator = $artifactRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

function Assert-UnderArtifactRoot {
    param([Parameter(Mandatory = $true)][string] $Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($artifactRootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$fullPath' must be under '$artifactRoot' so installer cleanup cannot remove arbitrary files."
    }
}

Assert-UnderArtifactRoot $payloadRoot
Assert-UnderArtifactRoot $msiOutputRoot

foreach ($directory in @($payloadRoot, $msiOutputRoot)) {
    if (Test-Path -LiteralPath $directory) {
        Remove-Item -LiteralPath $directory -Recurse -Force
    }

    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$sourceWindowsRoot = Join-Path $repoRoot "packages\source-windows"
$serviceOutput = Join-Path $payloadRoot "service"
$controlPanelOutput = Join-Path $payloadRoot "control-panel"
$servicePublishScript = Join-Path $sourceWindowsRoot "scripts\Publish-WindowsService.ps1"
$controlPanelPublishScript = Join-Path $sourceWindowsRoot "scripts\Publish-WindowsControlPanel.ps1"

$publishArguments = @{
    Configuration = $Configuration
    RuntimeIdentifier = $RuntimeIdentifier
}

if (-not [string]::IsNullOrWhiteSpace($ShoMetricsVersionPrefix)) {
    $publishArguments["ShoMetricsVersionPrefix"] = $ShoMetricsVersionPrefix
}

& $servicePublishScript @publishArguments -OutputDirectory $serviceOutput
& $controlPanelPublishScript @publishArguments -OutputDirectory $controlPanelOutput

$serviceExePath = Join-Path $serviceOutput "ShoMetrics.Source.Windows.Service.exe"
$controlPanelExePath = Join-Path $controlPanelOutput "ShoMetrics.Source.Windows.ControlPanel.exe"

if (-not (Test-Path -LiteralPath $serviceExePath)) {
    throw "Expected service payload was not published: $serviceExePath"
}

if (-not (Test-Path -LiteralPath $controlPanelExePath)) {
    throw "Expected Control Panel payload was not published: $controlPanelExePath"
}

$installerProjectPath = Join-Path $installerRoot "ShoMetrics.Installer.Windows.wixproj"
$msiOutputWithSeparator = $msiOutputRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$buildArguments = @(
    "build",
    $installerProjectPath,
    "-c",
    $Configuration,
    "/p:RuntimeIdentifier=$RuntimeIdentifier",
    "/p:InstallerPayloadDir=$payloadRoot",
    "/p:OutputPath=$msiOutputWithSeparator"
)

if (-not [string]::IsNullOrWhiteSpace($ShoMetricsVersionPrefix)) {
    $buildArguments += "/p:ShoMetricsVersionPrefix=$ShoMetricsVersionPrefix"
}

& dotnet @buildArguments
if ($LASTEXITCODE -ne 0) {
    throw "dotnet build failed with exit code $LASTEXITCODE."
}

$msiFiles = @(Get-ChildItem -LiteralPath $msiOutputRoot -Filter "*.msi" -File)
if ($msiFiles.Count -eq 0) {
    throw "Installer build completed but no MSI was found in '$msiOutputRoot'."
}

Write-Host "Built ShoMetrics Windows installer."
$msiFiles | ForEach-Object {
    Write-Host "MSI: $($_.FullName)"
}
