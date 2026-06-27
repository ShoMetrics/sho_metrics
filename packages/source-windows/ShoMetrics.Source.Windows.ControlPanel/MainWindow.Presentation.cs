using System.Globalization;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow
{
    private void ApplyStatus(HelperControlPanelStatus status)
    {
        _currentStatus = status;

        ServiceTileStatusText.Text = status.Service.StatusText;
        ServiceTileDetailText.Text = status.Service.DetailText;
        ServiceInstallDetailText.Text = status.Service.InstallText;
        ServiceRuntimeDetailText.Text = status.Service.RuntimeText;
        ConnectionDetailText.Text = status.Service.ConnectionText;
        ApplyStatusIcon(ServiceTileStatusIcon, status.Service.Tone);
        Visibility serviceInstallVisibility = status.Service.CanInstallShoMetricsHelper
            ? Visibility.Visible
            : Visibility.Collapsed;
        ApplyServicePrimaryAction(status.Service);
        ServiceInstallDetailButton.Visibility = serviceInstallVisibility;
        ServiceTileRecoveryText.Text = ResolveServiceRecoveryText(status.Service);
        ServiceTileRecoveryText.Visibility = status.Service.CanStartBackgroundService
            ? Visibility.Visible
            : Visibility.Collapsed;
        ServiceStatusText.Text = status.Service.StatusText;
        PawnIoDriverText.Text = status.PawnIoDriver.StatusText;
        PawnIoDriverDetailText.Text = status.PawnIoDriver.DetailText;
        PawnIoInstallButton.Visibility = status.PawnIoDriver.CanInstallPawnIoDriver
            ? Visibility.Visible
            : Visibility.Collapsed;
        ApplyStatusIcon(PawnIoDriverStatusIcon, status.PawnIoDriver.Tone);
        PanelVersionText.Text = ControlPanelIdentity.Version;
        HelperVersionText.Text = status.Diagnostics.HelperVersionText;
        ProtocolText.Text = status.Diagnostics.ProtocolVersionText;
        SensorDiagnosticsText.Text = status.Diagnostics.SensorDiagnosticsText;
        WarningCountText.Text = status.Diagnostics.WarningCountText;
        WarningCountSummaryText.Text = status.Diagnostics.WarningCountText;
        DiagnosticsDetailText.Text = status.Diagnostics.DetailText;
        DiagnosticsSummaryDetailText.Text = status.Diagnostics.DetailText;
        WarningDetailsText.Text = status.Diagnostics.WarningDetailsText;
        ApplyStatusIcon(DiagnosticsStatusIcon, status.Diagnostics.Tone);
        ApplyStatusIcon(DiagnosticsSummaryStatusIcon, status.Diagnostics.Tone);
        DiagnosticsSummaryCard.Visibility = status.Diagnostics.HasDetails ? Visibility.Collapsed : Visibility.Visible;
        DiagnosticsDetailsExpander.Visibility = status.Diagnostics.HasDetails ? Visibility.Visible : Visibility.Collapsed;
        ErrorText.Text = status.ErrorText;
        LogFolderText.Text = WindowsSourceServicePaths.ResolveLogDirectoryPath();
        UpdateCheckedAtText(DateTimeOffset.Now);
        UpdateDiagnosticValueTextWidth();
    }

    private void ApplyUpdateAppcastStatus(UpdateAppcastStatus status)
    {
        _currentUpdateStatus = status;

        UpdateVersionText.Text = status.CurrentVersionText;
        UpdateStatusText.Text = status.StatusText;
        UpdateDetailText.Text = status.DetailText;
        UpdateLastCheckedText.Text = status.CheckedAt is null
            ? "Last checked: Never"
            : $"Last checked: {status.CheckedAt.Value:g}";
        UpdateReleaseNotesButton.Visibility = status.HasReleaseNotes ? Visibility.Visible : Visibility.Collapsed;
        UpdateDownloadButton.Visibility = status.HasDownload ? Visibility.Visible : Visibility.Collapsed;
        UpdateStatusText.Foreground = status.Kind == UpdateAppcastStatusKind.CriticalUpdateAvailable
            ? ResolveThemeBrush("SystemFillColorCriticalBrush")
            : ResolveThemeBrush("TextFillColorSecondaryBrush");
    }

    private Visibility ResolveServicePrimaryActionVisibility(HelperServicePanelStatus serviceStatus)
    {
        return serviceStatus.CanInstallShoMetricsHelper || serviceStatus.CanStartBackgroundService
            ? Visibility.Visible
            : Visibility.Collapsed;
    }

    private string ResolveServicePrimaryActionText(HelperServicePanelStatus serviceStatus)
    {
        if (serviceStatus.CanInstallShoMetricsHelper)
        {
            return "Install";
        }

        if (!serviceStatus.CanStartBackgroundService)
        {
            return "";
        }

        return "Start";
    }

    private void ApplyServicePrimaryAction(HelperServicePanelStatus serviceStatus)
    {
        string actionText = ResolveServicePrimaryActionText(serviceStatus);
        ServicePrimaryActionButton.Visibility = ResolveServicePrimaryActionVisibility(serviceStatus);
        ServicePrimaryActionText.Text = actionText;
        ServicePrimaryActionAdminIcon.Visibility = serviceStatus.CanStartBackgroundService
            ? Visibility.Visible
            : Visibility.Collapsed;
        AutomationProperties.SetName(ServicePrimaryActionButton, actionText);
    }

    private string ResolveServiceRecoveryText(HelperServicePanelStatus serviceStatus)
    {
        if (!serviceStatus.CanStartBackgroundService)
        {
            return "";
        }

        return "Start the background service to restore sensor checks.";
    }

    private void OnDiagnosticValueCardSizeChanged(object sender, SizeChangedEventArgs args)
    {
        UpdateDiagnosticValueTextWidth();
    }

    private void UpdateDiagnosticValueTextWidth()
    {
        if (WarningDiagnosticsCard.ActualWidth <= 0)
        {
            return;
        }

        // SettingsCard lays each row out independently. Diagnostics rows stretch
        // to the same card width, so use one measured row to give both values a
        // shared right column while capped descriptions leave a visible filler.
        double valueTextWidth = Math.Max(0, WarningDiagnosticsCard.ActualWidth * DiagnosticValueColumnWidthRatio);
        SensorDiagnosticsText.Width = valueTextWidth;
        WarningDetailsText.Width = valueTextWidth;
    }

    private void OnCheckedAtTimerTick(object? sender, object args)
    {
        UpdateCheckedAtText(DateTimeOffset.Now);
    }

    private void UpdateCheckedAtText(DateTimeOffset now)
    {
        if (_currentStatus is null)
        {
            CheckedAtItem.Content = "Not checked";
            return;
        }

        CheckedAtItem.Content = $"Last checked: {FormatCheckedAge(_currentStatus.CheckedAt, now)}";
    }

    private void ApplyStatusIcon(FontIcon icon, ControlPanelStatusTone tone)
    {
        icon.Glyph = tone switch
        {
            ControlPanelStatusTone.Success => SuccessStatusGlyph,
            ControlPanelStatusTone.Caution => CautionStatusGlyph,
            ControlPanelStatusTone.Critical => CriticalStatusGlyph,
            ControlPanelStatusTone.Unknown => UnknownStatusGlyph,
            _ => UnknownStatusGlyph,
        };

        icon.Foreground = tone switch
        {
            ControlPanelStatusTone.Success => ResolveThemeBrush("SystemFillColorSuccessBrush"),
            ControlPanelStatusTone.Caution => ResolveThemeBrush("SystemFillColorCautionBrush"),
            ControlPanelStatusTone.Critical => ResolveThemeBrush("SystemFillColorCriticalBrush"),
            ControlPanelStatusTone.Unknown => ResolveThemeBrush("TextFillColorSecondaryBrush"),
            _ => ResolveThemeBrush("TextFillColorSecondaryBrush"),
        };
    }

    private Brush ResolveThemeBrush(string resourceKey)
    {
        if (Application.Current.Resources.TryGetValue(resourceKey, out object resource) &&
            resource is Brush brush)
        {
            return brush;
        }

        return new SolidColorBrush(ResolveSecondaryIconColor());
    }

    private global::Windows.UI.Color ResolvePrimaryTextColor()
    {
        return RootGrid.ActualTheme == ElementTheme.Dark ? Colors.White : Colors.Black;
    }

    private global::Windows.UI.Color ResolveSecondaryIconColor()
    {
        return RootGrid.ActualTheme == ElementTheme.Dark ? Colors.LightGray : Colors.DimGray;
    }

    private static string FormatCheckedAge(DateTimeOffset timestamp, DateTimeOffset now)
    {
        TimeSpan age = now - timestamp;

        if (age < TimeSpan.Zero)
        {
            age = TimeSpan.Zero;
        }

        if (age.TotalSeconds < 1)
        {
            return "now";
        }

        if (age.TotalMinutes < 1)
        {
            return string.Create(CultureInfo.InvariantCulture, $"{Math.Floor(age.TotalSeconds)}s");
        }

        if (age.TotalHours < 1)
        {
            return string.Create(CultureInfo.InvariantCulture, $"{Math.Floor(age.TotalMinutes)}m");
        }

        if (age.TotalDays < 1)
        {
            return string.Create(CultureInfo.InvariantCulture, $"{Math.Floor(age.TotalHours)}h");
        }

        if (age.TotalDays < 365)
        {
            return string.Create(CultureInfo.InvariantCulture, $"{Math.Floor(age.TotalDays)}d");
        }

        return string.Create(CultureInfo.InvariantCulture, $"{Math.Floor(age.TotalDays / 365)}y");
    }
}
