import { createContext, useContext, type ReactNode } from "react";
import type { StreamDeckPropertyInspectorClient } from "./stream-deck-client";

const StreamDeckClientContext = createContext<StreamDeckPropertyInspectorClient | undefined>(undefined);

export function StreamDeckClientProvider({
    client,
    children,
}: {
    readonly client: StreamDeckPropertyInspectorClient;
    readonly children: ReactNode;
}): React.JSX.Element {
    return (
        <StreamDeckClientContext.Provider value={client}>
            {children}
        </StreamDeckClientContext.Provider>
    );
}

export function useStreamDeckClient(): StreamDeckPropertyInspectorClient {
    const client = useContext(StreamDeckClientContext);
    if (client === undefined) {
        throw new Error("Stream Deck Property Inspector client context is missing.");
    }

    return client;
}
