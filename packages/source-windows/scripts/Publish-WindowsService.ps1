[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string] $Configuration = "Release",

    [ValidateNotNullOrEmpty()]
    [string] $RuntimeIdentifier = "win-x64",

    [ValidateNotNullOrEmpty()]
    [string] $OutputDirectory,

    [switch] $CreateZip
)

$ErrorActionPreference = "Stop"

$sourceRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..\..")
$artifactRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts"))

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $artifactRoot "source-windows\service\$RuntimeIdentifier"
}

$outputFullPath = [System.IO.Path]::GetFullPath($OutputDirectory)
$artifactRootWithSeparator = $artifactRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not $outputFullPath.StartsWith($artifactRootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must be under '$artifactRoot' so publish cleanup cannot remove arbitrary files."
}

$projectPath = Join-Path $sourceRoot "ShoMetrics.Source.Windows.Service\ShoMetrics.Source.Windows.Service.csproj"

if (Test-Path -LiteralPath $outputFullPath) {
    Remove-Item -LiteralPath $outputFullPath -Recurse -Force
}

New-Item -ItemType Directory -Path $outputFullPath -Force | Out-Null

& dotnet publish `
    $projectPath `
    -c $Configuration `
    -r $RuntimeIdentifier `
    --self-contained true `
    -o $outputFullPath `
    /p:PublishSingleFile=false `
    /p:PublishTrimmed=false

if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE."
}

$publishedFiles = @(Get-ChildItem -LiteralPath $outputFullPath -Recurse -File)
$directoryBytes = ($publishedFiles | Measure-Object -Property Length -Sum).Sum
if ($null -eq $directoryBytes) {
    $directoryBytes = 0
}

function Format-ByteSize {
    param([double] $ByteCount)

    if ($ByteCount -ge 1GB) {
        return "{0:N2} GiB" -f ($ByteCount / 1GB)
    }

    if ($ByteCount -ge 1MB) {
        return "{0:N2} MiB" -f ($ByteCount / 1MB)
    }

    if ($ByteCount -ge 1KB) {
        return "{0:N2} KiB" -f ($ByteCount / 1KB)
    }

    return "{0:N0} B" -f $ByteCount
}

Write-Host "Published ShoMetrics Windows service."
Write-Host "Project: $projectPath"
Write-Host "Output: $outputFullPath"
Write-Host "Configuration: $Configuration"
Write-Host "RuntimeIdentifier: $RuntimeIdentifier"
Write-Host "Self-contained: true"
Write-Host "PublishTrimmed: false"
Write-Host "Directory size: $(Format-ByteSize $directoryBytes)"

if ($publishedFiles.Count -gt 0) {
    Write-Host "Largest files:"
    $publishedFiles |
        Sort-Object -Property Length -Descending |
        Select-Object -First 12 |
        ForEach-Object {
            $relativePath = $_.FullName.Substring($outputFullPath.Length).TrimStart(
                [System.IO.Path]::DirectorySeparatorChar,
                [System.IO.Path]::AltDirectorySeparatorChar)
            Write-Host ("  {0,10}  {1}" -f (Format-ByteSize $_.Length), $relativePath)
        }
}

if ($CreateZip) {
    $zipPath = "$outputFullPath.zip"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    Compress-Archive -Path (Join-Path $outputFullPath "*") -DestinationPath $zipPath -Force
    $zipItem = Get-Item -LiteralPath $zipPath
    Write-Host "ZIP size: $(Format-ByteSize $zipItem.Length)"
    Write-Host "ZIP path: $zipPath"
}
