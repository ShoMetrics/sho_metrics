using System.Globalization;
using System.IO;
using System.Text;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal static class ControlPanelStartupLog
{
    private const string LogFileName = "shometrics-control-panel-startup.log";
    private const long LogFileSizeLimitBytes = 1 * 1024 * 1024;
    private const int RetainedLogFileCountLimit = 2;

    public static string LogFilePath => Path.Combine(ResolveLogDirectoryPath(), LogFileName);

    /// <summary>
    /// Writes a startup diagnostic line without risking a panel crash if logging fails.
    /// </summary>
    public static void Write(string message)
    {
        try
        {
            AppendLine($"{DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture)} {message}");
        }
        catch
        {
            // Startup diagnostics must never be able to crash the panel.
        }
    }

    /// <summary>
    /// Writes startup exception details for failures that can happen before XAML UI is available.
    /// </summary>
    public static void WriteException(string message, Exception exception)
    {
        try
        {
            AppendLine($"{DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture)} {message}:{Environment.NewLine}{FormatException(exception)}");
        }
        catch
        {
            // Startup diagnostics must never be able to crash the panel.
        }
    }

    private static void AppendLine(string line)
    {
        string logDirectoryPath = ResolveLogDirectoryPath();
        Directory.CreateDirectory(logDirectoryPath);
        RotateIfNeeded();
        File.AppendAllText(LogFilePath, line + Environment.NewLine);
    }

    private static void RotateIfNeeded()
    {
        // Startup logging is best-effort and intentionally lock-free. If two
        // panel instances rotate at the same time, the caller catches any I/O
        // failure so diagnostics cannot block startup.
        var logFile = new FileInfo(LogFilePath);
        if (!logFile.Exists || logFile.Length < LogFileSizeLimitBytes)
        {
            return;
        }

        for (int index = RetainedLogFileCountLimit; index >= 1; index--)
        {
            string sourcePath = BuildRotatedLogFilePath(index);

            if (!File.Exists(sourcePath))
            {
                continue;
            }

            if (index == RetainedLogFileCountLimit)
            {
                File.Delete(sourcePath);
                continue;
            }

            string targetPath = BuildRotatedLogFilePath(index + 1);
            File.Move(sourcePath, targetPath, overwrite: true);
        }

        File.Move(LogFilePath, BuildRotatedLogFilePath(1), overwrite: true);
    }

    private static string BuildRotatedLogFilePath(int index)
    {
        return Path.Combine(ResolveLogDirectoryPath(), $"{LogFileName}.{index}");
    }

    private static string ResolveLogDirectoryPath()
    {
        // The Control Panel runs as the interactive user. Keep its startup log
        // out of ProgramData so a service-created log directory cannot block it.
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ShoMetrics",
            "ControlPanel",
            "logs");
    }

    private static string FormatException(Exception exception)
    {
        var builder = new StringBuilder();
        Exception? currentException = exception;
        int exceptionIndex = 0;

        while (currentException is not null)
        {
            builder.AppendLine($"--- Exception #{exceptionIndex} ---");
            builder.AppendLine(currentException.GetType().FullName);
            builder.AppendLine(currentException.Message);
            builder.AppendLine($"HResult=0x{currentException.HResult:X8}");
            builder.AppendLine(currentException.StackTrace);

            currentException = currentException.InnerException;
            exceptionIndex++;
        }

        return builder.ToString();
    }
}
