[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",

    [ValidateNotNullOrEmpty()]
    [string] $RuntimeIdentifier = "win-x64",

    [ValidateNotNullOrEmpty()]
    [string] $ShoMetricsVersionPrefix = "0.1.0",

    [ValidateNotNullOrEmpty()]
    [string] $PawnIoSetupPath = "",

    [ValidateNotNullOrEmpty()]
    [string] $OutputDirectory = ""
)

$ErrorActionPreference = "Stop"

$pawnIoVersion = "2.2.0"
$pawnIoSetupUri = "https://github.com/namazso/PawnIO.Setup/releases/download/$pawnIoVersion/PawnIO_setup.exe"
$pawnIoSetupSha256 = "1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032"

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")
$artifactRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts"))
$artifactRootWithSeparator = $artifactRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

function Resolve-UnderArtifactRoot {
    param(
        [Parameter(Mandatory)]
        [string] $Path
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($artifactRootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path must be under '$artifactRoot' so installer cleanup cannot remove arbitrary files: $fullPath"
    }

    return $fullPath
}

function Assert-FileSha256 {
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $ExpectedSha256
    )

    $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
        throw "SHA256 mismatch for '$Path'. Expected $ExpectedSha256 but got $actualSha256."
    }
}

function Save-PinnedPawnIoSetup {
    param(
        [Parameter(Mandatory)]
        [string] $DestinationPath
    )

    $destinationDirectory = Split-Path -Parent $DestinationPath
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null

    if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
        Assert-FileSha256 -Path $DestinationPath -ExpectedSha256 $pawnIoSetupSha256
        return
    }

    $temporaryPath = "$DestinationPath.download"
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }

    Write-Host "Downloading PawnIO setup $pawnIoVersion..."
    Write-Host "Source: $pawnIoSetupUri"
    Invoke-WebRequest -Uri $pawnIoSetupUri -OutFile $temporaryPath
    Assert-FileSha256 -Path $temporaryPath -ExpectedSha256 $pawnIoSetupSha256
    Move-Item -LiteralPath $temporaryPath -Destination $DestinationPath -Force
}

if ([string]::IsNullOrWhiteSpace($PawnIoSetupPath)) {
    $PawnIoSetupPath = Join-Path $artifactRoot "installer\windows\cache\pawnio\$pawnIoVersion\PawnIO_setup.exe"
    $PawnIoSetupPath = Resolve-UnderArtifactRoot -Path $PawnIoSetupPath
    Save-PinnedPawnIoSetup -DestinationPath $PawnIoSetupPath
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $artifactRoot "installer\windows\setup"
}

$pawnIoSetupFullPath = [System.IO.Path]::GetFullPath($PawnIoSetupPath)
if (-not (Test-Path -LiteralPath $pawnIoSetupFullPath -PathType Leaf)) {
    throw "PawnIO setup was not found: $pawnIoSetupFullPath"
}
Assert-FileSha256 -Path $pawnIoSetupFullPath -ExpectedSha256 $pawnIoSetupSha256

$outputFullPath = Resolve-UnderArtifactRoot -Path $OutputDirectory
$payloadRoot = Resolve-UnderArtifactRoot -Path (Join-Path $artifactRoot "installer\windows\payload")
$servicePayloadDirectory = Join-Path $payloadRoot "service"
$controlPanelPayloadDirectory = Join-Path $payloadRoot "control-panel"

if (Test-Path -LiteralPath $payloadRoot) {
    Remove-Item -LiteralPath $payloadRoot -Recurse -Force
}

if (Test-Path -LiteralPath $outputFullPath) {
    Remove-Item -LiteralPath $outputFullPath -Recurse -Force
}

New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputFullPath -Force | Out-Null

$publishServiceScript = Join-Path $repoRoot "packages\source-windows\scripts\Publish-WindowsService.ps1"
$publishControlPanelScript = Join-Path $repoRoot "packages\source-windows\scripts\Publish-WindowsControlPanel.ps1"

& $publishServiceScript `
    -Configuration $Configuration `
    -RuntimeIdentifier $RuntimeIdentifier `
    -OutputDirectory $servicePayloadDirectory `
    -ShoMetricsVersionPrefix $ShoMetricsVersionPrefix

& $publishControlPanelScript `
    -Configuration $Configuration `
    -RuntimeIdentifier $RuntimeIdentifier `
    -OutputDirectory $controlPanelPayloadDirectory `
    -ShoMetricsVersionPrefix $ShoMetricsVersionPrefix

$innoProjectPath = Join-Path $PSScriptRoot "inno\ShoMetrics.Installer.Windows.Inno.csproj"
$innoScriptPath = Join-Path $PSScriptRoot "inno\ShoMetricsHelperSetup.iss"
$innoSetupVersion = "6.7.3"

& dotnet restore $innoProjectPath /p:RestorePackagesWithLockFile=true /p:RestoreLockedMode=true
if ($LASTEXITCODE -ne 0) {
    throw "dotnet restore for Inno tool package failed with exit code $LASTEXITCODE."
}

$nuGetPackageRoot = $env:NUGET_PACKAGES
if ([string]::IsNullOrWhiteSpace($nuGetPackageRoot)) {
    $nuGetPackageRoot = Join-Path $env:USERPROFILE ".nuget\packages"
}

$innoPackageDirectory = Join-Path $nuGetPackageRoot "tools.innosetup\$innoSetupVersion"
$innoCompiler = Get-ChildItem -LiteralPath $innoPackageDirectory -Recurse -Filter ISCC.exe |
    Select-Object -First 1

if ($null -eq $innoCompiler) {
    throw "ISCC.exe was not found under '$innoPackageDirectory'."
}

$outputBaseFilename = "ShoMetrics-Helper-Setup-$ShoMetricsVersionPrefix-$RuntimeIdentifier"
$innoArguments = @(
    "/Qp",
    "/O$outputFullPath",
    "/F$outputBaseFilename",
    "/DShoMetricsVersion=$ShoMetricsVersionPrefix",
    "/DServicePayloadDir=$servicePayloadDirectory",
    "/DControlPanelPayloadDir=$controlPanelPayloadDirectory",
    "/DPawnIoSetupPath=$pawnIoSetupFullPath",
    $innoScriptPath
)

& $innoCompiler.FullName @innoArguments
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compile failed with exit code $LASTEXITCODE."
}

$setupPath = Join-Path $outputFullPath "$outputBaseFilename.exe"
if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
    throw "Expected installer was not produced: $setupPath"
}

Write-Host "Built ShoMetrics Helper installer."
Write-Host "Output: $setupPath"
Write-Host "Version: $ShoMetricsVersionPrefix"
Write-Host "RuntimeIdentifier: $RuntimeIdentifier"
