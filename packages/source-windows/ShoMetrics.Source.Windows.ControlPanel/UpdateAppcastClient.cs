using System.Security;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed class UpdateAppcastClient : IDisposable
{
    private const string ProdAppcastUrl = "https://edwardez.github.io/sho_metrics/update/windows-appcast.xml";
    private const string StagingAppcastUrl = "https://edwardez.github.io/sho_metrics/update/windows-appcast-staging.xml";
    private const string AppcastUrlOverrideEnvironmentVariable = "SHOMETRICS_UPDATE_APPCAST_URL";
    private const string AppcastChannelEnvironmentVariable = "SHOMETRICS_UPDATE_CHANNEL";
    private const int SparklePhasedRolloutGroupCount = 7;
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
            UpdateAppcastItem? latestUpdate = SelectLatestUpdate(feed.Items, currentVersion, _endpoint, checkedAt);

            return latestUpdate is null
                ? UpdateAppcastStatus.UpToDate(currentVersion, checkedAt)
                : UpdateAppcastStatus.UpdateAvailable(currentVersion, latestUpdate, checkedAt);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
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

    private static UpdateAppcastItem? SelectLatestUpdate(
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
            .Where(item => IsAllowedAppcastLink(item.ReleaseNotesUri) && IsAllowedAppcastLink(item.DownloadUri))
            .Where(item => IsReadyForPhasedRollout(item, endpoint.PhasedRolloutGroup, checkedAt))
            .Where(item => IsNewerThanCurrentVersion(item, currentVersion))
            // IsNewerThanCurrentVersion rejects malformed feed versions before
            // this throwing comparer runs; malformed items should be ignored,
            // not make the whole update check fail.
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

        return string.Equals(uri.Host, "github.com", StringComparison.OrdinalIgnoreCase) &&
            uri.AbsolutePath.StartsWith("/edwardez/sho_metrics/releases", StringComparison.Ordinal);
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
                PhasedRolloutGroup = ResolvePhasedRolloutGroup(),
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
            return string.Equals(uri.Host, "edwardez.github.io", StringComparison.OrdinalIgnoreCase) &&
                uri.AbsolutePath.StartsWith("/sho_metrics/update/", StringComparison.Ordinal);
        }

        private static int? ResolvePhasedRolloutGroup()
        {
            string? userSid;
            try
            {
                userSid = WindowsIdentity.GetCurrent().User?.Value;
            }
            catch (Exception exception) when (
                exception is SecurityException ||
                exception is UnauthorizedAccessException ||
                exception is InvalidOperationException)
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(userSid))
            {
                return null;
            }

            byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(userSid));
            int hashPrefix = BitConverter.ToInt32(hash, startIndex: 0) & int.MaxValue;
            return hashPrefix % SparklePhasedRolloutGroupCount;
        }
    }
}

internal enum UpdateAppcastChannel
{
    Prod,
    Staging,
    Dev,
}
