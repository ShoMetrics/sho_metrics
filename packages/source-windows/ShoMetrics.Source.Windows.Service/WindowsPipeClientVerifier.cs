using System.ComponentModel;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace ShoMetrics.Source.Windows.Service;

internal sealed partial class WindowsPipeClientVerifier
{
    private const int ErrorPipeLocal = 229;
    private const int MaximumComputerNameCharacterCount = 256;

    /// <summary>
    /// Verifies that the named-pipe peer is local to this machine.
    /// The pipe ACL already controls user principals; this check rejects remote
    /// named-pipe clients if the transport ever receives one.
    /// </summary>
    public unsafe bool IsLocalClient(NamedPipeServerStream pipeServerStream)
    {
        Span<char> clientComputerNameBuffer = stackalloc char[MaximumComputerNameCharacterCount + 1];
        uint clientComputerNameBufferByteCount = checked((uint)(clientComputerNameBuffer.Length * sizeof(char)));

        bool succeeded;

        fixed (char* clientComputerNameBufferPointer = clientComputerNameBuffer)
        {
            succeeded = GetNamedPipeClientComputerName(
                pipeServerStream.SafePipeHandle,
                clientComputerNameBufferPointer,
                clientComputerNameBufferByteCount);
        }

        if (!succeeded)
        {
            int errorCode = Marshal.GetLastPInvokeError();

            if (errorCode == ErrorPipeLocal)
            {
                // GetNamedPipeClientComputerNameW returns false for the local
                // client path and WinError.h reports 229 as ERROR_PIPE_LOCAL.
                // Repro: Stream Deck Node -> --dev-pipe produced Win32 229
                // before the request loop, so 229 is the local-client signal.
                return true;
            }

            throw new Win32Exception(errorCode);
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
