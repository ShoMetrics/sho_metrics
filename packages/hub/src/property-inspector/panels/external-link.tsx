import { propertyInspectorExternalUrls, type PropertyInspectorExternalUrl } from "../external-urls";
import { useStreamDeckClient } from "../stream-deck/stream-deck-client-context";

/** Renders a PI link that opens an approved external URL in the default browser. */
export function PropertyInspectorExternalLink({
    children,
    url,
}: {
    readonly children: React.ReactNode;
    readonly url: PropertyInspectorExternalUrl;
}): React.JSX.Element {
    const streamDeckClient = useStreamDeckClient();

    return (
        <button
            type="button"
            role="link"
            style={propertyInspectorExternalLinkStyle}
            onClick={() => {
                void streamDeckClient.openUrl(url);
            }}
        >
            {children}
        </button>
    );
}

/** Renders a PI link that opens the Helper download page in the default browser. */
export function HelperDownloadLink({
    children,
}: {
    readonly children: React.ReactNode;
}): React.JSX.Element {
    return (
        <PropertyInspectorExternalLink url={propertyInspectorExternalUrls.helperDownload}>
            {children}
        </PropertyInspectorExternalLink>
    );
}

const propertyInspectorExternalLinkStyle: React.CSSProperties = {
    appearance: "none",
    background: "transparent",
    border: 0,
    color: "#7DD3FC",
    cursor: "pointer",
    font: "inherit",
    padding: 0,
    textDecoration: "underline",
    // Wrap a literal URL inside the narrow Property Inspector layout.
    overflowWrap: "anywhere",
    textAlign: "left",
};
