function QueryServiceStateMatches(const StateCode: String; const TreatMissingAsMatch: Boolean; var QueryFailed: Boolean): Boolean;
var
  ResultCode: Integer;
  Output: TExecOutput;
begin
  QueryFailed := False;

  if not CaptureCommandOutput(
    'sc.exe',
    ExpandConstant('{sys}\sc.exe'),
    'query ' + Quote(ServiceName),
    ResultCode,
    Output) then
  begin
    QueryFailed := True;
    Result := False;
    Exit;
  end;

  if TreatMissingAsMatch and (ResultCode = ErrorServiceDoesNotExist) then
  begin
    Result := True;
    Exit;
  end;

  if ResultCode <> 0 then
  begin
    QueryFailed := True;
    Result := False;
    Exit;
  end;

  Result := OutputContainsLeadingStateCode(Output, StateCode);
end;

function QueryServiceStoppedOrMissing(var QueryFailed: Boolean): Boolean;
begin
  Result := QueryServiceStateMatches('1', True, QueryFailed);
end;

function QueryServiceRunning(var QueryFailed: Boolean): Boolean;
begin
  Result := QueryServiceStateMatches('4', False, QueryFailed);
end;

function WaitForServiceStoppedOrMissing(const TimeoutSeconds: Integer): Boolean;
var
  Attempt: Integer;
  QueryFailed: Boolean;
begin
  Result := False;

  for Attempt := 0 to TimeoutSeconds do
  begin
    if QueryServiceStoppedOrMissing(QueryFailed) then
    begin
      Result := True;
      Exit;
    end;

    if QueryFailed then
      Exit;

    Sleep(1000);
  end;
end;

function WaitForServiceRunning(const TimeoutSeconds: Integer): Boolean;
var
  Attempt: Integer;
  QueryFailed: Boolean;
begin
  Result := False;

  for Attempt := 0 to TimeoutSeconds do
  begin
    if QueryServiceRunning(QueryFailed) then
    begin
      Result := True;
      Exit;
    end;

    if QueryFailed then
      Exit;

    Sleep(1000);
  end;
end;

function WaitForServiceDeleted(const TimeoutSeconds: Integer): Boolean;
var
  Attempt: Integer;
begin
  Result := False;

  for Attempt := 0 to TimeoutSeconds do
  begin
    if not ServiceRegistryKeyExists then
    begin
      Result := True;
      Exit;
    end;

    Sleep(1000);
  end;
end;

function StopExistingService(const RetryActionText: String): String;
var
  ResultCode: Integer;
begin
  Result := '';

  if not ServiceRegistryKeyExists then
    Exit;

  WizardForm.StatusLabel.Caption := 'Stopping ShoMetrics Helper service...';
  WizardForm.Update;

  if not RunSc('stop ' + Quote(ServiceName), ResultCode) then
  begin
    Result := 'ShoMetrics Helper could not ask Windows to stop the existing service. Restart your PC, then ' + RetryActionText + '.';
    Exit;
  end;

  if (ResultCode <> 0) and (ResultCode <> ErrorServiceNotActive) and (ResultCode <> ErrorServiceDoesNotExist) then
  begin
    Log('sc stop returned ' + IntToStr(ResultCode) + '; setup will verify the stopped state before continuing.');
  end;

  if not WaitForServiceStoppedOrMissing(ServiceStopTimeoutSeconds) then
  begin
    Result := 'ShoMetrics Helper is still running. Restart your PC, or stop "ShoMetrics Helper" from Services, then ' + RetryActionText + '.';
    Exit;
  end;
end;

function DeleteExistingService(const RetryActionText: String): String;
var
  ResultCode: Integer;
begin
  Result := '';

  if not ServiceRegistryKeyExists then
    Exit;

  WizardForm.StatusLabel.Caption := 'Removing the previous ShoMetrics Helper service registration...';
  WizardForm.Update;

  if not RunSc('delete ' + Quote(ServiceName), ResultCode) then
  begin
    Result := 'ShoMetrics Helper could not ask Windows to remove the previous service. Restart your PC, then ' + RetryActionText + '.';
    Exit;
  end;

  if ResultCode = ErrorServiceMarkedForDelete then
  begin
    Result := 'Windows is still finishing removal of the previous ShoMetrics Helper service. Restart your PC, then ' + RetryActionText + '.';
    Exit;
  end;

  if (ResultCode <> 0) and (ResultCode <> ErrorServiceDoesNotExist) then
  begin
    Result := 'ShoMetrics Helper could not remove the previous service registration. Restart your PC, then ' + RetryActionText + '. Exit code: ' + IntToStr(ResultCode) + '.';
    Exit;
  end;

  if not WaitForServiceDeleted(ServiceDeleteTimeoutSeconds) then
  begin
    Result := 'Windows has not finished removing the previous ShoMetrics Helper service. Restart your PC, then ' + RetryActionText + '.';
    Exit;
  end;
end;

function StopAndDeleteExistingService(const RetryActionText: String): String;
begin
  Result := StopExistingService(RetryActionText);
  if Result <> '' then
    Exit;

  Result := DeleteExistingService(RetryActionText);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  // Never convert service cleanup failures into Inno's Preparing-page restart
  // flow. If the old service cannot be stopped/deleted cleanly, setup aborts
  // and asks the user to restart manually before trying again.
  NeedsRestart := False;
  Result := StopAndDeleteExistingService('run setup again');
end;

function InstallService: Boolean;
var
  ResultCode: Integer;
  Parameters: String;
begin
  Parameters :=
    'create ' + Quote(ServiceName) +
    ' binPath= ' + Quote(ServiceExePath) +
    ' start= auto' +
    ' obj= LocalSystem' +
    ' DisplayName= ' + Quote(ServiceDisplayName);

  Result := RunSc(Parameters, ResultCode) and (ResultCode = 0);

  if Result then
    RunSc('description ' + Quote(ServiceName) + ' "Provides Windows sensor data for ShoMetrics Stream Deck widgets."', ResultCode);
end;

function ConfigureServiceRecovery: Boolean;
var
  ResultCode: Integer;
begin
  // The trailing empty action is intentional: restart twice, then stop. This
  // recovers from one-off crashes without turning a persistent helper crash
  // into an endless restart loop on the user's machine.
  Result := RunSc(
    'failure ' + Quote(ServiceName) +
    ' reset= 86400' +
    ' actions= restart/5000/restart/30000//',
    ResultCode) and (ResultCode = 0);

  if not Result then
    Exit;

  Result := RunSc('failureflag ' + Quote(ServiceName) + ' 1', ResultCode) and (ResultCode = 0);
end;

function StartService: Boolean;
var
  ResultCode: Integer;
begin
  Result := RunSc('start ' + Quote(ServiceName), ResultCode) and (ResultCode = 0) and
    WaitForServiceRunning(ServiceStartTimeoutSeconds);
end;
