procedure InstallServiceAfterFiles;
begin
  WizardForm.StatusLabel.Caption := 'Installing ShoMetrics Helper service...';
  WizardForm.FilenameLabel.Caption := ServiceExePath;
  WizardForm.ProgressGauge.Max := 100;
  WizardForm.ProgressGauge.Position := 55;
  WizardForm.Update;

  if not InstallService then
    RaiseException('ShoMetrics Helper service could not be installed. The files were copied, but the service is not registered.');

  WizardForm.StatusLabel.Caption := 'Starting ShoMetrics Helper service...';
  WizardForm.ProgressGauge.Position := 65;
  WizardForm.Update;

  if not StartService then
    RaiseException('ShoMetrics Helper service was installed but could not be started. Open Services and check "ShoMetrics Helper".');

  if ShouldInstallPawnIo then
    InstallPawnIo;

  WizardForm.ProgressGauge.Position := 100;
  WizardForm.Update;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    InstallServiceAfterFiles;
end;

function NeedRestart: Boolean;
begin
  // Keep this false even after optional driver setup. Any reboot requirement
  // is surfaced as text so the installer cannot trigger Windows restart UI.
  Result := False;
end;
