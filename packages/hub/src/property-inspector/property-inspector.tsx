import { createRoot } from "react-dom/client";
import { installPropertyInspectorErrorDiagnostics } from "./diagnostics";
import { PropertyInspectorRoot } from "./PropertyInspectorRoot";
import { resolveStreamDeckClient } from "./stream-deck/stream-deck-client";

const rootElement = document.querySelector<HTMLElement>("#property-inspector-root");
const streamDeckClient = resolveStreamDeckClient();

installPropertyInspectorErrorDiagnostics(streamDeckClient, window);

if (!rootElement) {
    throw new Error("Property inspector root element was not found.");
}

createRoot(rootElement).render(<PropertyInspectorRoot client={streamDeckClient} />);
