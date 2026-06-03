using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace ShoMetrics.Source.Windows.ControlPanel.Controls;

public sealed partial class ResponsiveDetailRow : UserControl
{
    private const double MinimumWideValueWidth = 120;
    private const double WideValueWidthRatio = 0.62;

    public static readonly DependencyProperty HeaderProperty = DependencyProperty.Register(
        nameof(Header),
        typeof(string),
        typeof(ResponsiveDetailRow),
        new PropertyMetadata(""));

    public static readonly DependencyProperty DescriptionProperty = DependencyProperty.Register(
        nameof(Description),
        typeof(string),
        typeof(ResponsiveDetailRow),
        new PropertyMetadata(""));

    public static readonly DependencyProperty ValueProperty = DependencyProperty.Register(
        nameof(Value),
        typeof(string),
        typeof(ResponsiveDetailRow),
        new PropertyMetadata(""));

    public static readonly DependencyProperty ValueLabelProperty = DependencyProperty.Register(
        nameof(ValueLabel),
        typeof(string),
        typeof(ResponsiveDetailRow),
        new PropertyMetadata("Status:"));

    public static readonly DependencyProperty ActionTextProperty = DependencyProperty.Register(
        nameof(ActionText),
        typeof(string),
        typeof(ResponsiveDetailRow),
        new PropertyMetadata(""));

    public static readonly DependencyProperty ActionVisibilityProperty = DependencyProperty.Register(
        nameof(ActionVisibility),
        typeof(Visibility),
        typeof(ResponsiveDetailRow),
        new PropertyMetadata(Visibility.Collapsed));

    public static readonly DependencyProperty IsNarrowProperty = DependencyProperty.Register(
        nameof(IsNarrow),
        typeof(bool),
        typeof(ResponsiveDetailRow),
        new PropertyMetadata(false, OnIsNarrowChanged));

    public ResponsiveDetailRow()
    {
        InitializeComponent();
        SizeChanged += OnSizeChanged;
    }

    public event RoutedEventHandler? ActionClick;

    public string Header
    {
        get => (string)GetValue(HeaderProperty);
        set => SetValue(HeaderProperty, value);
    }

    public string Description
    {
        get => (string)GetValue(DescriptionProperty);
        set => SetValue(DescriptionProperty, value);
    }

    public string Value
    {
        get => (string)GetValue(ValueProperty);
        set => SetValue(ValueProperty, value);
    }

    public string ValueLabel
    {
        get => (string)GetValue(ValueLabelProperty);
        set => SetValue(ValueLabelProperty, value);
    }

    public string ActionText
    {
        get => (string)GetValue(ActionTextProperty);
        set => SetValue(ActionTextProperty, value);
    }

    public Visibility ActionVisibility
    {
        get => (Visibility)GetValue(ActionVisibilityProperty);
        set => SetValue(ActionVisibilityProperty, value);
    }

    public bool IsNarrow
    {
        get => (bool)GetValue(IsNarrowProperty);
        set => SetValue(IsNarrowProperty, value);
    }

    private static void OnIsNarrowChanged(DependencyObject dependencyObject, DependencyPropertyChangedEventArgs args)
    {
        ((ResponsiveDetailRow)dependencyObject).ApplyLayoutMode();
    }

    private void OnSizeChanged(object sender, SizeChangedEventArgs args)
    {
        WideValueText.MaxWidth = Math.Max(MinimumWideValueWidth, ActualWidth * WideValueWidthRatio);
    }

    private void ApplyLayoutMode()
    {
        WideLayout.Visibility = IsNarrow ? Visibility.Collapsed : Visibility.Visible;
        NarrowLayout.Visibility = IsNarrow ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnActionButtonClick(object sender, RoutedEventArgs args)
    {
        ActionClick?.Invoke(this, args);
    }
}
