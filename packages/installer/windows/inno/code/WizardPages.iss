function AgreementRadioButtonHeight: Integer;
begin
  Result := ScaleY(20);
end;

function AgreementRadioButtonGap: Integer;
begin
  Result := ScaleY(0);
end;

function AgreementRadioGroupHeight: Integer;
begin
  Result := (AgreementRadioButtonHeight * 2) + AgreementRadioButtonGap;
end;

function CreateBodyLinkLabel(Page: TWizardPage; const Caption: String; const IsVisible: Boolean): TNewLinkLabel;
begin
  Result := TNewLinkLabel.Create(Page);
  Result.Parent := Page.Surface;
  Result.AutoSize := False;
  Result.Left := ScaleX(0);
  Result.Top := ScaleY(0);
  Result.Width := Page.SurfaceWidth;
  Result.Caption := Caption;
  Result.UseVisualStyle := HighContrastActive;
  Result.OnLinkClick := @BodyLinkClick;
  Result.AdjustHeight;
  Result.Visible := IsVisible;
end;

function CreateLicenseViewer(Page: TWizardPage; const Top: Integer; const Height: Integer): TRichEditViewer;
begin
  Result := TRichEditViewer.Create(Page);
  Result.Parent := Page.Surface;
  Result.Left := ScaleX(0);
  Result.Top := Top;
  Result.Width := Page.SurfaceWidth;
  Result.Height := Height;
  Result.BevelKind := bkFlat;
  Result.BorderStyle := bsNone;
  Result.ReadOnly := True;
  Result.ScrollBars := ssVertical;
  Result.UseRichEdit := True;
end;

function CreateAgreementRadioButton(
  Page: TWizardPage;
  const Top: Integer;
  const Caption: String;
  const IsChecked: Boolean;
  const IsVisible: Boolean): TNewRadioButton;
begin
  Result := TNewRadioButton.Create(Page);
  Result.Parent := Page.Surface;
  Result.Left := ScaleX(0);
  Result.Top := Top;
  Result.Width := Page.SurfaceWidth;
  Result.Height := AgreementRadioButtonHeight;
  Result.Caption := Caption;
  Result.Checked := IsChecked;
  Result.Visible := IsVisible;
end;

procedure CreateShoMetricsLicensePage(const AfterPageID: Integer);
var
  DescriptionLabel: TNewLinkLabel;
  MemoTop: Integer;
  RadioTop: Integer;
begin
  ShoMetricsLicensePage := CreateCustomPage(
    AfterPageID,
    'License Agreement',
    'Please read this agreement before continuing.');
  ShoMetricsLicensePage.OnNextButtonClick := @ShoMetricsLicensePageNextButtonClick;

  DescriptionLabel := CreateBodyLinkLabel(
    ShoMetricsLicensePage,
    'ShoMetrics Helper provides Windows sensor data to the ShoMetrics Stream Deck plugin. It is not useful without the parent Stream Deck plugin.'#13#10 +
      'ShoMetrics Helper is open source: <a href="https://github.com/ShoMetrics/sho_metrics">ShoMetrics/sho_metrics</a>.',
    True);

  RadioTop := ShoMetricsLicensePage.SurfaceHeight - AgreementRadioGroupHeight;
  MemoTop := DescriptionLabel.Top + DescriptionLabel.Height + ScaleY(10);

  ShoMetricsLicenseViewer := CreateLicenseViewer(
    ShoMetricsLicensePage,
    MemoTop,
    RadioTop - MemoTop - ScaleY(10));
  ExtractTemporaryFile('ShoMetricsDisclaimer.txt');
  ShoMetricsLicenseViewer.Lines.LoadFromFile(ExpandConstant('{tmp}\ShoMetricsDisclaimer.txt'));

  ShoMetricsAcceptRadioButton := CreateAgreementRadioButton(
    ShoMetricsLicensePage,
    RadioTop,
    'I accept the agreement',
    False,
    True);
  ShoMetricsAcceptRadioButton.OnClick := @ShoMetricsLicenseChanged;

  ShoMetricsDeclineRadioButton := CreateAgreementRadioButton(
    ShoMetricsLicensePage,
    ShoMetricsAcceptRadioButton.Top + ShoMetricsAcceptRadioButton.Height + AgreementRadioButtonGap,
    'I do not accept the agreement',
    True,
    True);
  ShoMetricsDeclineRadioButton.OnClick := @ShoMetricsLicenseChanged;
end;

procedure CreateExistingInstallPage;
begin
  ExistingInstallPage := CreateCustomPage(
    wpWelcome,
    'ShoMetrics Helper is already installed',
    'Setup will install this version over the existing installation.');

  CreateBodyLinkLabel(
    ExistingInstallPage,
    'Installed version: ' + ExistingShoMetricsInstalledVersion + #13#10 +
      'This installer version: {#ShoMetricsVersion}'#13#10#13#10 +
      'Click Next to stop ShoMetrics Helper, clean old application files, and install this version.'#13#10 +
      'Your logs will be kept. PawnIO will not be uninstalled or changed by this step.',
    True);
end;

procedure CreatePawnIoOptionPage;
var
  PawnIoInstalledLabel: TNewLinkLabel;
  BodyTop: Integer;
  MemoTop: Integer;
  RadioTop: Integer;
  MinimumMemoHeight: Integer;
begin
  PawnIoOptionPage := CreateCustomPage(
    ShoMetricsLicensePage.ID,
    'Install PawnIO Driver (Optional)',
    'Installing PawnIO requires accepting its separate agreement.');
  PawnIoOptionPage.OnNextButtonClick := @PawnIoOptionPageNextButtonClick;

  PawnIoInstalledLabel := CreateBodyLinkLabel(
    PawnIoOptionPage,
    'PawnIO is already installed on this computer. Setup will not install, uninstall, or update PawnIO. If you need to reinstall PawnIO, visit the official PawnIO site <a href="' + PawnIoUrl + '">' + PawnIoUrl + '</a>.',
    PawnIoInstalledBeforeSetup);

  PawnIoDescriptionLabel := CreateBodyLinkLabel(
    PawnIoOptionPage,
    'PawnIO is needed for temperature and power sensors. PawnIO is a popular, open source driver for accessing hardware. Read more <a href="https://shometrics.github.io/faq/helper/">here</a>.'#13#10 +
      'PawnIO is made by namazso. ShoMetrics is not affiliated with PawnIO.'#13#10#13#10 +
      'This installer bundles an unmodified, official version of PawnIO from <a href="' + PawnIoUrl + '">' + PawnIoUrl + '</a> for your convenience. You can also install PawnIO yourself from the official website.',
    not PawnIoInstalledBeforeSetup);

  if not PawnIoInstalledBeforeSetup then
    BodyTop := PawnIoDescriptionLabel.Top + PawnIoDescriptionLabel.Height + ScaleY(8)
  else
    BodyTop := PawnIoInstalledLabel.Top + PawnIoInstalledLabel.Height + ScaleY(24);

  PawnIoInstallCheckBox := TNewCheckBox.Create(PawnIoOptionPage);
  PawnIoInstallCheckBox.Parent := PawnIoOptionPage.Surface;
  PawnIoInstallCheckBox.Left := ScaleX(0);
  PawnIoInstallCheckBox.Top := BodyTop;
  PawnIoInstallCheckBox.Width := PawnIoOptionPage.SurfaceWidth;
  PawnIoInstallCheckBox.Height := ScaleY(24);
  PawnIoInstallCheckBox.Caption := 'Install PawnIO Driver (recommended - needed for temperature and power sensors)';
  PawnIoInstallCheckBox.Checked := not PawnIoInstalledBeforeSetup;
  PawnIoInstallCheckBox.Enabled := not PawnIoInstalledBeforeSetup;
  PawnIoInstallCheckBox.OnClick := @PawnIoOptionChanged;

  MemoTop := PawnIoInstallCheckBox.Top + PawnIoInstallCheckBox.Height + ScaleY(12);
  RadioTop := PawnIoOptionPage.SurfaceHeight - AgreementRadioGroupHeight;
  MinimumMemoHeight := ScaleY(64);

  PawnIoLicenseMemo := CreateLicenseViewer(
    PawnIoOptionPage,
    MemoTop,
    RadioTop - MemoTop - ScaleY(10));
  if (PawnIoLicenseMemo.Height < MinimumMemoHeight) and
    (MemoTop + MinimumMemoHeight + ScaleY(10) <= RadioTop) then
    PawnIoLicenseMemo.Height := MinimumMemoHeight;
  PawnIoLicenseMemo.Lines.Text := PawnIoNoticeText;
  PawnIoLicenseMemo.Visible := not PawnIoInstalledBeforeSetup;

  PawnIoAcceptRadioButton := CreateAgreementRadioButton(
    PawnIoOptionPage,
    RadioTop,
    'I accept the agreement',
    False,
    not PawnIoInstalledBeforeSetup);
  PawnIoAcceptRadioButton.OnClick := @PawnIoOptionChanged;

  PawnIoDeclineRadioButton := CreateAgreementRadioButton(
    PawnIoOptionPage,
    PawnIoAcceptRadioButton.Top + PawnIoAcceptRadioButton.Height + AgreementRadioButtonGap,
    'I do not accept the agreement',
    True,
    not PawnIoInstalledBeforeSetup);
  PawnIoDeclineRadioButton.OnClick := @PawnIoOptionChanged;
end;

procedure InitializeWizard;
var
  LicensePagePreviousPageID: Integer;
begin
  ExistingShoMetricsInstalledBeforeSetup := ExistingShoMetricsInstallRecordExists(ExistingShoMetricsInstalledVersion);
  PawnIoInstalledBeforeSetup := PawnIoInstallRecordExists;

  if ExistingShoMetricsInstalledBeforeSetup then
  begin
    CreateExistingInstallPage;
    LicensePagePreviousPageID := ExistingInstallPage.ID;
  end
  else
    LicensePagePreviousPageID := wpWelcome;

  CreateShoMetricsLicensePage(LicensePagePreviousPageID);
  CreatePawnIoOptionPage;

  CaptureDefaultWizardButtonLayout;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = PawnIoOptionPage.ID then
    UpdateInstallButtonCaption
  else if CurPageID = wpFinished then
  begin
    RestoreDefaultWizardButtonLayout;
    WizardForm.NextButton.Caption := SetupMessage(msgButtonFinish)
  end
  else
  begin
    RestoreDefaultWizardButtonLayout;
    WizardForm.NextButton.Caption := SetupMessage(msgButtonNext);
  end;

  // Only change NextButton.Enabled on pages owned by this script. Inno's
  // built-in wpPreparing failure page relies on a disabled Next button when
  // PrepareToInstall fails without requesting a restart. A broad fallback here
  // once re-enabled that button and let users enter Inno's restart path.
  if CurPageID = PawnIoOptionPage.ID then
    UpdatePawnIoOptionPageState
  else if CurPageID = ShoMetricsLicensePage.ID then
    ShoMetricsLicenseChanged(nil);
end;
