namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

public sealed class UpdateAppcastClientTests
{
    private static readonly Uri AppcastUri = new("https://shometrics.github.io/update/windows-appcast.xml");

    [Fact]
    public async Task CheckAsyncReturnsAvailableUpdateFromAllowedFeed()
    {
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(BuildAppcast("0.2.0", channel: null)),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = null,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal(UpdateAppcastStatusKind.UpdateAvailable, status.Kind);
        Assert.Equal("Update available: v0.2.0", status.StatusText);
        Assert.Equal(new Uri("https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/setup.exe"), status.DownloadUri);
    }

    [Fact]
    public async Task CheckAsyncReturnsUpToDateWhenNoVersionIsNewer()
    {
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(BuildAppcast("0.1.0", channel: null)),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = null,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal(UpdateAppcastStatusKind.UpToDate, status.Kind);
        Assert.Equal("Up to date", status.StatusText);
    }

    [Fact]
    public async Task CheckAsyncUsesConfiguredChannel()
    {
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                {BuildAppcastItem("0.2.0", "dev")}
                {BuildAppcastItem("0.3.0", "staging")}
              </channel>
            </rss>
            """;
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(xml),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Staging,
                PhasedRolloutGroup = null,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal("Update available: v0.3.0", status.StatusText);
    }

    [Fact]
    public async Task CheckAsyncChoosesNewestValidUpdate()
    {
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                {BuildAppcastItem("0.2.0", channel: null)}
                {BuildAppcastItem("0.4.0", channel: null)}
                {BuildAppcastItem("0.3.0", channel: null)}
              </channel>
            </rss>
            """;
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(xml),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = null,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal("Update available: v0.4.0", status.StatusText);
    }

    [Fact]
    public async Task CheckAsyncIgnoresMalformedUpdateVersions()
    {
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                {BuildAppcastItem("9.bad.0", channel: null)}
                {BuildAppcastItem("0.2.0", channel: null)}
              </channel>
            </rss>
            """;
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(xml),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = null,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal("Update available: v0.2.0", status.StatusText);
    }

    [Fact]
    public async Task CheckAsyncRejectsUnexpectedDownloadUrl()
    {
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                <item>
                  <sparkle:version>99.0.0</sparkle:version>
                  <enclosure url="https://evil.example/download.exe" type="application/octet-stream" />
                </item>
              </channel>
            </rss>
            """;
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(xml),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = null,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal(UpdateAppcastStatusKind.UpToDate, status.Kind);
    }

    [Fact]
    public async Task CheckAsyncReturnsFailureStatusForInvalidXml()
    {
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult("<rss>"),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = null,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal(UpdateAppcastStatusKind.Failed, status.Kind);
        Assert.Equal("Could not check", status.StatusText);
        Assert.Equal("The update feed could not be checked.", status.DetailText);
    }

    [Fact]
    public async Task CheckAsyncRespectsPhasedRolloutForNonCriticalUpdates()
    {
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                <item>
                  <sparkle:version>0.2.0</sparkle:version>
                  <pubDate>{DateTimeOffset.Now.AddDays(1):r}</pubDate>
                  <sparkle:phasedRolloutInterval>86400</sparkle:phasedRolloutInterval>
                  <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/setup.exe"
                             type="application/octet-stream" />
                </item>
              </channel>
            </rss>
            """;
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(xml),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = 0,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal(UpdateAppcastStatusKind.UpToDate, status.Kind);
    }

    [Fact]
    public async Task CheckAsyncLetsCriticalUpdatesBypassPhasedRollout()
    {
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                <item>
                  <sparkle:version>0.2.0</sparkle:version>
                  <pubDate>{DateTimeOffset.Now.AddDays(1):r}</pubDate>
                  <sparkle:phasedRolloutInterval>86400</sparkle:phasedRolloutInterval>
                  <sparkle:criticalUpdate />
                  <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/setup.exe"
                             type="application/octet-stream" />
                </item>
              </channel>
            </rss>
            """;
        var client = new UpdateAppcastClient(
            (_, _) => Task.FromResult(xml),
            new UpdateAppcastClient.UpdateAppcastEndpoint
            {
                AppcastUri = AppcastUri,
                Channel = UpdateAppcastChannel.Prod,
                PhasedRolloutGroup = 6,
            });

        UpdateAppcastStatus status = await client.CheckAsync("0.1.0", CancellationToken.None);

        Assert.Equal(UpdateAppcastStatusKind.CriticalUpdateAvailable, status.Kind);
    }

    private static string BuildAppcast(string version, string? channel)
    {
        return $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                {BuildAppcastItem(version, channel)}
              </channel>
            </rss>
            """;
    }

    private static string BuildAppcastItem(string version, string? channel)
    {
        string channelElement = string.IsNullOrWhiteSpace(channel)
            ? ""
            : $"<sparkle:channel>{channel}</sparkle:channel>";

        return $"""
            <item>
              <title>Version {version}</title>
              <sparkle:version>{version}</sparkle:version>
              <sparkle:shortVersionString>{version}</sparkle:shortVersionString>
              {channelElement}
              <sparkle:releaseNotesLink>https://github.com/ShoMetrics/sho_metrics/releases/tag/v{version}</sparkle:releaseNotesLink>
              <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v{version}/setup.exe"
                         type="application/octet-stream" />
            </item>
            """;
    }
}
