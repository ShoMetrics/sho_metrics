const
  DotNetRuntimeDownloadUrl = 'https://dotnet.microsoft.com/download/dotnet/thank-you/runtime-10.0.8-windows-x64-installer';

function IsFrameworkDependentDistribution: Boolean;
begin
#ifdef ShoMetricsFrameworkDependentDistribution
  Result := True;
#else
  Result := False;
#endif
end;

function DotNetRootContainsRuntime(
  const DotNetRoot,
  FrameworkName,
  VersionPrefix: String): Boolean;
var
  FindRec: TFindRec;
  FrameworkRoot: String;
begin
  Result := False;

  if (DotNetRoot = '') or not DirExists(DotNetRoot) then
    Exit;

  FrameworkRoot := AddBackslash(DotNetRoot) + 'shared\' + FrameworkName;
  if not DirExists(FrameworkRoot) then
    Exit;

  if not FindFirst(AddBackslash(FrameworkRoot) + '*', FindRec) then
    Exit;

  try
    repeat
      if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0) and
        (Copy(FindRec.Name, 1, Length(VersionPrefix)) = VersionPrefix) then
      begin
        Log('Found runtime ' + FrameworkName + ' ' + FindRec.Name + ' under ' + DotNetRoot + '.');
        Result := True;
        Exit;
      end;
    until not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

function RuntimeVersionPrefixExistsInDefaultRoot(
  const FrameworkName,
  VersionPrefix: String): Boolean;
begin
  Result := DotNetRootContainsRuntime(ExpandConstant('{autopf}\dotnet'), FrameworkName, VersionPrefix);
end;

function RuntimeVersionPrefixExistsFromRegistryRoot(
  const FrameworkName,
  VersionPrefix: String): Boolean;
var
  DotNetRoot: String;
begin
  Result := RegQueryStringValue(
    HKEY_LOCAL_MACHINE_64,
    'SOFTWARE\dotnet\Setup\InstalledVersions\x64',
    'InstallLocation',
    DotNetRoot) and DotNetRootContainsRuntime(DotNetRoot, FrameworkName, VersionPrefix);
end;

function RuntimeVersionPrefixExistsFromSharedHostPath(
  const FrameworkName,
  VersionPrefix: String): Boolean;
var
  DotNetRoot: String;
begin
  // sharedhost is not proof that Microsoft.NETCore.App exists. It is only a
  // useful dotnet root hint when the official installer does not write sharedfx
  // registry keys, as seen with Desktop Runtime 10.0.8 in Windows Sandbox.
  Result := RegQueryStringValue(
    HKEY_LOCAL_MACHINE_64,
    'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedhost',
    'Path',
    DotNetRoot) and DotNetRootContainsRuntime(DotNetRoot, FrameworkName, VersionPrefix);
end;

function RuntimeVersionPrefixExistsFromEnvironment(
  const FrameworkName,
  VersionPrefix: String): Boolean;
var
  DotNetRoot: String;
begin
  DotNetRoot := GetEnv('DOTNET_ROOT_X64');
  Result := DotNetRootContainsRuntime(DotNetRoot, FrameworkName, VersionPrefix);
  if Result then
    Exit;

  DotNetRoot := GetEnv('DOTNET_ROOT');
  Result := DotNetRootContainsRuntime(DotNetRoot, FrameworkName, VersionPrefix);
end;

function RuntimeVersionPrefixExistsInSharedFxRegistry(
  const FrameworkName,
  VersionPrefix: String): Boolean;
var
  VersionIndex: Integer;
  InstalledVersions: TArrayOfString;
  RegistryPath: String;
begin
  Result := False;
  RegistryPath := 'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\' + FrameworkName;

  if not RegGetSubkeyNames(HKEY_LOCAL_MACHINE_64, RegistryPath, InstalledVersions) then
    Exit;

  for VersionIndex := 0 to GetArrayLength(InstalledVersions) - 1 do
  begin
    if Copy(InstalledVersions[VersionIndex], 1, Length(VersionPrefix)) = VersionPrefix then
    begin
      Log('Found runtime ' + FrameworkName + ' ' + InstalledVersions[VersionIndex] + ' in sharedfx registry.');
      Result := True;
      Exit;
    end;
  end;
end;

function RuntimeVersionPrefixExists(const FrameworkName, VersionPrefix: String): Boolean;
begin
  // Keep detection aligned with .NET apphost behavior: prove the x64 shared
  // framework directory exists under a plausible dotnet root. Registry-only
  // sharedfx detection is only a fallback because some official installers
  // write sharedhost but not sharedfx.
  Result := RuntimeVersionPrefixExistsInDefaultRoot(FrameworkName, VersionPrefix);
  if Result then
    Exit;

  Result := RuntimeVersionPrefixExistsFromRegistryRoot(FrameworkName, VersionPrefix);
  if Result then
    Exit;

  Result := RuntimeVersionPrefixExistsFromSharedHostPath(FrameworkName, VersionPrefix);
  if Result then
    Exit;

  Result := RuntimeVersionPrefixExistsFromEnvironment(FrameworkName, VersionPrefix);
  if Result then
    Exit;

  Result := RuntimeVersionPrefixExistsInSharedFxRegistry(FrameworkName, VersionPrefix);
end;

function RuntimeRequirementExists(const Requirement: String): Boolean;
var
  SeparatorIndex: Integer;
  FrameworkName: String;
  VersionPrefix: String;
begin
  Result := False;
  SeparatorIndex := Pos('=', Requirement);

  if SeparatorIndex = 0 then
    Exit;

  FrameworkName := Trim(Copy(Requirement, 1, SeparatorIndex - 1));
  VersionPrefix := Trim(Copy(Requirement, SeparatorIndex + 1, Length(Requirement)));

  if (FrameworkName = '') or (VersionPrefix = '') then
    Exit;

  Result := RuntimeVersionPrefixExists(FrameworkName, VersionPrefix);
end;

function ServiceBaseRuntimeInstalled: Boolean;
var
  Requirement: String;
begin
  Requirement := Trim('{#ServiceBaseRuntimeRequirement}');

  if Requirement = '' then
  begin
    Log('Framework-dependent service base runtime requirement was empty.');
    Result := False;
    Exit;
  end;

  Result := RuntimeRequirementExists(Requirement);
  if not Result then
    Log('Missing service base runtime requirement: ' + Requirement);
end;

procedure ShowMissingDotNetRuntimePrompt;
begin
  MsgBox(
    'ShoMetrics Helper Framework-Dependent installer requires Microsoft .NET Runtime 10 x64 before setup can continue.'#13#10#13#10 +
      'Setup will open the official Microsoft download page. Install the runtime, then run this setup again.',
    mbInformation,
    MB_OK);
  OpenUrl(DotNetRuntimeDownloadUrl);
end;

function InstallBundledAspNetCoreRuntime: Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

  if not IsFrameworkDependentDistribution then
    Exit;

  WizardForm.StatusLabel.Caption := 'Installing ASP.NET Core Runtime...';
  WizardForm.FilenameLabel.Caption := 'ASP.NET Core Runtime 10';
  WizardForm.ProgressGauge.Max := 100;
  WizardForm.ProgressGauge.Position := 45;
  WizardForm.Update;

  // Framework-dependent keeps the service out of self-contained mode, but
  // ordinary desktop users rarely have ASP.NET Core Runtime installed. Bundle
  // only this server runtime so the service can start once the base .NET
  // Runtime is present.
  if not RunHidden(
    ExpandConstant('{tmp}\aspnetcore-runtime-{#AspNetCoreRuntimeVersion}-win-x64.exe'),
    '/install /quiet /norestart',
    ResultCode) then
  begin
    MsgBox(
      'Setup could not start ASP.NET Core Runtime setup. Install ASP.NET Core Runtime 10 x64 from Microsoft, then run setup again.'#13#10#13#10 +
        SysErrorMessage(ResultCode),
      mbError,
      MB_OK);
    Result := False;
    Exit;
  end;

  if (ResultCode = 0) or (ResultCode = ErrorSuccessRebootRequired) then
    Exit;

  MsgBox(
    'ASP.NET Core Runtime setup did not complete successfully. Install ASP.NET Core Runtime 10 x64 from Microsoft, then run setup again.'#13#10#13#10 +
      'Exit code: ' + IntToStr(ResultCode),
    mbError,
    MB_OK);
  Result := False;
end;

function InitializeSetup: Boolean;
begin
  Result := True;

  if not IsFrameworkDependentDistribution then
    Exit;

  if ServiceBaseRuntimeInstalled then
    Exit;

  // Do not continue into file copy or service registration when the base
  // Microsoft.NETCore.App runtime is absent. ASP.NET Core Runtime is bundled
  // later, but it does not include the base .NET Runtime.
  ShowMissingDotNetRuntimePrompt;
  Result := False;
end;
