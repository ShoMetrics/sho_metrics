// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

namespace ShoMetrics.Source.Windows.ControlPanel.Controls;
internal static partial class ControlHelpers
{
    internal static bool IsXamlRootAvailable { get; } = global::Windows.Foundation.Metadata.ApiInformation.IsPropertyPresent("Windows.UI.Xaml.UIElement", "XamlRoot");
}
