function ShouldInstallPawnIo: Boolean;
begin
  Result := (not PawnIoInstalledBeforeSetup) and PawnIoInstallCheckBox.Checked;
end;

function ShouldStagePawnIoSetup: Boolean;
begin
  Result := ShouldInstallPawnIo;
end;

procedure CaptureDefaultWizardButtonLayout;
begin
  // PawnIO is the last pre-install page, so its Next button becomes Install
  // with a longer contextual caption. Capture Inno's default geometry before
  // resizing that one page, then restore it on every other page.
  DefaultBackButtonLeft := WizardForm.BackButton.Left;
  DefaultNextButtonLeft := WizardForm.NextButton.Left;
  DefaultCancelButtonLeft := WizardForm.CancelButton.Left;
  DefaultBackButtonWidth := WizardForm.BackButton.Width;
  DefaultNextButtonWidth := WizardForm.NextButton.Width;
  DefaultCancelButtonWidth := WizardForm.CancelButton.Width;
  DefaultButtonGap := DefaultNextButtonLeft - DefaultBackButtonLeft - DefaultBackButtonWidth;
end;

procedure RestoreDefaultWizardButtonLayout;
begin
  WizardForm.BackButton.Left := DefaultBackButtonLeft;
  WizardForm.BackButton.Width := DefaultBackButtonWidth;
  WizardForm.NextButton.Left := DefaultNextButtonLeft;
  WizardForm.NextButton.Width := DefaultNextButtonWidth;
  WizardForm.CancelButton.Left := DefaultCancelButtonLeft;
  WizardForm.CancelButton.Width := DefaultCancelButtonWidth;
end;

function WizardButtonGap: Integer;
begin
  Result := DefaultButtonGap;
  if Result < ScaleX(8) then
    Result := ScaleX(8);
end;

procedure SetPawnIoInstallButtonCaption(const Caption: String);
var
  ButtonGap: Integer;
  NextButtonWidth: Integer;
begin
  WizardForm.NextButton.Caption := Caption;
  ButtonGap := WizardButtonGap;
  NextButtonWidth := WizardForm.CalculateButtonWidth([Caption]);

  if NextButtonWidth < DefaultNextButtonWidth then
    NextButtonWidth := DefaultNextButtonWidth;

  WizardForm.CancelButton.Left := DefaultCancelButtonLeft;
  WizardForm.CancelButton.Width := DefaultCancelButtonWidth;
  WizardForm.NextButton.Width := NextButtonWidth;
  WizardForm.NextButton.Left := WizardForm.CancelButton.Left - ButtonGap - WizardForm.NextButton.Width;
  WizardForm.BackButton.Width := DefaultBackButtonWidth;
  WizardForm.BackButton.Left := WizardForm.NextButton.Left - ButtonGap - WizardForm.BackButton.Width;
end;

procedure UpdateInstallButtonCaption;
begin
  if ShouldInstallPawnIo then
    SetPawnIoInstallButtonCaption('Install (with PawnIO)')
  else
    SetPawnIoInstallButtonCaption('Install (skipping PawnIO)');
end;

procedure UpdatePawnIoOptionPageState;
var
  NeedsPawnIoNoticeAcceptance: Boolean;
begin
  NeedsPawnIoNoticeAcceptance := ShouldInstallPawnIo;

  PawnIoLicenseMemo.Enabled := NeedsPawnIoNoticeAcceptance;
  PawnIoAcceptRadioButton.Enabled := NeedsPawnIoNoticeAcceptance;
  PawnIoDeclineRadioButton.Enabled := NeedsPawnIoNoticeAcceptance;
  WizardForm.NextButton.Enabled := (not NeedsPawnIoNoticeAcceptance) or PawnIoAcceptRadioButton.Checked;
  UpdateInstallButtonCaption;
end;

procedure PawnIoOptionChanged(Sender: TObject);
begin
  UpdatePawnIoOptionPageState;
end;

procedure ShoMetricsLicenseChanged(Sender: TObject);
begin
  WizardForm.NextButton.Enabled := ShoMetricsAcceptRadioButton.Checked;
end;

function PawnIoOptionPageNextButtonClick(Sender: TWizardPage): Boolean;
begin
  Result := (not ShouldInstallPawnIo) or PawnIoAcceptRadioButton.Checked;

  if not Result then
    MsgBox('Please accept the PawnIO Driver agreement before installing PawnIO, or uncheck PawnIO to skip it.', mbError, MB_OK);
end;

procedure InstallPawnIo;
var
  ResultCode: Integer;
begin
  if not ShouldInstallPawnIo then
    Exit;

  WizardForm.StatusLabel.Caption := 'Installing PawnIO driver...';
  WizardForm.FilenameLabel.Caption := 'PawnIO setup';
  WizardForm.ProgressGauge.Position := 80;
  WizardForm.Update;

  if not RunHidden(ExpandConstant('{tmp}\PawnIO_setup.exe'), '-install -silent', ResultCode) then
  begin
    MsgBox('Setup could not start PawnIO setup. Temperature and power sensors may not work until PawnIO is installed from ' + PawnIoUrl + '.', mbError, MB_OK);
    Exit;
  end;

  if (ResultCode = 0) or (ResultCode = ErrorAlreadyExists) then
    Exit;

  if (ResultCode = ErrorSuccessRebootRequired) or (ResultCode = ErrorServiceMarkedForDelete) then
  begin
    // PawnIO may legitimately need a reboot, but this installer never hands
    // that reboot decision to Inno. The user gets an explicit manual restart
    // notice instead of an automatic system restart prompt.
    MsgBox(
      'PawnIO setup completed but reported that Windows should be restarted before PawnIO is fully ready.'#13#10#13#10 +
      'Setup will not restart Windows automatically. Restart your PC when convenient.',
      mbInformation,
      MB_OK);
    Exit;
  end;

  MsgBox('PawnIO setup did not complete successfully. Temperature and power sensors may not work until PawnIO is installed from ' + PawnIoUrl + '.'#13#10#13#10 +
    'Exit code: ' + IntToStr(ResultCode), mbError, MB_OK);
end;
