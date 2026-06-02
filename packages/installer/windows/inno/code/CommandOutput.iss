function RunHidden(const FileName, Parameters: String; var ResultCode: Integer): Boolean;
begin
  Log('Running: ' + FileName + ' ' + Parameters);
  Result := Exec(FileName, Parameters, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if Result then
    Log('Exit code: ' + IntToStr(ResultCode))
  else
    Log('Launch failed: ' + SysErrorMessage(ResultCode));
end;

function RunSc(const Parameters: String; var ResultCode: Integer): Boolean;
begin
  Result := RunHidden(ExpandConstant('{sys}\sc.exe'), Parameters, ResultCode);
end;

function CaptureCommandOutput(const ToolLabel, ToolPath, Parameters: String; var ResultCode: Integer; var Output: TExecOutput): Boolean;
begin
  Log('Running with captured output: ' + ToolLabel + ' ' + Parameters);
  try
    Result := ExecAndCaptureOutput(
      ToolPath,
      Parameters,
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode,
      Output);
  except
    Log('Failed to capture ' + ToolLabel + ' output: ' + GetExceptionMessage);
    Result := False;
    ResultCode := -1;
  end;
end;

function OutputContainsLeadingStateCode(const Output: TExecOutput; const StateCode: String): Boolean;
var
  Index: Integer;
  ColonIndex: Integer;
  Line: String;
  ValueText: String;
begin
  Result := False;

  for Index := 0 to GetArrayLength(Output.StdOut) - 1 do
  begin
    Line := Output.StdOut[Index];
    // Match numeric SCM states from sc.exe output instead of localized state
    // names such as STOPPED/RUNNING. The numeric codes are stable across UI
    // languages; the surrounding labels are not.
    if (Pos('EXIT_CODE', UpperCase(Line)) > 0) or
      (Pos('CHECKPOINT', UpperCase(Line)) > 0) or
      (Pos('WAIT_HINT', UpperCase(Line)) > 0) or
      (Pos('PID', UpperCase(Line)) > 0) then
      Continue;

    ColonIndex := Pos(':', Line);
    if ColonIndex = 0 then
      Continue;

    ValueText := Trim(Copy(Line, ColonIndex + 1, Length(Line)));
    if (ValueText = StateCode) or (Copy(ValueText, 1, Length(StateCode) + 1) = StateCode + ' ') then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function OutputContainsText(const Output: TExecOutput; const Needle: String): Boolean;
var
  Index: Integer;
  NeedleUpper: String;
begin
  Result := False;
  NeedleUpper := UpperCase(Needle);

  for Index := 0 to GetArrayLength(Output.StdOut) - 1 do
  begin
    if Pos(NeedleUpper, UpperCase(Output.StdOut[Index])) > 0 then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function ControlPanelProcessIsRunning(var QueryFailed: Boolean): Boolean;
var
  ResultCode: Integer;
  Output: TExecOutput;
begin
  QueryFailed := False;

  // The default tasklist table can truncate image names, so use CSV output
  // before matching the shipped Control Panel executable name.
  if not CaptureCommandOutput(
    'tasklist.exe',
    ExpandConstant('{sys}\tasklist.exe'),
    '/FI ' + Quote('IMAGENAME eq ' + ControlPanelProcessName) + ' /FO CSV /NH',
    ResultCode,
    Output) then
  begin
    QueryFailed := True;
    Result := False;
    Exit;
  end;

  if ResultCode <> 0 then
  begin
    QueryFailed := True;
    Result := False;
    Exit;
  end;

  Result := OutputContainsText(Output, ControlPanelProcessName);
end;

function RequireControlPanelClosed(const OperationName: String): String;
var
  QueryFailed: Boolean;
begin
  Result := '';

  if ControlPanelProcessIsRunning(QueryFailed) then
  begin
    Result := 'ShoMetrics Helper is running. Please close it, then run ' + OperationName + ' again.';
    Exit;
  end;

  if QueryFailed then
    Result := 'Setup could not check whether ShoMetrics Helper is still running. Close ShoMetrics Helper if it is open, then run ' + OperationName + ' again.';
end;
