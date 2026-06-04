using System.Runtime.InteropServices;
using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.Service;

internal sealed partial class WindowsServiceStartCommand
{
    private static readonly TimeSpan StartPollInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan StartTimeout = TimeSpan.FromSeconds(20);

    private const uint ScManagerConnect = 0x0001;
    private const uint ServiceStart = 0x0010;
    private const uint ServiceQueryStatus = 0x0004;
    private const int ErrorAccessDenied = 5;
    private const int ErrorServiceDoesNotExist = 1060;
    private const int ErrorServiceAlreadyRunning = 1056;
    private const int ErrorServiceDisabled = 1058;
    private const int ScStatusProcessInfo = 0;
    private const uint ServiceStateStopped = 1;
    private const uint ServiceStateRunning = 4;

    internal WindowsServiceStartExitCode Start()
    {
        WindowsServiceStartExitCode startResult = StartService();
        if (startResult != WindowsServiceStartExitCode.Success)
        {
            return startResult;
        }

        DateTimeOffset deadline = DateTimeOffset.UtcNow + StartTimeout;
        while (DateTimeOffset.UtcNow < deadline)
        {
            ServiceStatusReadResult serviceStatus = ReadServiceStatus();
            if (serviceStatus.ExitCode != WindowsServiceStartExitCode.Success)
            {
                return serviceStatus.ExitCode;
            }

            if (serviceStatus.CurrentState == ServiceStateRunning)
            {
                return WindowsServiceStartExitCode.Success;
            }

            if (serviceStatus.CurrentState == ServiceStateStopped)
            {
                return WindowsServiceStartExitCode.StartFailed;
            }

            Thread.Sleep(StartPollInterval);
        }

        return WindowsServiceStartExitCode.StartTimedOut;
    }

    private static WindowsServiceStartExitCode StartService()
    {
        nint serviceControlManagerHandle = OpenSCManager(
            machineName: null,
            databaseName: null,
            desiredAccess: ScManagerConnect);

        if (serviceControlManagerHandle == nint.Zero)
        {
            return WindowsServiceStartExitCode.QueryFailed;
        }

        try
        {
            nint serviceHandle = OpenService(
                serviceControlManagerHandle,
                WindowsSourceServiceConstants.ServiceName,
                ServiceStart);

            if (serviceHandle == nint.Zero)
            {
                return MapOpenServiceError(Marshal.GetLastPInvokeError());
            }

            try
            {
                if (StartServiceW(serviceHandle, argumentCount: 0, arguments: nint.Zero))
                {
                    return WindowsServiceStartExitCode.Success;
                }

                int errorCode = Marshal.GetLastPInvokeError();
                return errorCode == ErrorServiceAlreadyRunning
                    ? WindowsServiceStartExitCode.Success
                    : MapStartServiceError(errorCode);
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

    private static ServiceStatusReadResult ReadServiceStatus()
    {
        nint serviceControlManagerHandle = OpenSCManager(
            machineName: null,
            databaseName: null,
            desiredAccess: ScManagerConnect);

        if (serviceControlManagerHandle == nint.Zero)
        {
            return new ServiceStatusReadResult(WindowsServiceStartExitCode.QueryFailed, CurrentState: 0);
        }

        try
        {
            nint serviceHandle = OpenService(
                serviceControlManagerHandle,
                WindowsSourceServiceConstants.ServiceName,
                ServiceQueryStatus);

            if (serviceHandle == nint.Zero)
            {
                return new ServiceStatusReadResult(
                    MapOpenServiceError(Marshal.GetLastPInvokeError()),
                    CurrentState: 0);
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
                    ? new ServiceStatusReadResult(WindowsServiceStartExitCode.Success, statusProcess.CurrentState)
                    : new ServiceStatusReadResult(WindowsServiceStartExitCode.QueryFailed, CurrentState: 0);
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

    private static WindowsServiceStartExitCode MapOpenServiceError(int errorCode)
    {
        return errorCode switch
        {
            ErrorAccessDenied => WindowsServiceStartExitCode.AccessDenied,
            ErrorServiceDoesNotExist => WindowsServiceStartExitCode.NotInstalled,
            _ => WindowsServiceStartExitCode.QueryFailed,
        };
    }

    private static WindowsServiceStartExitCode MapStartServiceError(int errorCode)
    {
        return errorCode switch
        {
            ErrorAccessDenied => WindowsServiceStartExitCode.AccessDenied,
            ErrorServiceDisabled => WindowsServiceStartExitCode.Disabled,
            ErrorServiceDoesNotExist => WindowsServiceStartExitCode.NotInstalled,
            _ => WindowsServiceStartExitCode.StartFailed,
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

    [LibraryImport("advapi32.dll", EntryPoint = "StartServiceW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool StartServiceW(
        nint serviceHandle,
        uint argumentCount,
        nint arguments);

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

    private readonly record struct ServiceStatusReadResult(
        WindowsServiceStartExitCode ExitCode,
        uint CurrentState);

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
