using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace ShoMetrics.Source.Windows.Service;

internal sealed partial class WindowsPipeClientVerifier
{
    private const int MaximumComputerNameLength = 256;

    public unsafe bool IsLocalClient(NamedPipeServerStream pipeServerStream)
    {
        Span<char> clientComputerNameBuffer = stackalloc char[MaximumComputerNameLength + 1];

        bool succeeded;

        fixed (char* clientComputerNameBufferPointer = clientComputerNameBuffer)
        {
            succeeded = GetNamedPipeClientComputerName(
                pipeServerStream.SafePipeHandle,
                clientComputerNameBufferPointer,
                (uint)clientComputerNameBuffer.Length);
        }

        if (!succeeded)
        {
            throw new Win32Exception(Marshal.GetLastPInvokeError());
        }

        int terminatorIndex = clientComputerNameBuffer.IndexOf('\0');
        ReadOnlySpan<char> clientComputerName = terminatorIndex >= 0
            ? clientComputerNameBuffer[..terminatorIndex]
            : clientComputerNameBuffer;

        return clientComputerName.Equals(Environment.MachineName.AsSpan(), StringComparison.OrdinalIgnoreCase);
    }

    [LibraryImport("kernel32.dll", EntryPoint = "GetNamedPipeClientComputerNameW", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static unsafe partial bool GetNamedPipeClientComputerName(
        SafePipeHandle pipe,
        char* clientComputerName,
        uint clientComputerNameLength);
}
