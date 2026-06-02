namespace ShoMetrics.Source.Windows.Contracts;

public static class WindowsSourceServicePaths
{
    public static string ResolveLogDirectoryPath()
    {
        // Keep the user-visible log folder product-scoped; "Source.Windows" is
        // an implementation name, not a useful troubleshooting path segment.
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "ShoMetrics",
            "logs");
    }

    public static string ResolveLogFilePath()
    {
        return Path.Combine(ResolveLogDirectoryPath(), "shometrics-helper.log");
    }
}
