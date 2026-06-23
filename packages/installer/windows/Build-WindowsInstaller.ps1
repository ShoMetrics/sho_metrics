[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",

    [ValidateNotNullOrEmpty()]
    [string] $RuntimeIdentifier = "win-x64",

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $ShoMetricsVersionPrefix,

    [ValidateSet("Standalone", "FrameworkDependent")]
    [string] $Distribution = "Standalone",

    [ValidateNotNullOrEmpty()]
    [string] $PawnIoSetupPath = "",

    [ValidateNotNullOrEmpty()]
    [string] $OutputDirectory = ""
)

$ErrorActionPreference = "Stop"

$pawnIoVersion = "2.2.0"
$pawnIoSetupUri = "https://github.com/namazso/PawnIO.Setup/releases/download/$pawnIoVersion/PawnIO_setup.exe"
$pawnIoSetupSha256 = "1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032"
$aspNetCoreRuntimeVersion = "10.0.8"
$aspNetCoreRuntimeSetupUri = "https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/$aspNetCoreRuntimeVersion/aspnetcore-runtime-$aspNetCoreRuntimeVersion-win-x64.exe"
$aspNetCoreRuntimeSetupSha256 = "1c152d4a9138a92e2c04bea8ecc00e79ca8febfb7a9d5b6141f1546a076d11fd"
$isFrameworkDependentDistribution = $Distribution -eq "FrameworkDependent"
$distributionDirectoryName = switch ($Distribution) {
    "Standalone" { "standalone" }
    "FrameworkDependent" { "framework-dependent" }
}

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

function Assert-AuthenticodeSignatureValid {
    param(
        [Parameter(Mandatory)]
        [string] $Path
    )

    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne "Valid") {
        throw "Invalid Authenticode signature for '$Path'. Status: $($signature.Status)."
    }
}

function Save-PinnedDownload {
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [Parameter(Mandatory)]
        [string] $Uri,

        [Parameter(Mandatory)]
        [string] $DestinationPath,

        [Parameter(Mandatory)]
        [string] $ExpectedSha256
    )

    $destinationDirectory = Split-Path -Parent $DestinationPath
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null

    if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
        Assert-FileSha256 -Path $DestinationPath -ExpectedSha256 $ExpectedSha256
        return
    }

    $temporaryPath = "$DestinationPath.download"
    if (Test-Path -LiteralPath $temporaryPath) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }

    Write-Host "Downloading $Name..."
    Write-Host "Source: $Uri"
    Invoke-WebRequest -Uri $Uri -OutFile $temporaryPath
    Assert-FileSha256 -Path $temporaryPath -ExpectedSha256 $ExpectedSha256
    Move-Item -LiteralPath $temporaryPath -Destination $DestinationPath -Force
}

function Format-RuntimeVersionPrefix {
    param(
        [Parameter(Mandatory)]
        [string] $Version
    )

    $runtimeVersion = [System.Version]::Parse($Version)
    return "$($runtimeVersion.Major).$($runtimeVersion.Minor)."
}

function Read-ServiceRuntimeFrameworkRequirement {
    param(
        [Parameter(Mandatory)]
        [string] $ServicePayloadDirectory,

        [Parameter(Mandatory)]
        [string] $FrameworkName
    )

    $runtimeConfigPath = Join-Path $ServicePayloadDirectory "ShoMetricsHelperService.runtimeconfig.json"
    if (-not (Test-Path -LiteralPath $runtimeConfigPath -PathType Leaf)) {
        throw "Service runtime config was not found: $runtimeConfigPath"
    }

    $runtimeConfig = Get-Content -Encoding UTF8 -LiteralPath $runtimeConfigPath -Raw | ConvertFrom-Json
    $frameworks = @()

    if ($null -ne $runtimeConfig.runtimeOptions.framework) {
        $frameworks += $runtimeConfig.runtimeOptions.framework
    }

    if ($null -ne $runtimeConfig.runtimeOptions.frameworks) {
        $frameworks += @($runtimeConfig.runtimeOptions.frameworks)
    }

    $framework = $frameworks |
        Where-Object { $_.name -eq $FrameworkName -and -not [string]::IsNullOrWhiteSpace($_.version) } |
        Select-Object -First 1

    if ($null -eq $framework) {
        throw "Runtime requirement '$FrameworkName' was not found in '$runtimeConfigPath'."
    }

    return "$FrameworkName=$(Format-RuntimeVersionPrefix -Version $framework.version)"
}

if ([string]::IsNullOrWhiteSpace($PawnIoSetupPath)) {
    $PawnIoSetupPath = Join-Path $artifactRoot "installer\windows\cache\pawnio\$pawnIoVersion\PawnIO_setup.exe"
    $PawnIoSetupPath = Resolve-UnderArtifactRoot -Path $PawnIoSetupPath
    Save-PinnedDownload `
        -Name "PawnIO setup $pawnIoVersion" `
        -Uri $pawnIoSetupUri `
        -DestinationPath $PawnIoSetupPath `
        -ExpectedSha256 $pawnIoSetupSha256
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $artifactRoot "installer\windows\setup\$distributionDirectoryName"
}

$pawnIoSetupFullPath = [System.IO.Path]::GetFullPath($PawnIoSetupPath)
if (-not (Test-Path -LiteralPath $pawnIoSetupFullPath -PathType Leaf)) {
    throw "PawnIO setup was not found: $pawnIoSetupFullPath"
}
Assert-FileSha256 -Path $pawnIoSetupFullPath -ExpectedSha256 $pawnIoSetupSha256
Assert-AuthenticodeSignatureValid -Path $pawnIoSetupFullPath

$outputFullPath = Resolve-UnderArtifactRoot -Path $OutputDirectory
$distributionBuildRoot = Resolve-UnderArtifactRoot -Path (Join-Path $artifactRoot "installer\windows\build\$distributionDirectoryName")
$payloadRoot = Join-Path $distributionBuildRoot "payload"
$servicePayloadDirectory = Join-Path $payloadRoot "service"
$controlPanelPayloadDirectory = Join-Path $payloadRoot "control-panel"
$aspNetCoreRuntimeSetupFullPath = ""
$distributionSuffix = if ($isFrameworkDependentDistribution) { "-framework-dependent" } else { "" }
$outputBaseFilename = "ShoMetrics-Helper-Setup-$ShoMetricsVersionPrefix-$RuntimeIdentifier$distributionSuffix"
$setupPath = Join-Path $outputFullPath "$outputBaseFilename.exe"

if (Test-Path -LiteralPath $payloadRoot) {
    Remove-Item -LiteralPath $payloadRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
New-Item -ItemType Directory -Path $outputFullPath -Force | Out-Null

if (Test-Path -LiteralPath $setupPath) {
    Remove-Item -LiteralPath $setupPath -Force
}

$publishServiceScript = Join-Path $repoRoot "packages\source-windows\scripts\Publish-WindowsService.ps1"
$publishControlPanelScript = Join-Path $repoRoot "packages\source-windows\scripts\Publish-WindowsControlPanel.ps1"

& $publishServiceScript `
    -Configuration $Configuration `
    -RuntimeIdentifier $RuntimeIdentifier `
    -OutputDirectory $servicePayloadDirectory `
    -ShoMetricsVersionPrefix $ShoMetricsVersionPrefix `
    -SelfContained:(-not $isFrameworkDependentDistribution)

& $publishControlPanelScript `
    -Configuration $Configuration `
    -RuntimeIdentifier $RuntimeIdentifier `
    -OutputDirectory $controlPanelPayloadDirectory `
    -ShoMetricsVersionPrefix $ShoMetricsVersionPrefix `
    -SelfContained:(-not $isFrameworkDependentDistribution) `
    -WindowsAppSDKSelfContained:(-not $isFrameworkDependentDistribution)

$serviceDepsJsonPath = @(
    (Join-Path $servicePayloadDirectory "ShoMetricsHelperService.deps.json"),
    (Join-Path $servicePayloadDirectory "ShoMetrics.Source.Windows.Service.deps.json")
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($serviceDepsJsonPath)) {
    throw "Service dependency manifest was not found in '$servicePayloadDirectory'."
}

$controlPanelDepsJsonPath = @(
    (Join-Path $controlPanelPayloadDirectory "ShoMetricsHelper.deps.json"),
    (Join-Path $controlPanelPayloadDirectory "ShoMetrics.Source.Windows.ControlPanel.deps.json")
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($controlPanelDepsJsonPath)) {
    throw "Control Panel dependency manifest was not found in '$controlPanelPayloadDirectory'."
}

$thirdPartyNoticeScriptPath = Join-Path $repoRoot "scripts\generate-third-party-notices.mjs"
& node $thirdPartyNoticeScriptPath `
    --target source-windows `
    --source-windows-deps-json $serviceDepsJsonPath `
    --source-windows-deps-json $controlPanelDepsJsonPath

if ($LASTEXITCODE -ne 0) {
    throw "third-party notices generation failed with exit code $LASTEXITCODE."
}

$sourceWindowsNoticePath = Join-Path $repoRoot "packages\source-windows\THIRD_PARTY_NOTICES.md"
Copy-Item -LiteralPath $sourceWindowsNoticePath -Destination (Join-Path $servicePayloadDirectory "THIRD_PARTY_NOTICES.md") -Force
Copy-Item -LiteralPath $sourceWindowsNoticePath -Destination (Join-Path $controlPanelPayloadDirectory "THIRD_PARTY_NOTICES.md") -Force

$serviceBaseRuntimeRequirement = ""
if ($isFrameworkDependentDistribution) {
    $serviceBaseRuntimeRequirement = Read-ServiceRuntimeFrameworkRequirement `
        -ServicePayloadDirectory $servicePayloadDirectory `
        -FrameworkName "Microsoft.NETCore.App"

    $aspNetCoreRuntimeSetupFullPath = Resolve-UnderArtifactRoot -Path (
        Join-Path $artifactRoot "installer\windows\cache\aspnetcore-runtime\$aspNetCoreRuntimeVersion\aspnetcore-runtime-$aspNetCoreRuntimeVersion-win-x64.exe")
    Save-PinnedDownload `
        -Name "ASP.NET Core Runtime $aspNetCoreRuntimeVersion" `
        -Uri $aspNetCoreRuntimeSetupUri `
        -DestinationPath $aspNetCoreRuntimeSetupFullPath `
        -ExpectedSha256 $aspNetCoreRuntimeSetupSha256
    Assert-AuthenticodeSignatureValid -Path $aspNetCoreRuntimeSetupFullPath
}

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

$innoArguments = @(
    "/Qp",
    "/O$outputFullPath",
    "/F$outputBaseFilename",
    "/DShoMetricsVersion=$ShoMetricsVersionPrefix",
    "/DServicePayloadDir=$servicePayloadDirectory",
    "/DControlPanelPayloadDir=$controlPanelPayloadDirectory",
    "/DPawnIoSetupPath=$pawnIoSetupFullPath",
    "/DAspNetCoreRuntimeVersion=$aspNetCoreRuntimeVersion",
    $innoScriptPath
)

if ($isFrameworkDependentDistribution) {
    $innoArguments = @(
        $innoArguments[0..($innoArguments.Count - 2)] +
        "/DShoMetricsFrameworkDependentDistribution=1" +
        "/DServiceBaseRuntimeRequirement=$serviceBaseRuntimeRequirement" +
        "/DAspNetCoreRuntimeSetupPath=$aspNetCoreRuntimeSetupFullPath" +
        $innoArguments[-1]
    )
}

& $innoCompiler.FullName @innoArguments
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compile failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $setupPath -PathType Leaf)) {
    throw "Expected installer was not produced: $setupPath"
}

Write-Host "Built ShoMetrics Helper installer."
Write-Host "Output: $setupPath"
Write-Host "Version: $ShoMetricsVersionPrefix"
Write-Host "RuntimeIdentifier: $RuntimeIdentifier"
Write-Host "Distribution: $Distribution"
if ($isFrameworkDependentDistribution) {
    Write-Host "ServiceBaseRuntimeRequirement: $serviceBaseRuntimeRequirement"
    Write-Host "AspNetCoreRuntimeSetupPath: $aspNetCoreRuntimeSetupFullPath"
}
