#ifndef ShoMetricsVersion
  #define ShoMetricsVersion "0.1.0"
#endif

#ifndef ServicePayloadDir
  #error ServicePayloadDir must be passed by the build script.
#endif

#ifndef ControlPanelPayloadDir
  #error ControlPanelPayloadDir must be passed by the build script.
#endif

#ifndef PawnIoSetupPath
  #error PawnIoSetupPath must be passed by the build script.
#endif

#ifndef ServiceBaseRuntimeRequirement
  #define ServiceBaseRuntimeRequirement ""
#endif

#ifdef ShoMetricsFrameworkDependentDistribution
  #ifndef AspNetCoreRuntimeVersion
    #error AspNetCoreRuntimeVersion must be passed by the build script for FrameworkDependent distribution.
  #endif

  #ifndef AspNetCoreRuntimeSetupPath
    #error AspNetCoreRuntimeSetupPath must be passed by the build script for FrameworkDependent distribution.
  #endif
#endif

#define PawnIoPostUninstallSharedComponentNotice "PawnIO was not uninstalled.%n%nThis is intentional since it can be a shared component.%n%nIf you want to remove PawnIO, uninstall it separately from Windows Installed Apps."

[Setup]
AppId={{36A3A687-9B6A-4F81-9343-6683FF2CC3C2}
AppName=ShoMetrics Helper
AppVersion={#ShoMetricsVersion}
AppVerName=ShoMetrics Helper version {#ShoMetricsVersion}
AppPublisher=ShoMetrics
DefaultDirName={autopf}\ShoMetrics\ShoMetrics Helper
DefaultGroupName=ShoMetrics Helper
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableWelcomePage=yes
DisableReadyPage=yes
OutputBaseFilename=ShoMetrics-Helper-Setup-{#ShoMetricsVersion}-win-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
WizardStyle=modern dynamic
WizardSizePercent=120
; Setup runs service and driver installers that are not safely cancellable
; mid-operation. Only allow cancellation between pages, before install starts.
AllowCancelDuringInstall=no
; Control Panel is a read-only diagnostics window. Let Inno close it so updates
; can replace the app payload without asking users to manually hunt it down.
CloseApplications=force
; ShoMetrics owns restart messaging. Inno must not restart apps or Windows on
; our behalf, because Preparing-page failures can otherwise become restart UI.
RestartApplications=no
RestartIfNeededByRun=no
; Keep this explicit because setup runs elevated and creates ProgramData paths.
RedirectionGuard=yes
UninstallDisplayName=ShoMetrics Helper
UninstallDisplayIcon={app}\ControlPanel\ShoMetricsHelper.exe
VersionInfoCompany=ShoMetrics
VersionInfoProductName=ShoMetrics Helper
VersionInfoProductVersion={#ShoMetricsVersion}
VersionInfoVersion={#ShoMetricsVersion}

[Dirs]
Name: "{commonappdata}\ShoMetrics\logs"; Flags: uninsneveruninstall

[InstallDelete]
; Switching between Standalone and FrameworkDependent changes the payload shape.
; Remove old app-local runtime files first so stale hostfxr/coreclr copies do
; not hijack framework-dependent launches away from the global .NET install.
Type: filesandordirs; Name: "{app}\Service"
Type: filesandordirs; Name: "{app}\ControlPanel"

[Files]
Source: "ShoMetricsDisclaimer.txt"; Flags: dontcopy
#ifdef ShoMetricsFrameworkDependentDistribution
Source: "{#AspNetCoreRuntimeSetupPath}"; DestDir: "{tmp}"; DestName: "aspnetcore-runtime-{#AspNetCoreRuntimeVersion}-win-x64.exe"; Flags: deleteafterinstall
#endif
Source: "{#ServicePayloadDir}\*"; DestDir: "{app}\Service"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ControlPanelPayloadDir}\*"; DestDir: "{app}\ControlPanel"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PawnIoSetupPath}"; DestDir: "{tmp}"; DestName: "PawnIO_setup.exe"; Flags: deleteafterinstall; Check: ShouldStagePawnIoSetup

[Icons]
Name: "{autoprograms}\ShoMetrics Helper"; Filename: "{app}\ControlPanel\ShoMetricsHelper.exe"; WorkingDir: "{app}\ControlPanel"
Name: "{autoprograms}\ShoMetrics Logs"; Filename: "{commonappdata}\ShoMetrics\logs"

[Run]
Filename: "{app}\ControlPanel\ShoMetricsHelper.exe"; Description: "Open ShoMetrics Control Panel"; Flags: postinstall nowait skipifsilent runasoriginaluser

[Messages]
ButtonInstall=Install
ApplicationsFound=ShoMetrics Helper is currently running and needs to be closed before setup can update it. Setup can close it automatically.
ApplicationsFound2=ShoMetrics Helper is currently running and needs to be closed before setup can update it. Setup can close it automatically.
CloseApplications=&Automatically close ShoMetrics Helper
DontCloseApplications=&Do not close ShoMetrics Helper (installation will end in incomplete state)
ErrorCloseApplications=Setup could not automatically close ShoMetrics Helper. Close ShoMetrics Helper manually, then continue setup.
ConfirmUninstall=Are you sure you want to uninstall %1?%n%nPawnIO will not be uninstalled. PawnIO is a shared driver used by other software that you may or may not be using, including Fan Control and OpenRGB. Removing it automatically could break those applications.%n%nIf you want to remove PawnIO, uninstall it separately from Windows Installed Apps.
UninstalledAll=%1 was successfully removed from your computer.%n%n{#PawnIoPostUninstallSharedComponentNotice}
UninstalledMost=%1 uninstall complete.%n%nSome elements could not be removed. These can be removed manually.%n%n{#PawnIoPostUninstallSharedComponentNotice}
UninstalledAndNeedsRestart=To complete the uninstallation of %1, your computer must be restarted.%n%n{#PawnIoPostUninstallSharedComponentNotice}%n%nWould you like to restart now?

[Code]
#include "code\Declarations.iss"
#include "code\CommandOutput.iss"
#include "code\RuntimePreflight.iss"
#include "code\ServiceLifecycle.iss"
#include "code\PawnIoFlow.iss"
#include "code\InstallFlow.iss"
#include "code\WizardPages.iss"
#include "code\UninstallFlow.iss"
