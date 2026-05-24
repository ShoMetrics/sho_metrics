using System.Globalization;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed record HelperControlPanelStatus
{
    public required DateTimeOffset CheckedAt { get; init; }

    public required string ServiceStatusText { get; init; }

    public required string ServiceInstallText { get; init; }

    public required string ServiceRuntimeText { get; init; }

    public required string ConnectionStatusText { get; init; }

    public required string PawnIoDriverText { get; init; }

    public required string HelperVersionText { get; init; }

    public required string ProtocolVersionText { get; init; }

    public required string LastSampleText { get; init; }

    public required string DescriptorCountText { get; init; }

    public required string WarningCountText { get; init; }

    public required string WarningDetailsText { get; init; }

    public required string ErrorText { get; init; }

    public string ToDiagnosticText()
    {
        return string.Join(
            Environment.NewLine,
            [
                "ShoMetrics Helper diagnostics",
                $"Checked: {CheckedAt:O}",
                $"Service: {ServiceStatusText}",
                $"Service installed: {ServiceInstallText}",
                $"Service runtime: {ServiceRuntimeText}",
                $"Connection: {ConnectionStatusText}",
                $"PawnIO driver: {PawnIoDriverText}",
                $"Version: {HelperVersionText}",
                $"Protocol: {ProtocolVersionText}",
                $"Last sample: {LastSampleText}",
                $"Descriptors: {DescriptorCountText}",
                $"Warnings: {WarningCountText}",
                $"Warning details: {WarningDetailsText}",
                $"Error: {ErrorText}",
            ]);
    }

    public static HelperControlPanelStatus Initial()
    {
        return new HelperControlPanelStatus
        {
            CheckedAt = DateTimeOffset.Now,
            ServiceStatusText = "Not checked",
            ServiceInstallText = "Not checked",
            ServiceRuntimeText = "Not checked",
            ConnectionStatusText = "Not checked",
            PawnIoDriverText = "Not checked",
            HelperVersionText = "Unknown",
            ProtocolVersionText = "Unknown",
            LastSampleText = "Unknown",
            DescriptorCountText = "Unknown",
            WarningCountText = "Unknown",
            WarningDetailsText = "No warnings.",
            ErrorText = "",
        };
    }

    public static HelperControlPanelStatus FromUnexpectedError(Exception exception)
    {
        return new HelperControlPanelStatus
        {
            CheckedAt = DateTimeOffset.Now,
            ServiceStatusText = "Unknown",
            ServiceInstallText = "Unknown",
            ServiceRuntimeText = "Unknown",
            ConnectionStatusText = "Failed",
            PawnIoDriverText = "Unknown",
            HelperVersionText = "Unknown",
            ProtocolVersionText = "Unknown",
            LastSampleText = "Unknown",
            DescriptorCountText = "Unknown",
            WarningCountText = "Unknown",
            WarningDetailsText = "No warnings.",
            ErrorText = FormatException(exception),
        };
    }

    public static string FormatSampleAge(DateTimeOffset? sampleCapturedAt, DateTimeOffset now)
    {
        if (sampleCapturedAt is null)
        {
            return "No sample";
        }

        TimeSpan age = now - sampleCapturedAt.Value;

        if (age < TimeSpan.Zero)
        {
            age = TimeSpan.Zero;
        }

        if (age.TotalSeconds < 1)
        {
            return "<1s ago";
        }

        if (age.TotalMinutes < 1)
        {
            return string.Create(
                CultureInfo.InvariantCulture,
                $"{Math.Floor(age.TotalSeconds)}s ago");
        }

        return string.Create(
            CultureInfo.InvariantCulture,
            $"{Math.Floor(age.TotalMinutes)}m {age.Seconds}s ago");
    }

    public static string FormatException(Exception exception)
    {
        return $"{exception.GetType().Name}: {exception.Message}";
    }
}
