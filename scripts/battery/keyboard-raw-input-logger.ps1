param(
  [int]$DurationSeconds = 60,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$source = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class KeyboardRawInputEvent
{
    public int Sequence { get; set; }
    public double ElapsedMilliseconds { get; set; }
    public double? DeltaMilliseconds { get; set; }
    public string DeviceHandle { get; set; }
    public ushort VirtualKey { get; set; }
    public ushort ScanCode { get; set; }
    public ushort Flags { get; set; }
    public uint Message { get; set; }
    public string Direction { get; set; }
}

public sealed class KeyboardRawInputSummary
{
    public int DurationMilliseconds { get; set; }
    public int EventCount { get; set; }
    public int KeyDownCount { get; set; }
    public int KeyUpCount { get; set; }
    public double? AverageDeltaMilliseconds { get; set; }
    public double? P95DeltaMilliseconds { get; set; }
    public double? P99DeltaMilliseconds { get; set; }
    public double? MaxDeltaMilliseconds { get; set; }
    public int GapOver20MillisecondsCount { get; set; }
    public int GapOver50MillisecondsCount { get; set; }
    public int GapOver100MillisecondsCount { get; set; }
}

public sealed class KeyboardRawInputResult
{
    public string StartedAtUtc { get; set; }
    public string FinishedAtUtc { get; set; }
    public KeyboardRawInputSummary Summary { get; set; }
    public List<KeyboardRawInputEvent> Events { get; set; }
}

public static class KeyboardRawInputLogger
{
    public static KeyboardRawInputResult Run(int durationMilliseconds)
    {
        using (KeyboardRawInputContext context = new KeyboardRawInputContext(durationMilliseconds))
        {
            Application.Run(context);
            return context.Result;
        }
    }
}

internal sealed class KeyboardRawInputContext : ApplicationContext
{
    private readonly KeyboardRawInputWindow _window;
    private readonly Timer _timer;

    public KeyboardRawInputContext(int durationMilliseconds)
    {
        _window = new KeyboardRawInputWindow(durationMilliseconds);
        _timer = new Timer();
        _timer.Interval = durationMilliseconds;
        _timer.Tick += OnTimerTick;
        _timer.Start();
    }

    public KeyboardRawInputResult Result
    {
        get { return _window.BuildResult(); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _timer.Dispose();
            _window.Dispose();
        }

        base.Dispose(disposing);
    }

    private void OnTimerTick(object sender, EventArgs eventArgs)
    {
        _timer.Stop();
        ExitThread();
    }
}

internal sealed class KeyboardRawInputWindow : NativeWindow, IDisposable
{
    private const int RIM_TYPEKEYBOARD = 1;
    private const int RID_INPUT = 0x10000003;
    private const int RIDEV_INPUTSINK = 0x00000100;
    private const int WM_INPUT = 0x00FF;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;

    private readonly int _durationMilliseconds;
    private readonly DateTimeOffset _startedAtUtc;
    private readonly Stopwatch _stopwatch;
    private readonly List<KeyboardRawInputEvent> _events = new List<KeyboardRawInputEvent>();
    private double? _previousElapsedMilliseconds;
    private bool _disposed;

    public KeyboardRawInputWindow(int durationMilliseconds)
    {
        _durationMilliseconds = durationMilliseconds;
        _startedAtUtc = DateTimeOffset.UtcNow;
        _stopwatch = Stopwatch.StartNew();

        CreateParams createParams = new CreateParams();
        createParams.Caption = "ShoMetricsKeyboardRawInputLogger";
        createParams.X = -32000;
        createParams.Y = -32000;
        createParams.Width = 1;
        createParams.Height = 1;
        CreateHandle(createParams);

        RegisterKeyboard();
    }

    public KeyboardRawInputResult BuildResult()
    {
        return new KeyboardRawInputResult
        {
            StartedAtUtc = _startedAtUtc.ToString("O"),
            FinishedAtUtc = DateTimeOffset.UtcNow.ToString("O"),
            Summary = BuildSummary(),
            Events = _events,
        };
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        DestroyHandle();
        _disposed = true;
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WM_INPUT)
        {
            ReadKeyboardInput(message.LParam);
        }

        base.WndProc(ref message);
    }

    private void RegisterKeyboard()
    {
        RAWINPUTDEVICE[] devices = new RAWINPUTDEVICE[]
        {
            new RAWINPUTDEVICE
            {
                UsagePage = 0x01,
                Usage = 0x06,
                Flags = RIDEV_INPUTSINK,
                TargetWindow = Handle,
            },
        };

        if (!RegisterRawInputDevices(devices, (uint)devices.Length, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))))
        {
            throw new InvalidOperationException("RegisterRawInputDevices failed with Win32 error " + Marshal.GetLastWin32Error() + ".");
        }
    }

    private void ReadKeyboardInput(IntPtr rawInputHandle)
    {
        uint rawInputSize = 0;
        uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));
        uint sizeResult = GetRawInputData(rawInputHandle, RID_INPUT, IntPtr.Zero, ref rawInputSize, headerSize);
        if (sizeResult == uint.MaxValue || rawInputSize == 0)
        {
            return;
        }

        IntPtr rawInputBuffer = Marshal.AllocHGlobal((int)rawInputSize);
        try
        {
            uint readResult = GetRawInputData(rawInputHandle, RID_INPUT, rawInputBuffer, ref rawInputSize, headerSize);
            if (readResult == uint.MaxValue || readResult != rawInputSize)
            {
                return;
            }

            RAWINPUTHEADER header = (RAWINPUTHEADER)Marshal.PtrToStructure(rawInputBuffer, typeof(RAWINPUTHEADER));
            if (header.Type != RIM_TYPEKEYBOARD)
            {
                return;
            }

            IntPtr keyboardPointer = IntPtr.Add(rawInputBuffer, Marshal.SizeOf(typeof(RAWINPUTHEADER)));
            RAWKEYBOARD keyboard = (RAWKEYBOARD)Marshal.PtrToStructure(keyboardPointer, typeof(RAWKEYBOARD));
            double elapsedMilliseconds = _stopwatch.Elapsed.TotalMilliseconds;
            double? deltaMilliseconds = _previousElapsedMilliseconds.HasValue
                ? elapsedMilliseconds - _previousElapsedMilliseconds.Value
                : (double?)null;
            _previousElapsedMilliseconds = elapsedMilliseconds;

            _events.Add(new KeyboardRawInputEvent
            {
                Sequence = _events.Count + 1,
                ElapsedMilliseconds = Math.Round(elapsedMilliseconds, 3),
                DeltaMilliseconds = deltaMilliseconds.HasValue ? Math.Round(deltaMilliseconds.Value, 3) : (double?)null,
                DeviceHandle = "0x" + header.Device.ToInt64().ToString("X"),
                VirtualKey = keyboard.VirtualKey,
                ScanCode = keyboard.MakeCode,
                Flags = keyboard.Flags,
                Message = keyboard.Message,
                Direction = ResolveDirection(keyboard.Message),
            });
        }
        finally
        {
            Marshal.FreeHGlobal(rawInputBuffer);
        }
    }

    private KeyboardRawInputSummary BuildSummary()
    {
        List<double> deltas = new List<double>();
        int keyDownCount = 0;
        int keyUpCount = 0;
        int gapOver20MillisecondsCount = 0;
        int gapOver50MillisecondsCount = 0;
        int gapOver100MillisecondsCount = 0;

        foreach (KeyboardRawInputEvent keyboardEvent in _events)
        {
            if (keyboardEvent.Direction == "down")
            {
                keyDownCount++;
            }
            else if (keyboardEvent.Direction == "up")
            {
                keyUpCount++;
            }

            if (!keyboardEvent.DeltaMilliseconds.HasValue)
            {
                continue;
            }

            double deltaMilliseconds = keyboardEvent.DeltaMilliseconds.Value;
            deltas.Add(deltaMilliseconds);
            if (deltaMilliseconds > 20)
            {
                gapOver20MillisecondsCount++;
            }
            if (deltaMilliseconds > 50)
            {
                gapOver50MillisecondsCount++;
            }
            if (deltaMilliseconds > 100)
            {
                gapOver100MillisecondsCount++;
            }
        }

        deltas.Sort();

        return new KeyboardRawInputSummary
        {
            DurationMilliseconds = _durationMilliseconds,
            EventCount = _events.Count,
            KeyDownCount = keyDownCount,
            KeyUpCount = keyUpCount,
            AverageDeltaMilliseconds = deltas.Count > 0 ? Math.Round(Average(deltas), 3) : (double?)null,
            P95DeltaMilliseconds = Percentile(deltas, 0.95),
            P99DeltaMilliseconds = Percentile(deltas, 0.99),
            MaxDeltaMilliseconds = deltas.Count > 0 ? Math.Round(deltas[deltas.Count - 1], 3) : (double?)null,
            GapOver20MillisecondsCount = gapOver20MillisecondsCount,
            GapOver50MillisecondsCount = gapOver50MillisecondsCount,
            GapOver100MillisecondsCount = gapOver100MillisecondsCount,
        };
    }

    private static string ResolveDirection(uint message)
    {
        if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN)
        {
            return "down";
        }

        if (message == WM_KEYUP || message == WM_SYSKEYUP)
        {
            return "up";
        }

        return "other";
    }

    private static double Average(List<double> values)
    {
        double sum = 0;
        foreach (double value in values)
        {
            sum += value;
        }

        return sum / values.Count;
    }

    private static double? Percentile(List<double> sortedValues, double percentile)
    {
        if (sortedValues.Count == 0)
        {
            return null;
        }

        int index = (int)Math.Ceiling(sortedValues.Count * percentile) - 1;
        index = Math.Max(0, Math.Min(sortedValues.Count - 1, index));
        return Math.Round(sortedValues[index], 3);
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterRawInputDevices(
        [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] RAWINPUTDEVICE[] rawInputDevices,
        uint deviceCount,
        uint size);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputData(
        IntPtr rawInputHandle,
        uint command,
        IntPtr data,
        ref uint size,
        uint headerSize);

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICE
    {
        public ushort UsagePage;
        public ushort Usage;
        public int Flags;
        public IntPtr TargetWindow;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTHEADER
    {
        public int Type;
        public int Size;
        public IntPtr Device;
        public IntPtr WParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWKEYBOARD
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VirtualKey;
        public uint Message;
        public uint ExtraInformation;
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies @("System.Windows.Forms")

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $PSScriptRoot ("keyboard-raw-input-output-{0}.json" -f $PID)
}

$durationMilliseconds = $DurationSeconds * 1000
$result = [KeyboardRawInputLogger]::Run($durationMilliseconds)
$result | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $OutputPath

$summary = [ordered]@{
  outputPath = (Resolve-Path -LiteralPath $OutputPath).Path
  durationSeconds = $DurationSeconds
  eventCount = $result.Summary.EventCount
  keyDownCount = $result.Summary.KeyDownCount
  keyUpCount = $result.Summary.KeyUpCount
  averageDeltaMilliseconds = $result.Summary.AverageDeltaMilliseconds
  p95DeltaMilliseconds = $result.Summary.P95DeltaMilliseconds
  p99DeltaMilliseconds = $result.Summary.P99DeltaMilliseconds
  maxDeltaMilliseconds = $result.Summary.MaxDeltaMilliseconds
  gapOver20MillisecondsCount = $result.Summary.GapOver20MillisecondsCount
  gapOver50MillisecondsCount = $result.Summary.GapOver50MillisecondsCount
  gapOver100MillisecondsCount = $result.Summary.GapOver100MillisecondsCount
}

$summary | ConvertTo-Json -Depth 3
