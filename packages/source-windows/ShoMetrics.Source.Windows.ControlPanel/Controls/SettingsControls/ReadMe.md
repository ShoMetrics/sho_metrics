This folder vendors the minimal CommunityToolkit SettingsControls sources used by
the ShoMetrics Helper Control Panel.

Source: https://github.com/CommunityToolkit/Windows
Package/version used as the baseline: CommunityToolkit.WinUI.Controls.SettingsControls 8.2.251219
License: MIT

Only SettingsCard, SettingsExpander, and their direct template helpers/triggers
are kept so the app can preserve the Windows settings-card layout without
pulling the CommunityToolkit NuGet package's transitive Microsoft.WindowsAppSDK
metapackage dependency.
