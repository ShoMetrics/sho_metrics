import { propertyInspectorExternalUrls } from "../external-urls";
import { useStreamDeckClient } from "../stream-deck/stream-deck-client-context";

/** Renders a PI link that opens the Helper download page in the default browser. */
export function HelperDownloadLink({
    children,
}: {
    readonly children: React.ReactNode;
}): React.JSX.Element {
    const streamDeckClient = useStreamDeckClient();

    return (
        <button
            type="button"
            role="link"
            className="link-button"
            style={helperDownloadLinkStyle}
            onClick={() => {
                void streamDeckClient.openUrl(propertyInspectorExternalUrls.helperDownload);
            }}
        >
            {children}
        </button>
    );
}

const helperDownloadLinkStyle: React.CSSProperties = {
    appearance: "none",
    background: "transparent",
    border: 0,
    color: "#7DD3FC",
    cursor: "pointer",
    font: "inherit",
    padding: 0,
    textDecoration: "underline",
};
