using System.Globalization;
using System.Xml;
using System.Xml.Linq;

namespace ShoMetrics.Source.Windows.ControlPanel;

// This parser is a deliberately small Sparkle appcast reader, not an updater
// engine. The safety boundary is that ShoMetrics displays notices and opens
// allowlisted release links; it never downloads or executes appcast payloads.
// Notification policy can stay here, but automatic download/install would cross
// into updater-engine territory and must use a maintained updater with signing.
internal static class UpdateAppcastParser
{
    public const string SparkleNamespaceUri = "http://www.andymatuschak.org/xml-namespaces/sparkle";

    private static readonly XNamespace SparkleNamespace = SparkleNamespaceUri;

    internal static UpdateAppcastFeed Parse(string xml, Uri appcastUri)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(xml);
        ArgumentNullException.ThrowIfNull(appcastUri);

        XDocument document = LoadDocument(xml);
        XElement channelElement = document.Root?.Element("channel")
            ?? throw new FormatException("Appcast RSS channel is missing.");

        List<UpdateAppcastItem> items = [];
        foreach (XElement itemElement in channelElement.Elements("item"))
        {
            if (TryParseItem(itemElement, appcastUri, out UpdateAppcastItem? item) &&
                item is not null)
            {
                items.Add(item);
            }
        }

        return new UpdateAppcastFeed
        {
            Items = items,
        };
    }

    private static XDocument LoadDocument(string xml)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersFromEntities = 0,
            MaxCharactersInDocument = 512 * 1024,
        };

        using var stringReader = new StringReader(xml);
        using XmlReader xmlReader = XmlReader.Create(stringReader, settings);
        return XDocument.Load(xmlReader, LoadOptions.None);
    }

    private static bool TryParseItem(XElement itemElement, Uri appcastUri, out UpdateAppcastItem? item)
    {
        XElement? enclosureElement = itemElement.Element("enclosure");
        // Sparkle has supported both the enclosure attribute and the item
        // element over time. ShoMetrics writes the element in its constrained
        // feed, but accepting the attribute keeps the parser compatible with
        // common Sparkle appcasts without accepting URL-derived guesses.
        string? version = ReadTrimmedElementValue(itemElement, SparkleNamespace + "version")
            ?? ReadTrimmedAttributeValue(enclosureElement, SparkleNamespace + "version");

        if (string.IsNullOrWhiteSpace(version))
        {
            item = null;
            return false;
        }

        Uri? downloadUri = ReadUri(ReadTrimmedAttributeValue(enclosureElement, "url"), appcastUri);
        Uri? infoUri = ReadUri(ReadTrimmedElementValue(itemElement, "link"), appcastUri);
        Uri? releaseNotesUri = ReadUri(ReadTrimmedElementValue(itemElement, SparkleNamespace + "releaseNotesLink"), appcastUri);

        if (downloadUri is null && infoUri is null)
        {
            item = null;
            return false;
        }

        string? shortVersion = ReadTrimmedElementValue(itemElement, SparkleNamespace + "shortVersionString")
            ?? ReadTrimmedAttributeValue(enclosureElement, SparkleNamespace + "shortVersionString");
        if (!TryParseOptionalRfc822Date(
                ReadTrimmedElementValue(itemElement, "pubDate"),
                out DateTimeOffset? publishedAt) ||
            !TryParseOptionalRolloutInterval(
                ReadTrimmedElementValue(itemElement, SparkleNamespace + "phasedRolloutInterval"),
                out TimeSpan? phasedRolloutInterval))
        {
            item = null;
            return false;
        }

        item = new UpdateAppcastItem
        {
            Version = version,
            DisplayVersion = string.IsNullOrWhiteSpace(shortVersion) ? version : shortVersion,
            Channel = ReadTrimmedElementValue(itemElement, SparkleNamespace + "channel"),
            PublishedAt = publishedAt,
            PhasedRolloutInterval = phasedRolloutInterval,
            IsCritical = HasCriticalUpdateElement(itemElement),
            ReleaseNotesUri = releaseNotesUri ?? infoUri,
            DownloadUri = downloadUri,
        };
        return true;
    }

    private static string? ReadTrimmedElementValue(XElement parent, XName name)
    {
        string? value = parent.Element(name)?.Value.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string? ReadTrimmedAttributeValue(XElement? parent, XName name)
    {
        string? value = parent?.Attribute(name)?.Value.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static Uri? ReadUri(string? value, Uri baseUri)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return Uri.TryCreate(baseUri, value, out Uri? uri) ? uri : null;
    }

    private static bool TryParseOptionalRfc822Date(string? value, out DateTimeOffset? timestamp)
    {
        timestamp = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces,
            out DateTimeOffset parsedTimestamp))
        {
            timestamp = parsedTimestamp;
            return true;
        }

        return false;
    }

    private static bool TryParseOptionalRolloutInterval(string? value, out TimeSpan? interval)
    {
        interval = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out int seconds) ||
            seconds <= 0)
        {
            return false;
        }

        interval = TimeSpan.FromSeconds(seconds);
        return true;
    }

    private static bool HasCriticalUpdateElement(XElement itemElement)
    {
        return itemElement.Element(SparkleNamespace + "criticalUpdate") is not null ||
            itemElement
                .Elements(SparkleNamespace + "tags")
                .Elements(SparkleNamespace + "criticalUpdate")
                .Any();
    }
}

internal sealed record UpdateAppcastFeed
{
    public required IReadOnlyList<UpdateAppcastItem> Items { get; init; }
}

internal sealed record UpdateAppcastItem
{
    public required string Version { get; init; }

    public required string DisplayVersion { get; init; }

    public required string? Channel { get; init; }

    public required DateTimeOffset? PublishedAt { get; init; }

    public required TimeSpan? PhasedRolloutInterval { get; init; }

    public required bool IsCritical { get; init; }

    public required Uri? ReleaseNotesUri { get; init; }

    public required Uri? DownloadUri { get; init; }
}
