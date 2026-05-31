using System.Globalization;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed record HelperControlPanelStatus
{
    public required DateTimeOffset CheckedAt { get; init; }

    public required HelperServicePanelStatus Service { get; init; }

    public required PawnIoDriverPanelStatus PawnIoDriver { get; init; }

    public required HelperDiagnosticsPanelStatus Diagnostics { get; init; }

    public required string ErrorText { get; init; }

    /// <summary>
    /// Formats the default support bundle text. This intentionally includes
    /// status codes, counts, timestamps, and versions, but not raw hardware tree
    /// dumps or user-profile paths.
    /// </summary>
    public string ToDiagnosticText()
    {
        return string.Join(
            Environment.NewLine,
            [
                "ShoMetrics Helper diagnostics",
                $"Checked: {CheckedAt:O}",
                $"Control Panel version: {ControlPanelIdentity.Version}",
                $"Service: {Service.StatusText}",
                $"Service installed: {Service.InstallText}",
                $"Service runtime: {Service.RuntimeText}",
                $"Service detail: {Service.DetailText}",
                $"Connection: {Service.ConnectionText}",
                $"PawnIO driver: {PawnIoDriver.StatusText}",
                $"PawnIO driver detail: {PawnIoDriver.DetailText}",
                $"Helper version: {Diagnostics.HelperVersionText}",
                $"Protocol: {Diagnostics.ProtocolVersionText}",
                $"Last sample: {Diagnostics.LastSampleText}",
                $"Descriptors: {Diagnostics.DescriptorCountText}",
                $"Sensor diagnostics: {Diagnostics.SensorDiagnosticsText}",
                $"Warnings: {Diagnostics.WarningCountText}",
                $"Diagnostics detail: {Diagnostics.DetailText}",
                $"Warning details: {Diagnostics.WarningDetailsText}",
                $"Error: {ErrorText}",
            ]);
    }

    /// <summary>
    /// Placeholder state shown before the first user-triggered or startup read.
    /// </summary>
    public static HelperControlPanelStatus Initial()
    {
        return new HelperControlPanelStatus
        {
            CheckedAt = DateTimeOffset.Now,
            Service = new HelperServicePanelStatus
            {
                StatusText = "Not checked",
                DetailText = "Refresh to check ShoMetrics Helper.",
                Tone = ControlPanelStatusTone.Unknown,
                CanInstallShoMetricsHelper = false,
                InstallText = "Not checked",
                RuntimeText = "Not checked",
                ConnectionText = "Not checked",
            },
            PawnIoDriver = new PawnIoDriverPanelStatus
            {
                StatusText = "Not checked",
                DetailText = "PawnIO status cannot be checked until ShoMetrics Helper is checked.",
                Tone = ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver = false,
            },
            Diagnostics = new HelperDiagnosticsPanelStatus
            {
                HelperVersionText = "Unknown",
                ProtocolVersionText = "Unknown",
                LastSampleText = "Unknown",
                DescriptorCountText = "Unknown",
                SensorDiagnosticsText = "Sensor diagnostics have not been checked yet.",
                WarningCountText = "Unknown",
                DetailText = "Refresh to check diagnostics.",
                Tone = ControlPanelStatusTone.Unknown,
                HasDetails = false,
                WarningDetailsText = "No warnings.",
            },
            ErrorText = "",
        };
    }

    /// <summary>
    /// Last-resort UI state for failures outside the normal service/helper read
    /// path, such as UI event or clipboard failures.
    /// </summary>
    public static HelperControlPanelStatus FromUnexpectedError(Exception exception)
    {
        return new HelperControlPanelStatus
        {
            CheckedAt = DateTimeOffset.Now,
            Service = new HelperServicePanelStatus
            {
                StatusText = "Unknown",
                DetailText = "Could not read ShoMetrics Helper status.",
                Tone = ControlPanelStatusTone.Unknown,
                CanInstallShoMetricsHelper = false,
                InstallText = "Unknown",
                RuntimeText = "Unknown",
                ConnectionText = "Failed",
            },
            PawnIoDriver = new PawnIoDriverPanelStatus
            {
                StatusText = "Not checked",
                DetailText = "PawnIO status cannot be checked until ShoMetrics Helper is available.",
                Tone = ControlPanelStatusTone.Unknown,
                CanInstallPawnIoDriver = false,
            },
            Diagnostics = new HelperDiagnosticsPanelStatus
            {
                HelperVersionText = "Unknown",
                ProtocolVersionText = "Unknown",
                LastSampleText = "Unknown",
                DescriptorCountText = "Unknown",
                SensorDiagnosticsText = "Sensor diagnostics could not be checked.",
                WarningCountText = "Unknown",
                DetailText = "Could not read diagnostics.",
                Tone = ControlPanelStatusTone.Unknown,
                HasDetails = false,
                WarningDetailsText = "No warnings.",
            },
            ErrorText = FormatException(exception),
        };
    }

    /// <summary>
    /// Formats sample age for display without implying that the panel is
    /// auto-refreshing the helper status.
    /// </summary>
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

    /// <summary>
    /// Keeps unexpected boundary failures compact for user-visible status text
    /// and diagnostics copy.
    /// </summary>
    public static string FormatException(Exception exception)
    {
        return $"{exception.GetType().Name}: {exception.Message}";
    }
}

internal sealed record HelperServicePanelStatus
{
    public required string StatusText { get; init; }

    public required string DetailText { get; init; }

    public required ControlPanelStatusTone Tone { get; init; }

    public required bool CanInstallShoMetricsHelper { get; init; }

    public required string InstallText { get; init; }

    public required string RuntimeText { get; init; }

    public required string ConnectionText { get; init; }
}

internal sealed record PawnIoDriverPanelStatus
{
    public required string StatusText { get; init; }

    public required string DetailText { get; init; }

    public required ControlPanelStatusTone Tone { get; init; }

    public required bool CanInstallPawnIoDriver { get; init; }
}

internal sealed record HelperDiagnosticsPanelStatus
{
    public required string HelperVersionText { get; init; }

    public required string ProtocolVersionText { get; init; }

    public required string LastSampleText { get; init; }

    public required string DescriptorCountText { get; init; }

    public required string SensorDiagnosticsText { get; init; }

    public required string WarningCountText { get; init; }

    public required string DetailText { get; init; }

    public required ControlPanelStatusTone Tone { get; init; }

    public required bool HasDetails { get; init; }

    public required string WarningDetailsText { get; init; }
}

// UI severity for status glyphs only. It is not a helper/source state enum and
// should not be used for source decisions.
internal enum ControlPanelStatusTone
{
    // The component checked successfully and no action is needed.
    Success,

    // The component is available but may need user attention.
    Caution,

    // The component is missing or failing in a way that blocks expected use.
    Critical,

    // The panel could not determine the component state.
    Unknown,
}
