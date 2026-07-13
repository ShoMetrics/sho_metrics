namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed class UpdateAppcastClient : IDisposable
{
    private const string ProdAppcastUrl = "https://shometrics.github.io/update/windows-appcast.xml";
    private const string StagingAppcastUrl = "https://shometrics.github.io/update/windows-appcast-staging.xml";
    private const string AppcastUrlOverrideEnvironmentVariable = "SHOMETRICS_UPDATE_APPCAST_URL";
    private const string AppcastChannelEnvironmentVariable = "SHOMETRICS_UPDATE_CHANNEL";
    private const long MaximumAppcastResponseBytes = 1024 * 1024;

    private readonly Func<Uri, CancellationToken, Task<string>> _fetchAppcastAsync;
    private readonly UpdateAppcastEndpoint _endpoint;
    private readonly bool _ownsHttpClient;
    private readonly HttpClient? _httpClient;

    internal UpdateAppcastClient()
    {
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(8),
            MaxResponseContentBufferSize = MaximumAppcastResponseBytes,
        };
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("ShoMetricsHelper/1.0");
        _fetchAppcastAsync = FetchWithHttpClientAsync;
        _endpoint = UpdateAppcastEndpoint.ResolveDefault();
        _ownsHttpClient = true;
    }

    internal UpdateAppcastClient(
        Func<Uri, CancellationToken, Task<string>> fetchAppcastAsync,
        UpdateAppcastEndpoint endpoint)
    {
        _fetchAppcastAsync = fetchAppcastAsync;
        _endpoint = endpoint;
        _ownsHttpClient = false;
    }

    internal async Task<UpdateAppcastStatus> CheckAsync(string currentVersion, CancellationToken cancellationToken)
    {
        DateTimeOffset checkedAt = DateTimeOffset.Now;

        try
        {
            string xml = await _fetchAppcastAsync(_endpoint.AppcastUri, cancellationToken).ConfigureAwait(false);
            UpdateAppcastFeed feed = UpdateAppcastParser.Parse(xml, _endpoint.AppcastUri);
            IReadOnlyList<UpdateAppcastItem> missedUpdates =
                SelectMissedUpdates(feed.Items, currentVersion, _endpoint, checkedAt);
            UpdateAppcastItem? newestUpdate = SelectNewestUpdate(missedUpdates);

            return newestUpdate is null
                ? UpdateAppcastStatus.UpToDate(currentVersion, checkedAt)
                : UpdateAppcastStatus.UpdateAvailable(
                    currentVersion,
                    newestUpdate,
                    missedUpdates.Any(update => update.IsCritical),
                    checkedAt);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The control panel update check is user-initiated and surfaces a
            // generic Failed state. Keep this quiet unless update-check support
            // cases show that exception details are needed in the product log.
            return UpdateAppcastStatus.Failed(currentVersion, checkedAt);
        }
    }

    /// <summary>
    /// Disposes the HTTP client owned by the production update checker.
    /// </summary>
    public void Dispose()
    {
        if (_ownsHttpClient)
        {
            _httpClient?.Dispose();
        }
    }

    private async Task<string> FetchWithHttpClientAsync(Uri appcastUri, CancellationToken cancellationToken)
    {
        if (appcastUri.Scheme == Uri.UriSchemeFile)
        {
            return await File.ReadAllTextAsync(appcastUri.LocalPath, cancellationToken).ConfigureAwait(false);
        }

        if (_httpClient is null)
        {
            throw new ObjectDisposedException(nameof(UpdateAppcastClient));
        }

        using HttpResponseMessage response = await _httpClient
            .GetAsync(appcastUri, cancellationToken)
            .ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Selects every release this install is behind, not only the newest one.
    /// </summary>
    /// <remarks>
    /// How urgent the update is has to be read from all of them. A user who
    /// stopped at 0.1.0 while 0.2.0 was critical and 0.2.1 was routine is exactly
    /// the user 0.2.0 was published for, and looking only at the newest release
    /// would tell them the fix they are missing is optional. Keep this in step
    /// with selectHelperUpdateNotice in helper-update-notice.ts: the panel and the
    /// Property Inspector read the same feed, and a user who is told to install
    /// something urgently in one and casually in the other trusts neither.
    /// </remarks>
    private static IReadOnlyList<UpdateAppcastItem> SelectMissedUpdates(
        IReadOnlyList<UpdateAppcastItem> items,
        string currentVersion,
        UpdateAppcastEndpoint endpoint,
        DateTimeOffset checkedAt)
    {
        return items
            .Where(item => IsAllowedChannel(item.Channel, endpoint.Channel))
            // The appcast is fetched over HTTPS, but update links can still be
            // edited incorrectly. Keep clickable URLs constrained to our
            // GitHub Releases surface instead of trusting arbitrary feed data.
            //
            // PENDING, and the one place the two surfaces can still disagree: a
            // critical release whose link is wrong is dropped here, so this panel
            // calls the update routine while the Property Inspector calls it
            // required. The Property Inspector reads no URL from the feed at all,
            // so nothing there can drop the item. The published feed is validated
            // against UpdateAppcast.xsd in CI, but the schema constrains the link
            // to any URI rather than to our host, so a release-authoring mistake
            // reaches this.
            //
            // The fix is to move this filter out of the urgency question and apply
            // it only when choosing the release to offer: whether a URL is safe to
            // click and whether the user is behind an urgent fix are two questions,
            // and answering them with one filter is the same conflation that made
            // urgency read off the newest release alone. Left alone for now because
            // it moves a security control, which is not a change to make alongside
            // the one above.
            .Where(item => IsAllowedAppcastLink(item.ReleaseNotesUri) && IsAllowedAppcastLink(item.DownloadUri))
            .Where(item => IsReadyForPhasedRollout(item, endpoint.PhasedRolloutGroup, checkedAt))
            .Where(item => IsNewerThanCurrentVersion(item, currentVersion))
            .ToList();
    }

    /// <summary>
    /// Picks the release to offer, which is always the newest one missed.
    /// </summary>
    /// <remarks>
    /// Which intermediate release carried the urgent fix is not something the user
    /// can act on: installing the newest gets them all of it.
    /// </remarks>
    private static UpdateAppcastItem? SelectNewestUpdate(IReadOnlyList<UpdateAppcastItem> missedUpdates)
    {
        // IsNewerThanCurrentVersion rejected malformed feed versions before this
        // throwing comparer runs; malformed items should be ignored, not make the
        // whole update check fail.
        return missedUpdates
            .OrderByDescending(item => item.Version, Comparer<string>.Create(UpdateVersionComparer.Compare))
            .FirstOrDefault();
    }

    private static bool IsNewerThanCurrentVersion(UpdateAppcastItem item, string currentVersion)
    {
        return UpdateVersionComparer.TryCompare(item.Version, currentVersion, out int comparison) &&
            comparison > 0;
    }

    private static bool IsAllowedChannel(string? itemChannel, UpdateAppcastChannel channel)
    {
        if (string.IsNullOrWhiteSpace(itemChannel))
        {
            return true;
        }

        return channel switch
        {
            UpdateAppcastChannel.Dev => string.Equals(itemChannel, "dev", StringComparison.OrdinalIgnoreCase),
            UpdateAppcastChannel.Staging => string.Equals(itemChannel, "staging", StringComparison.OrdinalIgnoreCase),
            UpdateAppcastChannel.Prod => string.Equals(itemChannel, "prod", StringComparison.OrdinalIgnoreCase),
            _ => false,
        };
    }

    private static bool IsAllowedAppcastLink(Uri? uri)
    {
        if (uri is null)
        {
            return true;
        }

        if (uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        const string releasesPath = "/ShoMetrics/sho_metrics/releases";
        return string.Equals(uri.Host, "github.com", StringComparison.OrdinalIgnoreCase) &&
            (string.Equals(uri.AbsolutePath, releasesPath, StringComparison.OrdinalIgnoreCase) ||
                uri.AbsolutePath.StartsWith(releasesPath + "/", StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsReadyForPhasedRollout(
        UpdateAppcastItem item,
        int? phasedRolloutGroup,
        DateTimeOffset checkedAt)
    {
        if (item.IsCritical ||
            phasedRolloutGroup is null ||
            item.PhasedRolloutInterval is null ||
            item.PublishedAt is null)
        {
            return true;
        }

        // Sparkle exposes one more rollout group after each interval from the
        // item pubDate. Critical updates intentionally bypass this gate.
        TimeSpan elapsedSinceRelease = checkedAt - item.PublishedAt.Value;
        TimeSpan groupDelay = item.PhasedRolloutInterval.Value * phasedRolloutGroup.Value;
        return elapsedSinceRelease >= groupDelay;
    }

    // Keep endpoint/channel resolution local to the appcast boundary. The rest
    // of the UI consumes an UpdateAppcastStatus and should not know whether the
    // feed came from prod, staging, or a DEBUG-only local file override.
    internal sealed record UpdateAppcastEndpoint
    {
        public required Uri AppcastUri { get; init; }

        public required UpdateAppcastChannel Channel { get; init; }

        public required int? PhasedRolloutGroup { get; init; }

        internal static UpdateAppcastEndpoint ResolveDefault()
        {
            UpdateAppcastChannel channel = ResolveChannel();
            Uri appcastUri = ResolveAppcastUri(channel);

            return new UpdateAppcastEndpoint
            {
                AppcastUri = appcastUri,
                Channel = channel,
                PhasedRolloutGroup = UpdatePhasedRollout.ResolveCurrentUserGroup(),
            };
        }

        private static UpdateAppcastChannel ResolveChannel()
        {
            string? channel = Environment.GetEnvironmentVariable(AppcastChannelEnvironmentVariable);
            return channel?.Trim().ToLowerInvariant() switch
            {
                "dev" => UpdateAppcastChannel.Dev,
                "staging" => UpdateAppcastChannel.Staging,
                _ => UpdateAppcastChannel.Prod,
            };
        }

        private static Uri ResolveAppcastUri(UpdateAppcastChannel channel)
        {
            string? overrideUrl = Environment.GetEnvironmentVariable(AppcastUrlOverrideEnvironmentVariable);
            if (!string.IsNullOrWhiteSpace(overrideUrl) &&
                Uri.TryCreate(overrideUrl, UriKind.Absolute, out Uri? overrideUri) &&
                CanUseOverrideUri(overrideUri))
            {
                return overrideUri;
            }

            string defaultUrl = channel == UpdateAppcastChannel.Staging ? StagingAppcastUrl : ProdAppcastUrl;
            return new Uri(defaultUrl);
        }

        private static bool CanUseOverrideUri(Uri uri)
        {
#if DEBUG
            // Local file appcasts are a developer escape hatch for testing the
            // parser/UI without publishing a GitHub Pages feed. Release builds
            // only accept HTTPS appcasts from the expected project path.
            if (uri.Scheme == Uri.UriSchemeFile)
            {
                return true;
            }
#endif

            return uri.Scheme == Uri.UriSchemeHttps && IsAllowedAppcastUri(uri);
        }

        private static bool IsAllowedAppcastUri(Uri uri)
        {
            return string.Equals(uri.Host, "shometrics.github.io", StringComparison.OrdinalIgnoreCase) &&
                uri.AbsolutePath.StartsWith("/update/", StringComparison.Ordinal);
        }

    }
}

internal enum UpdateAppcastChannel
{
    Prod,
    Staging,
    Dev,
}
