namespace ShoMetrics.Source.Windows.Ipc;

public static class WindowsSourceServicePaths
{
    public static string ResolveLogDirectoryPath()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "ShoMetrics",
            "Source.Windows",
            "logs");
    }

    public static string ResolveLogFilePath()
    {
        return Path.Combine(ResolveLogDirectoryPath(), "shometrics-source-windows.log");
    }
}
