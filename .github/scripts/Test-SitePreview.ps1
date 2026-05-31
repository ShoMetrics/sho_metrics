param(
    [Parameter(Mandatory = $true)]
    [string]$PublicRoot
)

$ErrorActionPreference = "Stop"

function Resolve-InternalSiteLink {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PublicRoot,
        [Parameter(Mandatory = $true)]
        [Uri]$SourceUri,
        [Parameter(Mandatory = $true)]
        [string]$Link,
        [Parameter(Mandatory = $true)]
        [System.Collections.Generic.HashSet[string]]$SkippedSchemes
    )

    if ([string]::IsNullOrWhiteSpace($Link) -or $Link.StartsWith("#", [StringComparison]::Ordinal) -or $Link.StartsWith("//", [StringComparison]::Ordinal)) {
        return $null
    }

    $linkUri = [Uri]::new($SourceUri, $Link)
    if ($SkippedSchemes.Contains($linkUri.Scheme)) {
        return $null
    }

    $pathText = [Uri]::UnescapeDataString($linkUri.AbsolutePath)
    if ([string]::IsNullOrWhiteSpace($pathText) -or $pathText -eq "/") {
        return Join-Path -Path $PublicRoot -ChildPath "index.html"
    }

    $cleanPath = $pathText.TrimStart("/")
    $candidatePath = Join-Path -Path $PublicRoot -ChildPath $cleanPath
    if ($pathText.EndsWith("/", [StringComparison]::Ordinal) -or [string]::IsNullOrEmpty([IO.Path]::GetExtension($candidatePath))) {
        return Join-Path -Path $candidatePath -ChildPath "index.html"
    }

    return $candidatePath
}

function Get-RelativePathText {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootPath,
        [Parameter(Mandatory = $true)]
        [string]$TargetPath
    )

    $normalizedRootPath = [IO.Path]::GetFullPath($RootPath).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $rootUri = [Uri]::new($normalizedRootPath + [IO.Path]::DirectorySeparatorChar)
    $targetUri = [Uri]::new([IO.Path]::GetFullPath($TargetPath))

    return [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($targetUri).ToString()).Replace("\", "/")
}

$resolvedPublicRoot = (Resolve-Path -LiteralPath $PublicRoot).Path
$requiredPages = @(
    @{ Path = "index.html"; Terms = @("Sho Metrics") },
    @{ Path = "install/index.html"; Terms = @("Install The Plugin", "Install The Helper", "Add A Metric") },
    @{ Path = "download/index.html"; Terms = @("Helper", "Plugin") },
    @{ Path = "troubleshooting/index.html"; Terms = @("Actions Do Not Appear", "Metrics Do Not Update") },
    @{ Path = "faq/helper/index.html"; Terms = @("Windows-only", "PawnIO", "LibreHardwareMonitor") },
    @{ Path = "tutorials/color-compensation/index.html"; Terms = @("Color Compensation", "Stream Deck key", "Overall Brightness") }
)
$skippedSchemes = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
@("data", "http", "https", "javascript", "mailto", "tel") | ForEach-Object { [void]$skippedSchemes.Add($_) }
$failures = [System.Collections.Generic.List[string]]::new()

foreach ($requiredPage in $requiredPages) {
    $pagePath = Join-Path -Path $resolvedPublicRoot -ChildPath $requiredPage.Path
    if (-not (Test-Path -LiteralPath $pagePath -PathType Leaf)) {
        $failures.Add("missing required page $($requiredPage.Path)")
        continue
    }

    $pageText = Get-Content -Encoding UTF8 -LiteralPath $pagePath -Raw
    foreach ($requiredTerm in $requiredPage.Terms) {
        if ($pageText.IndexOf($requiredTerm, [StringComparison]::Ordinal) -lt 0) {
            $failures.Add("$($requiredPage.Path) is missing required text: $requiredTerm")
        }
    }
}

$htmlFiles = Get-ChildItem -LiteralPath $resolvedPublicRoot -Recurse -Filter *.html -File
foreach ($htmlFile in $htmlFiles) {
    $htmlText = Get-Content -Encoding UTF8 -LiteralPath $htmlFile.FullName -Raw
    $relativeSourcePath = Get-RelativePathText -RootPath $resolvedPublicRoot -TargetPath $htmlFile.FullName
    $sourceUri = [Uri]::new("https://sho-metrics.local/$relativeSourcePath")

    foreach ($match in [regex]::Matches($htmlText, "\s(?:href|src)=[""']([^""']+)[""']", "IgnoreCase")) {
        $link = $match.Groups[1].Value
        $targetPath = Resolve-InternalSiteLink -PublicRoot $resolvedPublicRoot -SourceUri $sourceUri -Link $link -SkippedSchemes $skippedSchemes

        if ($null -eq $targetPath) {
            continue
        }

        if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
            $relativeTargetPath = Get-RelativePathText -RootPath $resolvedPublicRoot -TargetPath $targetPath
            $failures.Add("$relativeSourcePath links to missing $relativeTargetPath")
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Host "Site smoke failed:"
    foreach ($failure in $failures) {
        Write-Host "- $failure"
    }
    exit 1
}

Write-Host "Site smoke passed: $($requiredPages.Count) required pages and internal links checked."
