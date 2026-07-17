const
  // Must match WindowsSourceServiceConstants.ServiceName. The Inno script is
  // intentionally static-tested for this because sc.exe owns the service name.
  ServiceName = 'ShoMetrics Helper';
  ServiceDisplayName = 'ShoMetrics Helper';
  // Shipped executable name, not the internal C# project name. Inno's app
  // close detection exposes this string to users.
  ControlPanelProcessName = 'ShoMetricsHelper.exe';
  ServiceStartTimeoutSeconds = 30;
  ServiceStopTimeoutSeconds = 30;
  ServiceDeleteTimeoutSeconds = 10;
  // Must match [Setup] AppId. Inno stores installed app metadata under this
  // key, which we use only to show a reinstall/update intro page.
  ShoMetricsUninstallRegistryKey = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{36A3A687-9B6A-4F81-9343-6683FF2CC3C2}_is1';
  PawnIoUrl = 'https://pawnio.eu/';
  ErrorServiceDoesNotExist = 1060;
  ErrorServiceNotActive = 1062;
  ErrorServiceMarkedForDelete = 1072;
  ErrorAlreadyExists = 183;
  ErrorSuccessRebootRequired = 3010;
  ListBoxGetItemHeightMessage = $01A1;

var
  ExistingInstallPage: TWizardPage;
  ExistingShoMetricsInstalledBeforeSetup: Boolean;
  ExistingShoMetricsInstalledVersion: String;
  ShoMetricsLicensePage: TWizardPage;
  ShoMetricsLicenseViewer: TRichEditViewer;
  ShoMetricsAcceptRadioButton: TNewRadioButton;
  ShoMetricsDeclineRadioButton: TNewRadioButton;
  PawnIoOptionPage: TWizardPage;
  PawnIoDescriptionLabel: TNewLinkLabel;
  PawnIoInstallCheckBox: TNewCheckBox;
  PawnIoLicenseMemo: TRichEditViewer;
  PawnIoAcceptRadioButton: TNewRadioButton;
  PawnIoDeclineRadioButton: TNewRadioButton;
  PawnIoInstalledBeforeSetup: Boolean;
  FinishedRestartAdviceLabel: TNewStaticText;
  DefaultBackButtonLeft: Integer;
  DefaultNextButtonLeft: Integer;
  DefaultCancelButtonLeft: Integer;
  DefaultBackButtonWidth: Integer;
  DefaultNextButtonWidth: Integer;
  DefaultCancelButtonWidth: Integer;
  DefaultButtonGap: Integer;

function Quote(const Value: String): String;
begin
  Result := '"' + Value + '"';
end;

function ServiceExePath: String;
begin
  Result := ExpandConstant('{app}\Service\ShoMetricsHelperService.exe');
end;

function PawnIoNoticeText: String;
begin
  Result :=
    'PawnIO is provided "as is" without warranty of any kind, either express or implied. Use at your own risk. The authors are not liable for any damages arising from the use of this software.'#13#10#13#10 +
    'All rights reserved.'#13#10 +
    'This installer can be redistributed unmodified.'#13#10 +
    'Copyright (C) 2026 namazso <admin@namazso.eu>'#13#10#13#10 +
    'This notice is included for convenience only and is not a substitute for the official PawnIO notice. Review the official PawnIO release and terms at https://pawnio.eu/ before installing.';
end;

function ServiceRegistryKeyExists: Boolean;
begin
  Result := RegKeyExists(HKEY_LOCAL_MACHINE_64, 'SYSTEM\CurrentControlSet\Services\' + ServiceName) or
    RegKeyExists(HKEY_LOCAL_MACHINE_32, 'SYSTEM\CurrentControlSet\Services\' + ServiceName);
end;

function PawnIoInstallRecordExists: Boolean;
begin
  // Keep install-time PawnIO detection intentionally narrow. Runtime driver
  // usability remains the Control Panel's responsibility.
  Result := RegKeyExists(HKEY_LOCAL_MACHINE_64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO') or
    RegKeyExists(HKEY_LOCAL_MACHINE_32, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO');
end;

function ExistingShoMetricsInstallRecordExists(var InstalledVersion: String): Boolean;
var
  DisplayVersionFound: Boolean;
begin
  Result := RegKeyExists(HKEY_LOCAL_MACHINE_64, ShoMetricsUninstallRegistryKey) or
    RegKeyExists(HKEY_LOCAL_MACHINE_32, ShoMetricsUninstallRegistryKey);

  if not Result then
    Exit;

  DisplayVersionFound := RegQueryStringValue(
    HKEY_LOCAL_MACHINE_64,
    ShoMetricsUninstallRegistryKey,
    'DisplayVersion',
    InstalledVersion);
  if not DisplayVersionFound then
    DisplayVersionFound := RegQueryStringValue(
      HKEY_LOCAL_MACHINE_32,
      ShoMetricsUninstallRegistryKey,
      'DisplayVersion',
      InstalledVersion);

  if (not DisplayVersionFound) or (Trim(InstalledVersion) = '') then
    InstalledVersion := 'unknown';
end;

procedure OpenUrl(const Url: String);
var
  ErrorCode: Integer;
begin
  if not ShellExec('', Url, '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode) then
    MsgBox('Setup could not open ' + Url + '.'#13#10#13#10 + SysErrorMessage(ErrorCode), mbError, MB_OK);
end;

procedure BodyLinkClick(Sender: TObject; const Link: String; LinkType: TSysLinkType);
begin
  if LinkType = sltURL then
    OpenUrl(Link);
end;

function ShoMetricsLicensePageNextButtonClick(Sender: TWizardPage): Boolean;
begin
  Result := ShoMetricsAcceptRadioButton.Checked;

  if not Result then
    MsgBox('Please accept the ShoMetrics Helper agreement before continuing.', mbError, MB_OK);
end;
