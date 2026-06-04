using ShoMetrics.Source.Windows.Contracts;

namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

public sealed class WindowsServiceStartCommandExitCodeFormatterTests
{
    [Theory]
    [InlineData(WindowsServiceStartExitCode.InvalidCommand, "ShoMetrics Helper service executable received an unsupported command. Reinstall ShoMetrics Helper.")]
    [InlineData(WindowsServiceStartExitCode.AccessDenied, "Administrator permission is required to start the background service.")]
    [InlineData(WindowsServiceStartExitCode.NotInstalled, "The background service is not installed. Reinstall ShoMetrics Helper.")]
    [InlineData(WindowsServiceStartExitCode.Disabled, "The background service is disabled. Reinstall ShoMetrics Helper.")]
    [InlineData(WindowsServiceStartExitCode.StartFailed, "The background service failed to start. Open logs for details.")]
    [InlineData(WindowsServiceStartExitCode.StartTimedOut, "The background service did not finish starting in time. Open logs for details.")]
    [InlineData(WindowsServiceStartExitCode.QueryFailed, "Could not read the background service state. Open logs for details.")]
    public void FormatReturnsUserFacingTextForServiceStartCommandExitCodes(
        WindowsServiceStartExitCode exitCode,
        string expectedText)
    {
        string actualText = WindowsServiceStartCommandExitCodeFormatter.Format((int)exitCode);

        Assert.Equal(expectedText, actualText);
    }

    [Fact]
    public void FormatIncludesUnexpectedExitCode()
    {
        string actualText = WindowsServiceStartCommandExitCodeFormatter.Format(99);

        Assert.Equal("ShoMetrics Helper service start command failed. Exit code: 99.", actualText);
    }
}
