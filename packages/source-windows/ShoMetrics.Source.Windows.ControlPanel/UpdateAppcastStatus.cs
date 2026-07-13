namespace ShoMetrics.Source.Windows.ControlPanel;

internal sealed record UpdateAppcastStatus
{
    public required UpdateAppcastStatusKind Kind { get; init; }

    public required DateTimeOffset? CheckedAt { get; init; }

    public required string CurrentVersionText { get; init; }

    public required string StatusText { get; init; }

    public required string DetailText { get; init; }

    public required Uri? ReleaseNotesUri { get; init; }

    public required Uri? DownloadUri { get; init; }

    public bool HasReleaseNotes => ReleaseNotesUri is not null;

    public bool HasDownload => DownloadUri is not null;

    internal static UpdateAppcastStatus Initial(string currentVersion)
    {
        return new UpdateAppcastStatus
        {
            Kind = UpdateAppcastStatusKind.NotChecked,
            CheckedAt = null,
            CurrentVersionText = FormatDisplayVersion(currentVersion),
            StatusText = "Not checked",
            DetailText = "Check for updates when you want to compare against the appcast feed.",
            ReleaseNotesUri = null,
            DownloadUri = null,
        };
    }

    internal static UpdateAppcastStatus Checking(string currentVersion)
    {
        return new UpdateAppcastStatus
        {
            Kind = UpdateAppcastStatusKind.Checking,
            CheckedAt = null,
            CurrentVersionText = FormatDisplayVersion(currentVersion),
            StatusText = "Checking...",
            DetailText = "Checking the ShoMetrics update feed.",
            ReleaseNotesUri = null,
            DownloadUri = null,
        };
    }

    internal static UpdateAppcastStatus UpToDate(string currentVersion, DateTimeOffset checkedAt)
    {
        return new UpdateAppcastStatus
        {
            Kind = UpdateAppcastStatusKind.UpToDate,
            CheckedAt = checkedAt,
            CurrentVersionText = FormatDisplayVersion(currentVersion),
            StatusText = "Up to date",
            DetailText = "You're up to date.",
            ReleaseNotesUri = null,
            DownloadUri = null,
        };
    }

    /// <summary>
    /// Reports the newest release this install is behind, and how urgently to install it.
    /// </summary>
    /// <param name="updateItem">The newest release missed, which is the one offered.</param>
    /// <param name="isCriticalUpdateMissed">
    /// Whether any release missed was critical, not only <paramref name="updateItem"/>.
    /// The two differ for a user who skipped the critical one: they are behind a fix
    /// that has to be installed, and reading urgency off the newest release alone
    /// would tell precisely that user it is optional.
    /// </param>
    internal static UpdateAppcastStatus UpdateAvailable(
        string currentVersion,
        UpdateAppcastItem updateItem,
        bool isCriticalUpdateMissed,
        DateTimeOffset checkedAt)
    {
        return new UpdateAppcastStatus
        {
            Kind = isCriticalUpdateMissed
                ? UpdateAppcastStatusKind.CriticalUpdateAvailable
                : UpdateAppcastStatusKind.UpdateAvailable,
            CheckedAt = checkedAt,
            CurrentVersionText = FormatDisplayVersion(currentVersion),
            StatusText = isCriticalUpdateMissed
                ? $"Critical update available: {FormatDisplayVersion(updateItem.DisplayVersion)}"
                : $"Update available: {FormatDisplayVersion(updateItem.DisplayVersion)}",
            DetailText = isCriticalUpdateMissed
                ? "Install this update before continuing normal use."
                : "A newer ShoMetrics Helper version is available.",
            ReleaseNotesUri = updateItem.ReleaseNotesUri,
            DownloadUri = updateItem.DownloadUri,
        };
    }

    internal static UpdateAppcastStatus Failed(string currentVersion, DateTimeOffset checkedAt)
    {
        return new UpdateAppcastStatus
        {
            Kind = UpdateAppcastStatusKind.Failed,
            CheckedAt = checkedAt,
            CurrentVersionText = FormatDisplayVersion(currentVersion),
            StatusText = "Could not check",
            DetailText = "The update feed could not be checked.",
            ReleaseNotesUri = null,
            DownloadUri = null,
        };
    }

    private static string FormatDisplayVersion(string version)
    {
        return version.StartsWith("v", StringComparison.OrdinalIgnoreCase)
            ? version
            : $"v{version}";
    }
}

internal enum UpdateAppcastStatusKind
{
    NotChecked,
    Checking,
    UpToDate,
    UpdateAvailable,
    CriticalUpdateAvailable,
    Failed,
}
