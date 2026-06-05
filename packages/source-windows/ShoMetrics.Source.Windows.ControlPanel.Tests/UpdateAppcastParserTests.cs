using System.Xml;
using System.Xml.Linq;
using System.Xml.Schema;

namespace ShoMetrics.Source.Windows.ControlPanel.Tests;

public sealed class UpdateAppcastParserTests
{
    private static readonly Uri AppcastUri = new("https://shometrics.github.io/update/windows-appcast.xml");

    [Fact]
    public void ParseReadsSparkleAppcastItemFields()
    {
        UpdateAppcastFeed feed = UpdateAppcastParser.Parse(ValidAppcastXml, AppcastUri);

        UpdateAppcastItem item = Assert.Single(feed.Items);
        Assert.Equal("0.2.0", item.Version);
        Assert.Equal("0.2.0", item.DisplayVersion);
        Assert.Equal("staging", item.Channel);
        Assert.Equal(new Uri("https://github.com/ShoMetrics/sho_metrics/releases/tag/v0.2.0"), item.ReleaseNotesUri);
        Assert.Equal(new Uri("https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/ShoMetrics-Helper-Setup.exe"), item.DownloadUri);
        Assert.Equal(TimeSpan.FromDays(1), item.PhasedRolloutInterval);
        Assert.True(item.IsCritical);
        Assert.NotNull(item.PublishedAt);
    }

    [Fact]
    public void ParseFallsBackToEnclosureVersionForSparkleCompatibility()
    {
        const string xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
              <channel>
                <item>
                  <title>Version 0.2.0</title>
                  <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/setup.exe"
                             sparkle:version="0.2.0"
                             sparkle:shortVersionString="0.2.0"
                             type="application/octet-stream" />
                </item>
              </channel>
            </rss>
            """;

        UpdateAppcastFeed feed = UpdateAppcastParser.Parse(xml, AppcastUri);

        UpdateAppcastItem item = Assert.Single(feed.Items);
        Assert.Equal("0.2.0", item.Version);
        Assert.Equal("0.2.0", item.DisplayVersion);
    }

    [Fact]
    public void ParseSkipsItemsWithoutVersionOrAnyLink()
    {
        const string xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
              <channel>
                <item>
                  <title>No version</title>
                  <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/setup.exe"
                             type="application/octet-stream" />
                </item>
                <item>
                  <sparkle:version>0.3.0</sparkle:version>
                </item>
              </channel>
            </rss>
            """;

        UpdateAppcastFeed feed = UpdateAppcastParser.Parse(xml, AppcastUri);

        Assert.Empty(feed.Items);
    }

    [Fact]
    public void ParseSkipsItemsWithMalformedDateOrRolloutInterval()
    {
        const string xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
              <channel>
                <item>
                  <sparkle:version>0.2.0</sparkle:version>
                  <pubDate>not a date</pubDate>
                  <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/setup.exe"
                             type="application/octet-stream" />
                </item>
                <item>
                  <sparkle:version>0.3.0</sparkle:version>
                  <sparkle:phasedRolloutInterval>never</sparkle:phasedRolloutInterval>
                  <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.3.0/setup.exe"
                             type="application/octet-stream" />
                </item>
                <item>
                  <sparkle:version>0.4.0</sparkle:version>
                  <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.4.0/setup.exe"
                             type="application/octet-stream" />
                </item>
              </channel>
            </rss>
            """;

        UpdateAppcastFeed feed = UpdateAppcastParser.Parse(xml, AppcastUri);

        UpdateAppcastItem item = Assert.Single(feed.Items);
        Assert.Equal("0.4.0", item.Version);
    }

    [Fact]
    public void ParseRejectsDtd()
    {
        const string xml = """
            <!DOCTYPE rss [
              <!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">
            ]>
            <rss version="2.0">
              <channel><item><title>&xxe;</title></item></channel>
            </rss>
            """;

        Assert.Throws<XmlException>(() => UpdateAppcastParser.Parse(xml, AppcastUri));
    }

    [Fact]
    public void ValidAppcastXmlMatchesShoMetricsConstraintSchema()
    {
        XmlSchemaSet schemas = LoadAppcastSchemas();
        XDocument document = XDocument.Parse(ValidAppcastXml);

        document.Validate(schemas, (_, args) => throw args.Exception);
    }

    private static XmlSchemaSet LoadAppcastSchemas()
    {
        string sourceDirectoryPath = ResolveSourceDirectoryPath();
        var schemas = new XmlSchemaSet();
        schemas.Add(
            UpdateAppcastParser.SparkleNamespaceUri,
            Path.Combine(sourceDirectoryPath, "UpdateAppcastSparkle.xsd"));
        schemas.Add("", Path.Combine(sourceDirectoryPath, "UpdateAppcast.xsd"));
        schemas.Compile();
        return schemas;
    }

    private static string ResolveSourceDirectoryPath()
    {
        string sourceWindowsPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
        return Path.Combine(sourceWindowsPath, "ShoMetrics.Source.Windows.ControlPanel");
    }

    private const string ValidAppcastXml = """
        <?xml version="1.0" encoding="utf-8"?>
        <rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
          <channel>
            <title>ShoMetrics Helper Updates</title>
            <link>https://shometrics.github.io/update/windows-appcast.xml</link>
            <description>ShoMetrics Helper update feed.</description>
            <item>
              <title>Version 0.2.0</title>
              <sparkle:version>0.2.0</sparkle:version>
              <sparkle:shortVersionString>0.2.0</sparkle:shortVersionString>
              <sparkle:channel>staging</sparkle:channel>
              <sparkle:releaseNotesLink>https://github.com/ShoMetrics/sho_metrics/releases/tag/v0.2.0</sparkle:releaseNotesLink>
              <pubDate>Mon, 28 Jan 2030 14:30:00 +0000</pubDate>
              <link>https://github.com/ShoMetrics/sho_metrics/releases/tag/v0.2.0</link>
              <sparkle:phasedRolloutInterval>86400</sparkle:phasedRolloutInterval>
              <sparkle:criticalUpdate />
              <enclosure url="https://github.com/ShoMetrics/sho_metrics/releases/download/v0.2.0/ShoMetrics-Helper-Setup.exe"
                         length="123"
                         type="application/octet-stream" />
            </item>
          </channel>
        </rss>
        """;
}
