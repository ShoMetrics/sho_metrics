namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

/// <summary>
/// What the panel is expected to say, in the theory table's own vocabulary.
/// </summary>
/// <remarks>
/// UpdateAppcastStatusKind is internal, and a public theory parameter cannot
/// name it. Encoding the expectation as loose booleans to dodge that is what
/// produced a six-boolean row nobody could read, and it let a row spell "not an
/// update, but a critical one", which the panel has no way to be. This names the
/// three outcomes instead, and the theory maps them to the internal kind where
/// the internals are visible.
/// </remarks>
public enum ExpectedUpdateOutcome
{
    UpToDate,
    RoutineUpdate,
    CriticalUpdate,
}

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

    /// <summary>
    /// Every release the feed under test publishes, oldest first.
    /// </summary>
    /// <remarks>
    /// One fixed feed, so a case varies only in what the user has installed and
    /// which releases carry the critical marker. Those are the two inputs urgency
    /// is a function of, and holding the feed still is what makes a case's outcome
    /// attributable to them. Whenever an update is offered it is 0.2.1, because
    /// the newest missed release is always the one to install.
    /// </remarks>
    private static readonly string[] FeedVersions = ["0.0.9", "0.1.0", "0.2.0", "0.2.1"];

    /// <summary>
    /// The installed version, the releases marked critical, and what the panel says.
    /// </summary>
    /// <remarks>
    /// helper-update-notice.test.ts holds this same table. Both surfaces read the
    /// same feed, and a user told to install something urgently in one and
    /// casually in the other trusts neither.
    ///
    /// The expectation is a status kind rather than a pair of booleans. "Not an
    /// update, but a critical one" is not a state the panel has, and a shape that
    /// can spell it is a shape a future case can get wrong.
    /// </remarks>
    public static TheoryData<string, string[], ExpectedUpdateOutcome> UrgencyCases =>
    new()
    {
        // The newest missed release is the critical one.
        { "0.1.0", ["0.2.1"], ExpectedUpdateOutcome.CriticalUpdate },
        // The version-skip case: the user stopped before the critical release, so
        // reading urgency off the newest release alone would tell exactly the user
        // it was published for that the fix is optional. Installing 0.2.1 still
        // carries the fix, so it stays the offer; only the pressure changes.
        { "0.1.0", ["0.2.0"], ExpectedUpdateOutcome.CriticalUpdate },
        { "0.1.0", ["0.2.0", "0.2.1"], ExpectedUpdateOutcome.CriticalUpdate },
        { "0.1.0", [], ExpectedUpdateOutcome.RoutineUpdate },
        // A release the user is already on is not one they are behind. This is the
        // marker that would press forever if urgency were read from the whole feed.
        { "0.1.0", ["0.1.0"], ExpectedUpdateOutcome.RoutineUpdate },
        { "0.1.0", ["0.0.9"], ExpectedUpdateOutcome.RoutineUpdate },
        { "0.1.0", ["0.0.9", "0.1.0"], ExpectedUpdateOutcome.RoutineUpdate },
        { "0.2.1", ["0.2.1"], ExpectedUpdateOutcome.UpToDate },
        { "0.2.1", ["0.2.0"], ExpectedUpdateOutcome.UpToDate },
    };

    [Theory]
    [MemberData(nameof(UrgencyCases))]
    public async Task CheckAsyncClassifiesUrgencyOnlyFromMissedReleases(
        string currentVersion,
        string[] criticalVersions,
        ExpectedUpdateOutcome expectedOutcome)
    {
        string items = string.Join(
            Environment.NewLine,
            FeedVersions.Select(version => BuildAppcastItem(
                version,
                channel: null,
                isCritical: criticalVersions.Contains(version))));
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                {items}
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

        UpdateAppcastStatus status = await client.CheckAsync(currentVersion, CancellationToken.None);

        (UpdateAppcastStatusKind expectedKind, string expectedStatusText) = expectedOutcome switch
        {
            ExpectedUpdateOutcome.UpToDate => (UpdateAppcastStatusKind.UpToDate, "Up to date"),
            ExpectedUpdateOutcome.RoutineUpdate =>
                (UpdateAppcastStatusKind.UpdateAvailable, "Update available: v0.2.1"),
            ExpectedUpdateOutcome.CriticalUpdate =>
                (UpdateAppcastStatusKind.CriticalUpdateAvailable, "Critical update available: v0.2.1"),
            _ => throw new InvalidOperationException($"Unhandled expectation: {expectedOutcome}"),
        };

        Assert.Equal(expectedKind, status.Kind);
        Assert.Equal(expectedStatusText, status.StatusText);
    }

    [Fact]
    public async Task CheckAsyncDoesNotLetACriticalReleaseOnAnotherChannelRaiseUrgency()
    {
        // Urgency is read from the releases this user could install, not from every
        // marker in the feed. A release filtered out for its channel is not one of
        // the former, and counting it would press a user to install something they
        // are never going to be offered.
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                {BuildAppcastItem("0.2.0", "dev", isCritical: true)}
                {BuildAppcastItem("0.2.1", "prod")}
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

        Assert.Equal(UpdateAppcastStatusKind.UpdateAvailable, status.Kind);
        Assert.Equal("Update available: v0.2.1", status.StatusText);
    }

    [Fact]
    public async Task CheckAsyncDoesNotLetACriticalReleaseWithAnUnreadableVersionRaiseUrgency()
    {
        // The same rule for the other reason an item is skipped. A version nothing
        // can compare cannot be shown to be newer than the installed one, so it
        // cannot be shown to be missed either.
        string xml = $"""
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="{UpdateAppcastParser.SparkleNamespaceUri}">
              <channel>
                {BuildAppcastItem("9.bad.0", channel: null, isCritical: true)}
                {BuildAppcastItem("0.2.1", channel: null)}
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

        Assert.Equal(UpdateAppcastStatusKind.UpdateAvailable, status.Kind);
        Assert.Equal("Update available: v0.2.1", status.StatusText);
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

    private static string BuildAppcastItem(string version, string? channel, bool isCritical = false)
    {
        string channelElement = string.IsNullOrWhiteSpace(channel)
            ? ""
            : $"<sparkle:channel>{channel}</sparkle:channel>";
        string criticalElement = isCritical ? "<sparkle:criticalUpdate />" : "";

        return $"""
            <item>
              <title>Version {version}</title>
              <sparkle:version>{version}</sparkle:version>
              <sparkle:shortVersionString>{version}</sparkle:shortVersionString>
              {channelElement}
              {criticalElement}
              <sparkle:releaseNotesLink>https://github.com/ShoMetrics/sho_metrics/releases/tag/v{version}</sparkle:releaseNotesLink>
              <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v{version}/setup.exe"
                         type="application/octet-stream" />
            </item>
            """;
    }
}
