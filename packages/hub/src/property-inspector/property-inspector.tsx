import { createRoot } from "react-dom/client";
import { App } from "./App";
import { resolveStreamDeckClient } from "./stream-deck/stream-deck-client";

const rootElement = document.querySelector<HTMLElement>("#property-inspector-root");

if (!rootElement) {
    throw new Error("Property inspector root element was not found.");
}

createRoot(rootElement).render(<App client={resolveStreamDeckClient()} />);
