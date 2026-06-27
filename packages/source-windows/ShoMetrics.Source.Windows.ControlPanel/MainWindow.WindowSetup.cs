using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Graphics;
using WinRT.Interop;

namespace ShoMetrics.Source.Windows.ControlPanel;

public partial class MainWindow
{
    private async void OnRootGridLoaded(object sender, RoutedEventArgs args)
    {
        ApplyNavigationLayout(RootGrid.ActualWidth);
        await CheckForUpdatesAutomaticallyAsync().ConfigureAwait(true);
    }

    private void OnRootGridSizeChanged(object sender, SizeChangedEventArgs args)
    {
        ApplyNavigationLayout(args.NewSize.Width);
    }

    private void ApplyNavigationLayout(double windowWidth)
    {
        if (windowWidth <= 0)
        {
            return;
        }

        // Windows responsive guidance treats 1008 effective pixels as the Large breakpoint.
        // Below that, collapse only the navigation pane; content keeps the same wide row layout.
        bool isNavigationMinimal = windowWidth < NavigationMinimalWidthDips;
        if (_isNavigationMinimal == isNavigationMinimal)
        {
            return;
        }

        _isNavigationMinimal = isNavigationMinimal;

        if (isNavigationMinimal)
        {
            Navigation.PaneDisplayMode = NavigationViewPaneDisplayMode.LeftMinimal;
            Navigation.IsPaneOpen = false;
            Navigation.IsPaneToggleButtonVisible = true;
            return;
        }

        Navigation.PaneDisplayMode = NavigationViewPaneDisplayMode.Left;
        Navigation.IsPaneOpen = true;
        Navigation.IsPaneToggleButtonVisible = false;
    }

    private void TryApplyMicaBackdrop()
    {
        try
        {
            SystemBackdrop = new MicaBackdrop();
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("MicaBackdrop failed", exception);
        }
    }

    private void TrySetWindowSizeInDips(int width, int height)
    {
        try
        {
            SetWindowSizeInDips(width, height);
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("SetWindowSizeInDips failed", exception);
        }
    }

    private void TrySetMinimumWindowSizeInDips(int width, int height)
    {
        try
        {
            SetMinimumWindowSizeInDips(width, height);
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("SetMinimumWindowSizeInDips failed", exception);
        }
    }

    private void TryConfigureCustomTitleBar()
    {
        try
        {
            ConfigureCustomTitleBar();
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("ConfigureCustomTitleBar failed", exception);
        }
    }

    private void TryApplyTitleBarTheme()
    {
        try
        {
            ApplyTitleBarTheme();
        }
        catch (Exception exception)
        {
            ControlPanelStartupLog.WriteException("ApplyTitleBarTheme failed", exception);
        }
    }

    private void ConfigureCustomTitleBar()
    {
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        TryApplyTitleBarTheme();
    }

    private void ApplyTitleBarTheme()
    {
        AppWindowTitleBar titleBar = ResolveAppWindow().TitleBar;

        titleBar.ButtonBackgroundColor = Colors.Transparent;
        titleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
        titleBar.ButtonForegroundColor = ResolvePrimaryTextColor();
        titleBar.ButtonInactiveForegroundColor = ResolveSecondaryIconColor();
    }

    private void OnRootGridActualThemeChanged(FrameworkElement sender, object args)
    {
        TryApplyTitleBarTheme();

        if (_currentStatus is not null)
        {
            ApplyStatus(_currentStatus);
        }
    }

    private void OnNavigationSelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem { Tag: string selectedPage })
        {
            return;
        }

        StatusPage.Visibility = selectedPage == "status" ? Visibility.Visible : Visibility.Collapsed;
        AboutPage.Visibility = selectedPage == "about" ? Visibility.Visible : Visibility.Collapsed;
    }

    private void SetWindowSizeInDips(int width, int height)
    {
        nint windowHandle = WindowNative.GetWindowHandle(this);
        double scale = GetDpiForWindow(windowHandle) / 96.0;
        AppWindow appWindow = ResolveAppWindow();
        appWindow.Resize(new SizeInt32(
            ConvertDipToPhysicalPixel(width, scale),
            ConvertDipToPhysicalPixel(height, scale)));
    }

    private void SetMinimumWindowSizeInDips(int width, int height)
    {
        nint windowHandle = WindowNative.GetWindowHandle(this);
        double scale = GetDpiForWindow(windowHandle) / 96.0;

        if (ResolveAppWindow().Presenter is OverlappedPresenter presenter)
        {
            presenter.PreferredMinimumWidth = ConvertDipToPhysicalPixel(width, scale);
            presenter.PreferredMinimumHeight = ConvertDipToPhysicalPixel(height, scale);
        }
    }

    private AppWindow ResolveAppWindow()
    {
        nint windowHandle = WindowNative.GetWindowHandle(this);
        WindowId windowId = Win32Interop.GetWindowIdFromWindow(windowHandle);
        return AppWindow.GetFromWindowId(windowId);
    }

    private static int ConvertDipToPhysicalPixel(int value, double scale)
    {
        return Math.Max(1, (int)Math.Round(value * scale));
    }

    [LibraryImport("user32.dll")]
    private static partial uint GetDpiForWindow(nint windowHandle);
}
