using System.Runtime.InteropServices;
using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal interface IWindowsServiceStatusReader
{
    /// <summary>
    /// Reads the ShoMetrics service state from Windows Service Control Manager.
    /// </summary>
    WindowsServiceStatusKind ReadStatus();
}

internal sealed partial class WindowsServiceStatusReader : IWindowsServiceStatusReader
{
    private const uint ScManagerConnect = 0x0001;
    private const uint ServiceQueryStatus = 0x0004;
    private const int ErrorServiceDoesNotExist = 1060;
    private const int ScStatusProcessInfo = 0;

    /// <inheritdoc />
    public WindowsServiceStatusKind ReadStatus()
    {
        nint serviceControlManagerHandle = OpenSCManager(
            machineName: null,
            databaseName: null,
            desiredAccess: ScManagerConnect);

        if (serviceControlManagerHandle == nint.Zero)
        {
            return WindowsServiceStatusKind.QueryFailed;
        }

        try
        {
            nint serviceHandle = OpenService(
                serviceControlManagerHandle,
                WindowsSourceServiceConstants.ServiceName,
                ServiceQueryStatus);

            if (serviceHandle == nint.Zero)
            {
                return Marshal.GetLastPInvokeError() == ErrorServiceDoesNotExist
                    ? WindowsServiceStatusKind.NotInstalled
                    : WindowsServiceStatusKind.QueryFailed;
            }

            try
            {
                ServiceStatusProcess statusProcess = new();
                bool hasStatus = QueryServiceStatusEx(
                    serviceHandle,
                    ScStatusProcessInfo,
                    out statusProcess,
                    Marshal.SizeOf<ServiceStatusProcess>(),
                    out _);

                return hasStatus
                    ? MapServiceState(statusProcess.CurrentState)
                    : WindowsServiceStatusKind.QueryFailed;
            }
            finally
            {
                CloseServiceHandle(serviceHandle);
            }
        }
        finally
        {
            CloseServiceHandle(serviceControlManagerHandle);
        }
    }

    private static WindowsServiceStatusKind MapServiceState(uint serviceState)
    {
        return serviceState switch
        {
            1 => WindowsServiceStatusKind.Stopped,
            2 => WindowsServiceStatusKind.StartPending,
            3 => WindowsServiceStatusKind.StopPending,
            4 => WindowsServiceStatusKind.Running,
            5 => WindowsServiceStatusKind.ContinuePending,
            6 => WindowsServiceStatusKind.PausePending,
            7 => WindowsServiceStatusKind.Paused,
            _ => WindowsServiceStatusKind.Unknown,
        };
    }

    [LibraryImport("advapi32.dll", EntryPoint = "OpenSCManagerW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial nint OpenSCManager(
        string? machineName,
        string? databaseName,
        uint desiredAccess);

    [LibraryImport("advapi32.dll", EntryPoint = "OpenServiceW", SetLastError = true, StringMarshalling = StringMarshalling.Utf16)]
    private static partial nint OpenService(
        nint serviceControlManagerHandle,
        string serviceName,
        uint desiredAccess);

    [LibraryImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool QueryServiceStatusEx(
        nint serviceHandle,
        int infoLevel,
        out ServiceStatusProcess buffer,
        int bufferSize,
        out int bytesNeeded);

    [LibraryImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CloseServiceHandle(nint serviceHandle);

    [StructLayout(LayoutKind.Sequential)]
    private struct ServiceStatusProcess
    {
        public uint ServiceType;
        public uint CurrentState;
        public uint ControlsAccepted;
        public uint Win32ExitCode;
        public uint ServiceSpecificExitCode;
        public uint CheckPoint;
        public uint WaitHint;
        public uint ProcessId;
        public uint ServiceFlags;
    }
}
