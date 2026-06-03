CommunityToolkit SettingsControls vendoring note
================================================

This directory vendors selected CommunityToolkit Windows SettingsControls source files.

Upstream repository: https://github.com/CommunityToolkit/Windows
Upstream commit: 127413c8d7cfb4262da742ef1af81997687dcf4f
License: MIT, preserved in CommunityToolkit-Windows-LICENSE.md.

TODO: Re-evaluate this vendoring when CommunityToolkit publishes SettingsControls
without pulling the full Microsoft.WindowsAppSDK umbrella package into our
standalone Control Panel publish output. We vendor the source for now because
the NuGet package currently brings Windows App SDK ML dependencies that the
Control Panel does not use, including ONNX Runtime and DirectML payload files.
