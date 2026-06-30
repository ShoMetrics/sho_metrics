import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/react";
import { App } from "./App";
import type {
    ConnectionInfo,
    DidReceiveGlobalSettingsEvent,
    DidReceiveSettingsEvent,
    EventSource,
    GetSettingsPayload,
    SendToPropertyInspectorEvent,
    StreamDeckMessage,
    StreamDeckPropertyInspectorClient,
} from "./stream-deck/stream-deck-client";

test("app renders the widget tab as the default active tab", () => {
    const markup = renderToStaticMarkup(createElement(
        I18nProvider,
        {
            children: createElement(App, { client: fakePropertyInspectorClient }),
            locale: "en",
        },
    ));

    assert.match(markup, /role="tab" aria-selected="true" data-selected="true">Widget/);
    assert.match(markup, /role="tab" aria-selected="false" data-selected="false">Global/);
});

const fakePropertyInspectorClient: StreamDeckPropertyInspectorClient = {
    message: createNoopEventSource<StreamDeckMessage>(),
    didReceiveSettings: createNoopEventSource<DidReceiveSettingsEvent>(),
    didReceiveGlobalSettings: createNoopEventSource<DidReceiveGlobalSettingsEvent>(),
    sendToPropertyInspector: createNoopEventSource<SendToPropertyInspectorEvent>(),
    connect: async () => undefined,
    getConnectionInfo: async (): Promise<ConnectionInfo> => {
        throw new Error("Server-rendered App test must not request connection info.");
    },
    getSettings: async (): Promise<GetSettingsPayload> => {
        throw new Error("Server-rendered App test must not request widget settings.");
    },
    getGlobalSettings: async (): Promise<GetSettingsPayload> => {
        throw new Error("Server-rendered App test must not request global settings.");
    },
    setSettings: async (): Promise<void> => undefined,
    setGlobalSettings: async (): Promise<void> => undefined,
    openUrl: async (): Promise<void> => undefined,
    get: async <TReceived extends StreamDeckMessage>(): Promise<TReceived> => {
        throw new Error("Server-rendered App test must not send Stream Deck requests.");
    },
    send: async (): Promise<void> => undefined,
};

function createNoopEventSource<TEvent>(): EventSource<TEvent> {
    return {
        subscribe: () => () => undefined,
        unsubscribe: () => undefined,
    };
}
