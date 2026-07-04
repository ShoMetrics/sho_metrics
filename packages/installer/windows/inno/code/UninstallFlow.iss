function InitializeUninstall: Boolean;
var
  ErrorMessage: String;
begin
  Result := True;

  ErrorMessage := RequireControlPanelClosed('uninstall');
  if ErrorMessage = '' then
    Exit;

  Log(ErrorMessage);
  if not UninstallSilent then
    MsgBox(ErrorMessage, mbError, MB_OK);

  Result := False;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ErrorMessage: String;
begin
  if CurUninstallStep <> usUninstall then
    Exit;

  ErrorMessage := StopAndDeleteExistingService('uninstall again', True);
  if ErrorMessage = '' then
    Exit;

  MsgBox(ErrorMessage, mbError, MB_OK);
  Abort;
end;
