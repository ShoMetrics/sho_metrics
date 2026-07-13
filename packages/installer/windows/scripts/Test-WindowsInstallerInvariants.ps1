[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$installerRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$innoRoot = Join-Path $installerRoot "inno"
$mainScriptPath = Join-Path $innoRoot "ShoMetricsHelperSetup.iss"
$buildScriptPath = Join-Path $installerRoot "Build-WindowsInstaller.ps1"
$innoProjectPath = Join-Path $innoRoot "ShoMetrics.Installer.Windows.Inno.csproj"
$repoRoot = Resolve-Path -LiteralPath (Join-Path $installerRoot "..\..\..")
$serviceConstantsPath = Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.Contracts\WindowsSourceServiceConstants.cs"
$serviceProgramPath = Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.Service\Program.cs"
$serviceStartCommandPath = Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.Service\WindowsServiceStartCommand.cs"
$controlPanelMainWindowXamlPath = Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.ControlPanel\MainWindow.xaml"
$controlPanelMainWindowCodePath = Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.ControlPanel\MainWindow.xaml.cs"
$brandAssetsScriptPath = Join-Path $repoRoot "packages\assets\brand\sync-brand-assets.ts"
$launcherPath = Join-Path $repoRoot "packages\hub\src\runtime\sources\windows-helper\windows-helper-control-panel.ts"
$helperUpdateFeedPath = Join-Path $repoRoot "packages\hub\src\runtime\helper-update\helper-update-feed.ts"
$helperUpdateRolloutPath = Join-Path $repoRoot "packages\hub\src\runtime\helper-update\phased-rollout.ts"
$updateAppcastClientPath = Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.ControlPanel\UpdateAppcastClient.cs"
$updatePhasedRolloutPath = Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.ControlPanel\UpdatePhasedRollout.cs"

$scriptFiles = @(
    $mainScriptPath
    Get-ChildItem -LiteralPath (Join-Path $innoRoot "code") -Filter "*.iss" -File |
        Sort-Object Name |
        Select-Object -ExpandProperty FullName
)

$scriptText = ($scriptFiles | ForEach-Object {
    Get-Content -Encoding UTF8 -LiteralPath $_ -Raw
}) -join "`n"
$mainScriptText = Get-Content -Encoding UTF8 -LiteralPath $mainScriptPath -Raw
$buildScriptText = Get-Content -Encoding UTF8 -LiteralPath $buildScriptPath -Raw
$publishControlPanelScriptText = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $repoRoot "packages\source-windows\scripts\Publish-WindowsControlPanel.ps1") -Raw
$publishServiceScriptText = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $repoRoot "packages\source-windows\scripts\Publish-WindowsService.ps1") -Raw
$controlPanelProjectText = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.ControlPanel\ShoMetrics.Source.Windows.ControlPanel.csproj") -Raw
$serviceProjectText = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $repoRoot "packages\source-windows\ShoMetrics.Source.Windows.Service\ShoMetrics.Source.Windows.Service.csproj") -Raw
$innoProjectText = Get-Content -Encoding UTF8 -LiteralPath $innoProjectPath -Raw
$serviceConstantsText = Get-Content -Encoding UTF8 -LiteralPath $serviceConstantsPath -Raw
$launcherText = Get-Content -Encoding UTF8 -LiteralPath $launcherPath -Raw
$helperUpdateFeedText = Get-Content -Encoding UTF8 -LiteralPath $helperUpdateFeedPath -Raw
$helperUpdateRolloutText = Get-Content -Encoding UTF8 -LiteralPath $helperUpdateRolloutPath -Raw
$updateAppcastClientText = Get-Content -Encoding UTF8 -LiteralPath $updateAppcastClientPath -Raw
$updatePhasedRolloutText = Get-Content -Encoding UTF8 -LiteralPath $updatePhasedRolloutPath -Raw
$serviceProgramText = Get-Content -Encoding UTF8 -LiteralPath $serviceProgramPath -Raw
$serviceStartCommandText = Get-Content -Encoding UTF8 -LiteralPath $serviceStartCommandPath -Raw
$controlPanelMainWindowCodeText = (Get-ChildItem -LiteralPath (Split-Path -Parent $controlPanelMainWindowCodePath) -Filter "MainWindow*.cs" -File |
    Sort-Object Name |
    ForEach-Object {
        Get-Content -Encoding UTF8 -LiteralPath $_.FullName -Raw
    }) -join "`n"
$controlPanelMainWindowText = (Get-Content -Encoding UTF8 -LiteralPath $controlPanelMainWindowXamlPath -Raw) + "`n" + $controlPanelMainWindowCodeText
$ciWorkflowText = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $repoRoot ".github\workflows\source-windows-ci.yml") -Raw
$setupAppIdGuid = [regex]::Match($mainScriptText, '(?m)^AppId=\{\{(?<guid>[0-9A-Fa-f-]+)\}\r?$').Groups["guid"].Value
$uninstallRegistryGuid = [regex]::Match($scriptText, "ShoMetricsUninstallRegistryKey\s*=\s*'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\{(?<guid>[0-9A-Fa-f-]+)\}_is1'").Groups["guid"].Value

$failures = [System.Collections.Generic.List[string]]::new()

function Assert-Contains {
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [Parameter(Mandatory)]
        [string] $Text,

        [Parameter(Mandatory)]
        [string] $Pattern
    )

    if ($Text -notmatch $Pattern) {
        $failures.Add($Name)
    }
}

function Assert-NotContains {
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [Parameter(Mandatory)]
        [string] $Text,

        [Parameter(Mandatory)]
        [string] $Pattern
    )

    if ($Text -match $Pattern) {
        $failures.Add($Name)
    }
}

function Assert-MatchCount {
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [Parameter(Mandatory)]
        [string] $Text,

        [Parameter(Mandatory)]
        [string] $Pattern,

        [Parameter(Mandatory)]
        [int] $ExpectedCount
    )

    $actualCount = [regex]::Matches($Text, $Pattern).Count
    if ($actualCount -ne $ExpectedCount) {
        $failures.Add($Name)
    }
}

& node $brandAssetsScriptPath --test
& node $brandAssetsScriptPath --verify-only

Assert-Contains `
    -Name "Inno setup version is pinned in build script" `
    -Text $buildScriptText `
    -Pattern '\$innoSetupVersion\s*=\s*"6\.7\.3"'
Assert-Contains `
    -Name "Tools.InnoSetup package is exact-pinned" `
    -Text $innoProjectText `
    -Pattern '<PackageReference\s+Include="Tools\.InnoSetup"\s+Version="\[6\.7\.3\]"'
Assert-Contains `
    -Name "Inno package lock file is used" `
    -Text $innoProjectText `
    -Pattern '<NuGetLockFilePath>'

Assert-Contains -Name "Ready page stays disabled" -Text $mainScriptText -Pattern '(?m)^DisableReadyPage=yes\r?$'
Assert-Contains -Name "Welcome page stays disabled" -Text $mainScriptText -Pattern '(?m)^DisableWelcomePage=yes\r?$'
Assert-Contains -Name "Install cancellation is disabled once install starts" -Text $mainScriptText -Pattern '(?m)^AllowCancelDuringInstall=no\r?$'
Assert-Contains -Name "Setup can force-close read-only Control Panel during updates" -Text $mainScriptText -Pattern '(?m)^CloseApplications=force\r?$'
Assert-Contains -Name "Inno must not restart apps" -Text $mainScriptText -Pattern '(?m)^RestartApplications=no\r?$'
Assert-Contains -Name "Inno must not restart Windows because of Run entries" -Text $mainScriptText -Pattern '(?m)^RestartIfNeededByRun=no\r?$'
Assert-Contains -Name "RedirectionGuard remains enabled" -Text $mainScriptText -Pattern '(?m)^RedirectionGuard=yes\r?$'
Assert-Contains -Name "Inno setup and uninstall logs are enabled by default" -Text $mainScriptText -Pattern '(?m)^SetupLogging=yes\r?$'
Assert-Contains -Name "Finish page launches Control Panel as original user" -Text $mainScriptText -Pattern 'Flags:\s*postinstall\s+nowait\s+skipifsilent\s+runasoriginaluser'
Assert-Contains -Name "Setup executable uses the shared Windows application icon" -Text $mainScriptText -Pattern '(?m)^SetupIconFile=\.\.\\\.\.\\\.\.\\source-windows\\Assets\\ShoMetrics\.ico\r?$'
Assert-Contains -Name "Setup wizard uses the shared large brand image" -Text $mainScriptText -Pattern '(?m)^WizardImageFile=\.\.\\\.\.\\\.\.\\source-windows\\Assets\\ShoMetricsWizardImage\.png\r?$'
Assert-Contains -Name "Setup wizard uses the shared small brand image" -Text $mainScriptText -Pattern '(?m)^WizardSmallImageFile=\.\.\\\.\.\\\.\.\\source-windows\\Assets\\ShoMetricsWizardSmallImage\.png\r?$'
Assert-Contains -Name "Framework-dependent installer bundles ASP.NET Core Runtime only for framework-dependent distribution" -Text $mainScriptText -Pattern '(?s)#ifdef\s+ShoMetricsFrameworkDependentDistribution.*?aspnetcore-runtime-\{#AspNetCoreRuntimeVersion\}-win-x64\.exe.*?#endif'
Assert-Contains -Name "Inno requires ShoMetricsVersion from build script" -Text $mainScriptText -Pattern '(?s)#ifndef\s+ShoMetricsVersion\s+#error\s+ShoMetricsVersion must be passed by the build script\.\s+#endif'
Assert-NotContains -Name "Inno must not provide a fallback ShoMetricsVersion" -Text $mainScriptText -Pattern '#define\s+ShoMetricsVersion\s+"'
Assert-Contains -Name "Installer deletes stale service payload before copying files" -Text $mainScriptText -Pattern '(?m)^Type:\s*filesandordirs;\s*Name:\s*"\{app\}\\Service"\r?$'
Assert-Contains -Name "Installer deletes stale Control Panel payload before copying files" -Text $mainScriptText -Pattern '(?m)^Type:\s*filesandordirs;\s*Name:\s*"\{app\}\\ControlPanel"\r?$'
Assert-Contains -Name "Installer registers the diagnostics executable through App Paths" -Text $mainScriptText -Pattern '(?s)\[Registry\].*?Root:\s*HKLM64;\s*Subkey:\s*"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\ShoMetricsHelper\.exe";.*?ValueData:\s*"\{app\}\\ControlPanel\\ShoMetricsHelper\.exe";.*?uninsdeletekey'
Assert-Contains -Name "Existing install page uses Next to continue the normal flow" -Text $scriptText -Pattern '(?s)procedure\s+CreateExistingInstallPage;.*?ShoMetrics Helper is already installed.*?Click Next to stop ShoMetrics Helper'
Assert-Contains -Name "Existing install page appears before the license page" -Text $scriptText -Pattern '(?s)if\s+ExistingShoMetricsInstalledBeforeSetup\s+then.*?CreateExistingInstallPage;.*?LicensePagePreviousPageID\s*:=\s*ExistingInstallPage\.ID.*?CreateShoMetricsLicensePage\(LicensePagePreviousPageID\)'
Assert-NotContains -Name "Existing install page must not bypass license or PawnIO pages" -Text $scriptText -Pattern 'ExistingInstallPage.*?(InstallServiceAfterFiles|wpInstalling|PrepareToInstall|UpdateInstallButtonCaption)'
if (($setupAppIdGuid -eq '') -or ($uninstallRegistryGuid -eq '') -or ($setupAppIdGuid.ToUpperInvariant() -ne $uninstallRegistryGuid.ToUpperInvariant())) {
    $failures.Add("Existing install detection uses the same AppId as setup")
}

# The Stream Deck plugin launches the diagnostics window by reading registry
# entries this installer writes. Those constants live in TypeScript and in the
# Inno script with no shared source, so a rename on one side would silently stop
# the plugin from finding the window. Lock the two sides together here.
$launcherAppPathsKey = $launcherText |
    ForEach-Object { [regex]::Match($_, 'WINDOWS_HELPER_APP_PATHS_REGISTRY_KEY\s*=\s*"(?<key>[^"]+)"').Groups["key"].Value } |
    ForEach-Object { $_.Replace('\\', '\') }
$launcherUninstallGuid = [regex]::Match(
    $launcherText,
    'WINDOWS_HELPER_UNINSTALL_REGISTRY_KEY\s*=\s*"HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\\{(?<guid>[0-9A-Fa-f-]+)\}_is1"').Groups["guid"].Value
$launcherRelativeExecutablePath = (
    [regex]::Matches(
        [regex]::Match($launcherText, 'CONTROL_PANEL_RELATIVE_EXECUTABLE_PATH\s*=\s*\[(?<segments>[^\]]+)\]').Groups["segments"].Value,
        '"(?<segment>[^"]+)"') |
    ForEach-Object { $_.Groups["segment"].Value }
) -join '\'
$innoAppPathsSubkey = [regex]::Match($mainScriptText, 'Root:\s*HKLM64;\s*Subkey:\s*"(?<subkey>[^"]+)"').Groups["subkey"].Value
$innoAppPathsValueData = [regex]::Match($mainScriptText, 'Root:\s*HKLM64;[^\r\n]*?ValueData:\s*"(?<data>[^"]+)"').Groups["data"].Value

if (($launcherAppPathsKey -eq '') -or ($innoAppPathsSubkey -eq '') -or ($launcherAppPathsKey -ne "HKLM\$innoAppPathsSubkey")) {
    $failures.Add("Plugin App Paths lookup matches the installer App Paths subkey")
}
if (($launcherUninstallGuid -eq '') -or ($setupAppIdGuid -eq '') -or ($launcherUninstallGuid.ToUpperInvariant() -ne $setupAppIdGuid.ToUpperInvariant())) {
    $failures.Add("Plugin uninstall-key fallback uses the same AppId as setup")
}
if (($launcherRelativeExecutablePath -eq '') -or ($innoAppPathsValueData -eq '') -or ($innoAppPathsValueData -ne "{app}\$launcherRelativeExecutablePath")) {
    $failures.Add("Plugin fallback executable path matches the installed Control Panel layout")
}
Assert-Contains `
    -Name "Plugin registry lookups pin the 64-bit view" `
    -Text $launcherText `
    -Pattern 'REGISTRY_64_BIT_VIEW_ARGUMENT\s*=\s*"/reg:64"'

# The Control Panel and the plugin read the same update feed and place the same
# user in the same rollout group. A plugin pointed at a feed nobody publishes
# reports "no update" forever, and it does it silently: nothing else in the
# system notices that the update notice has simply stopped working.
$csharpAppcastUrls = [regex]::Matches($updateAppcastClientText, '(?m)^\s*private const string (?:Prod|Staging)AppcastUrl\s*=\s*"(?<url>[^"]+)"') |
    ForEach-Object { $_.Groups["url"].Value } | Sort-Object
$pluginAppcastUrls = [regex]::Matches($helperUpdateFeedText, '(?m)^export const (?:PROD|STAGING)_APPCAST_URL\s*=\s*"(?<url>[^"]+)"') |
    ForEach-Object { $_.Groups["url"].Value } | Sort-Object
if (($csharpAppcastUrls.Count -ne 2) -or ($pluginAppcastUrls.Count -ne 2) -or
    (Compare-Object $csharpAppcastUrls $pluginAppcastUrls)) {
    $failures.Add("Plugin and Control Panel read the same update feed URLs")
}

foreach ($appcastUrl in $pluginAppcastUrls) {
    $appcastFileName = ([uri]$appcastUrl).Segments[-1]
    $publishedAppcastPath = Join-Path $repoRoot "site\static\update\$appcastFileName"
    if (-not (Test-Path -LiteralPath $publishedAppcastPath)) {
        $failures.Add("Update feed $appcastFileName is published from site/static/update")
    }
}

$csharpRolloutGroupCount = [regex]::Match($updatePhasedRolloutText, 'GroupCount\s*=\s*(?<count>\d+)').Groups["count"].Value
$pluginRolloutGroupCount = [regex]::Match($helperUpdateRolloutText, 'PHASED_ROLLOUT_GROUP_COUNT\s*=\s*(?<count>\d+)').Groups["count"].Value
if (($csharpRolloutGroupCount -eq '') -or ($csharpRolloutGroupCount -ne $pluginRolloutGroupCount)) {
    $failures.Add("Plugin and Control Panel split a staged rollout into the same group count")
}

Assert-Contains `
    -Name "NeedRestart always returns false" `
    -Text $scriptText `
    -Pattern '(?s)function\s+NeedRestart:\s*Boolean;\s*begin\s*//.*?Result\s*:=\s*False;\s*end;'
Assert-Contains `
    -Name "PrepareToInstall explicitly keeps NeedsRestart false" `
    -Text $scriptText `
    -Pattern '(?s)function\s+PrepareToInstall\(var\s+NeedsRestart:\s*Boolean\):\s*String;.*?NeedsRestart\s*:=\s*False;'
Assert-NotContains `
    -Name "PrepareToInstall must not set NeedsRestart true" `
    -Text $scriptText `
    -Pattern 'NeedsRestart\s*:=\s*True'
Assert-NotContains `
    -Name "Script must not call msiexec" `
    -Text $scriptText `
    -Pattern '(?i)\bmsiexec\b'
Assert-NotContains `
    -Name "Script must not call PowerShell" `
    -Text $scriptText `
    -Pattern '(?i)\bpowershell\b'
Assert-NotContains `
    -Name "Script must not expose internal Source.Windows executable names" `
    -Text $scriptText `
    -Pattern 'ShoMetrics\.Source\.Windows'

Assert-Contains -Name "Inno service name is ShoMetrics Helper" -Text $scriptText -Pattern "ServiceName\s*=\s*'ShoMetrics Helper'"
Assert-Contains -Name "C# service name is ShoMetrics Helper" -Text $serviceConstantsText -Pattern 'public\s+const\s+string\s+ServiceName\s*=\s*"ShoMetrics Helper"'
Assert-Contains -Name "Service start command uses the service contract name" -Text $serviceStartCommandText -Pattern 'WindowsSourceServiceConstants\.ServiceName'
Assert-Contains -Name "Service executable uses shipped friendly name" -Text $scriptText -Pattern 'ShoMetricsHelperService\.exe'
Assert-Contains -Name "Control Panel executable uses shipped friendly name" -Text $scriptText -Pattern 'ShoMetricsHelper\.exe'
Assert-Contains -Name "Control Panel embeds the shared Windows application icon" -Text $controlPanelProjectText -Pattern '<ApplicationIcon>\.\.\\Assets\\ShoMetrics\.ico</ApplicationIcon>'
Assert-Contains -Name "Service executable embeds the shared Windows application icon" -Text $serviceProjectText -Pattern '<ApplicationIcon>\.\.\\Assets\\ShoMetrics\.ico</ApplicationIcon>'
Assert-Contains -Name "Service start waits for RUNNING state" -Text $scriptText -Pattern '(?s)function\s+StartService:\s*Boolean;.*?RunSc\(''start.*?WaitForServiceRunning'
Assert-Contains -Name "Installer configures service recovery before service start" -Text $scriptText -Pattern '(?s)procedure\s+InstallServiceAfterFiles;.*?InstallService.*?ConfigureServiceRecovery.*?StartService'
Assert-Contains -Name "Installer warns and continues when service recovery configuration fails" -Text $scriptText -Pattern '(?s)procedure\s+InstallServiceAfterFiles;.*?if\s+not\s+ConfigureServiceRecovery\s+then\s+Log\(''Warning: ShoMetrics Helper service crash recovery could not be configured\. Setup will continue without service failure recovery\.''\).*?StartService'
Assert-Contains -Name "Installer configures two finite service recovery restarts" -Text $scriptText -Pattern '(?s)function\s+ConfigureServiceRecovery:\s*Boolean;.*?failure.*?reset=\s*86400.*?actions=\s*restart/5000/restart/30000//'
Assert-Contains -Name "Installer enables failure actions for non-crash failures" -Text $scriptText -Pattern '(?s)function\s+ConfigureServiceRecovery:\s*Boolean;.*?failureflag.*?Quote\(ServiceName\).*?1'
Assert-Contains -Name "Uninstall service cleanup uses the uninstall progress form" -Text $scriptText -Pattern '(?s)procedure\s+SetServiceCleanupStatus.*?UninstallProgressForm\.StatusLabel\.Caption.*?WizardForm\.StatusLabel\.Caption.*?function\s+StopAndDeleteExistingService\(const\s+RetryActionText:\s*String;\s*const\s+IsUninstall:\s*Boolean\).*?CurUninstallStepChanged.*?StopAndDeleteExistingService\(''uninstall again'',\s*True\)'
Assert-Contains -Name "Framework-dependent preflight checks only the service base runtime before wizard/install starts" -Text $scriptText -Pattern '(?s)function\s+InitializeSetup:\s*Boolean;.*?ServiceBaseRuntimeInstalled.*?ShowMissingDotNetRuntimePrompt.*?Result\s*:=\s*False'
Assert-Contains -Name "Framework-dependent missing base runtime prompt opens official Microsoft .NET Runtime page" -Text $scriptText -Pattern 'https://dotnet\.microsoft\.com/download/dotnet/thank-you/runtime-10\.0\.8-windows-x64-installer'
Assert-Contains -Name "Framework-dependent installs bundled ASP.NET Core Runtime before service registration" -Text $scriptText -Pattern '(?s)procedure\s+InstallServiceAfterFiles;.*?InstallBundledAspNetCoreRuntime.*?InstallService'
Assert-Contains -Name "Framework-dependent ASP.NET Core Runtime setup is silent and non-restarting" -Text $scriptText -Pattern "aspnetcore-runtime-\{#AspNetCoreRuntimeVersion\}-win-x64\.exe'\),\s*'/install /quiet /norestart'"
Assert-Contains -Name "Framework-dependent runtime detection checks shared framework directories before sharedfx registry" -Text $scriptText -Pattern '(?s)function\s+RuntimeVersionPrefixExists\(.*?RuntimeVersionPrefixExistsInDefaultRoot.*?RuntimeVersionPrefixExistsFromRegistryRoot.*?RuntimeVersionPrefixExistsFromSharedHostPath.*?RuntimeVersionPrefixExistsFromEnvironment.*?RuntimeVersionPrefixExistsInSharedFxRegistry'
Assert-Contains -Name "Framework-dependent runtime detection treats sharedhost only as dotnet root hint" -Text $scriptText -Pattern '(?s)function\s+RuntimeVersionPrefixExistsFromSharedHostPath.*?sharedhost is not proof.*?DotNetRootContainsRuntime'
Assert-NotContains -Name "Framework-dependent runtime preflight must not use apphost prompt shims" -Text $scriptText -Pattern 'TriggerControlPanelRuntimePrompt|TriggerServiceRuntimePrompt|--runtime-check|ShoMetricsHelper\.exe.*?dontcopy|RuntimePromptDirectory'
Assert-NotContains -Name "Framework-dependent installer must not skip service start after install" -Text $scriptText -Pattern 'ShoMetricsFrameworkDependentDistribution.*?StartService|StartService.*?ShoMetricsFrameworkDependentDistribution'
Assert-Contains -Name "PawnIO is staged only through a Check predicate" -Text $mainScriptText -Pattern 'Check:\s*ShouldStagePawnIoSetup'
Assert-Contains -Name "PawnIO setup URL is pinned" -Text $buildScriptText -Pattern 'https://github\.com/namazso/PawnIO\.Setup/releases/download/\$pawnIoVersion/PawnIO_setup\.exe'
Assert-Contains -Name "PawnIO setup version is pinned" -Text $buildScriptText -Pattern '\$pawnIoVersion\s*=\s*"2\.2\.0"'
Assert-Contains -Name "PawnIO setup SHA256 is pinned" -Text $buildScriptText -Pattern '\$pawnIoSetupSha256\s*=\s*"1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032"'
Assert-Contains -Name "PawnIO setup hash is verified" -Text $buildScriptText -Pattern 'Assert-FileSha256\s+-Path\s+\$pawnIoSetupFullPath\s+-ExpectedSha256\s+\$pawnIoSetupSha256'
Assert-Contains -Name "PawnIO setup Authenticode signature is verified" -Text $buildScriptText -Pattern 'Assert-AuthenticodeSignatureValid\s+-Path\s+\$pawnIoSetupFullPath'
Assert-NotContains -Name "CI must not package a fake PawnIO placeholder" -Text $ciWorkflowText -Pattern 'CI placeholder for installer packaging smoke|Create CI-only PawnIO placeholder'
Assert-Contains -Name "PawnIO setup is silent install" -Text $scriptText -Pattern "PawnIO_setup\.exe'\), '-install -silent'"
Assert-Contains -Name "PawnIO install is intentionally non-rollback procedure" -Text $scriptText -Pattern '(?s)procedure\s+InstallPawnIo;'
Assert-Contains -Name "PawnIO already-exists exit code is treated as known" -Text $scriptText -Pattern 'ErrorAlreadyExists\s*=\s*183'
Assert-Contains -Name "PawnIO reboot-required exit code is treated as known" -Text $scriptText -Pattern 'ErrorSuccessRebootRequired\s*=\s*3010'
Assert-Contains -Name "Control Panel process detection uses shipped friendly name" -Text $scriptText -Pattern "ControlPanelProcessName\s*=\s*'ShoMetricsHelper\.exe'"
Assert-Contains -Name "Framework-dependent service base runtime requirement comes from service runtimeconfig" -Text $buildScriptText -Pattern 'Read-ServiceRuntimeFrameworkRequirement'
Assert-Contains -Name "ASP.NET Core Runtime version is always passed into Inno" -Text $buildScriptText -Pattern '(?s)\$innoArguments\s*=\s*@\(.*?/DAspNetCoreRuntimeVersion=\$aspNetCoreRuntimeVersion'
Assert-Contains -Name "Build script requires ShoMetricsVersionPrefix input" -Text $buildScriptText -Pattern '\[Parameter\(Mandatory\)\]\s*\[ValidateNotNullOrEmpty\(\)\]\s*\[string\]\s*\$ShoMetricsVersionPrefix'
Assert-NotContains -Name "Build script must not provide fallback ShoMetricsVersionPrefix" -Text $buildScriptText -Pattern '\$ShoMetricsVersionPrefix\s*=\s*"0\.1\.0"'
Assert-Contains -Name "Service publish always forwards ShoMetricsVersionPrefix" -Text $publishServiceScriptText -Pattern '\$publishArguments\s*\+=\s*"/p:ShoMetricsVersionPrefix=\$ShoMetricsVersionPrefix"'
Assert-Contains -Name "Control Panel publish always forwards ShoMetricsVersionPrefix" -Text $publishControlPanelScriptText -Pattern '\$publishArguments\s*\+=\s*"/p:ShoMetricsVersionPrefix=\$ShoMetricsVersionPrefix"'
Assert-Contains -Name "Framework-dependent ASP.NET Core Runtime version is pinned" -Text $buildScriptText -Pattern '\$aspNetCoreRuntimeVersion\s*=\s*"10\.0\.8"'
Assert-Contains -Name "Framework-dependent ASP.NET Core Runtime SHA256 is pinned" -Text $buildScriptText -Pattern '\$aspNetCoreRuntimeSetupSha256\s*=\s*"1c152d4a9138a92e2c04bea8ecc00e79ca8febfb7a9d5b6141f1546a076d11fd"'
Assert-Contains -Name "Distribution builds use separate artifact directory names" -Text $buildScriptText -Pattern '(?s)\$distributionDirectoryName\s*=\s*switch\s*\(\$Distribution\).*?"Standalone"\s*\{\s*"standalone"\s*\}.*?"FrameworkDependent"\s*\{\s*"framework-dependent"\s*\}'
Assert-Contains -Name "Default installer output is separated by distribution" -Text $buildScriptText -Pattern 'installer\\windows\\setup\\\$distributionDirectoryName'
Assert-Contains -Name "Installer payload output is separated by distribution" -Text $buildScriptText -Pattern 'installer\\windows\\build\\\$distributionDirectoryName'
Assert-Contains -Name "CI uploads installers from distribution subdirectories" -Text $ciWorkflowText -Pattern 'artifacts/installer/windows/setup/\*\*/\*\.exe'
Assert-Contains -Name "Control Panel publish output blocks unused ONNX Runtime payload" -Text $publishControlPanelScriptText -Pattern 'onnxruntime\.dll'
Assert-Contains -Name "Control Panel publish output blocks unused DirectML payload" -Text $publishControlPanelScriptText -Pattern 'DirectML\.dll'
Assert-NotContains -Name "Installer build must not rewrite tracked source-windows third-party notices" -Text $buildScriptText -Pattern 'generate-third-party-notices\.mjs'
Assert-NotContains -Name "Service publish must not rewrite tracked source-windows third-party notices" -Text $publishServiceScriptText -Pattern 'generate-third-party-notices\.mjs'
Assert-NotContains -Name "Control Panel publish must not rewrite tracked source-windows third-party notices" -Text $publishControlPanelScriptText -Pattern 'generate-third-party-notices\.mjs'
Assert-Contains -Name "Control Panel starts the service executable only through the fixed command" -Text $controlPanelMainWindowText -Pattern 'ServiceStartCommand\s*=\s*"--start-service"'
Assert-Contains -Name "Control Panel elevates only the service executable" -Text $controlPanelMainWindowText -Pattern 'ServiceExecutableName\s*=\s*"ShoMetricsHelperService\.exe"'
# "runas" is the UAC boundary. Keep exactly one call site because extra
# privileged executables are more likely to trigger AV/reputation false
# positives. Whole-app elevation also makes ordinary actions such as opening
# URLs, Explorer, or logs inherit an admin token. The only P0 privileged action
# is starting the installed background service.
Assert-MatchCount -Name "Control Panel has exactly one elevation call site" -Text $controlPanelMainWindowText -Pattern 'Verb\s*=\s*"runas"' -ExpectedCount 1
Assert-Contains -Name "Control Panel elevation call site uses the fixed service start command" -Text $controlPanelMainWindowText -Pattern '(?s)Process\.Start\(new ProcessStartInfo\s*\{.*?FileName\s*=\s*serviceExecutablePath,.*?Arguments\s*=\s*ServiceStartCommand,.*?Verb\s*=\s*"runas"'
Assert-Contains -Name "Control Panel uses the admin shield glyph on the service start action" -Text $controlPanelMainWindowText -Pattern 'Glyph="&#xE7EF;"'
Assert-NotContains -Name "Control Panel must not restart the whole app as administrator" -Text $controlPanelMainWindowText -Pattern 'RestartAsAdministrator|AdminModeCard|AdminRestartButton|Environment\.ProcessPath|IsRunningAsAdministrator'
Assert-Contains -Name "Service executable accepts start-service only as an exact maintenance mode" -Text $serviceProgramText -Pattern '"--start-service"\s+when\s+args\.Length\s+==\s+1'
Assert-NotContains -Name "Service start command must not start arbitrary processes" -Text $serviceStartCommandText -Pattern 'Process\.Start|UseShellExecute|Verb\s*='
$forbiddenDistributionName = 'sl' + 'im'
Assert-NotContains -Name "Installer distribution naming must not use deprecated compact-size name" -Text ($scriptText + $buildScriptText + $mainScriptText) -Pattern "(?i)\b$forbiddenDistributionName\b"

if ($failures.Count -gt 0) {
    Write-Error ("Windows installer invariant test failed:`n- " + ($failures -join "`n- "))
}

Write-Host "Windows installer invariants passed."
