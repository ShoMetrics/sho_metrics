import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
    StreamDeckClient,
    type ActionInfo,
    type DidReceiveSettingsEvent,
    type RegistrationInfo,
    type SendToPropertyInspectorEvent,
    type SettingsRecord,
    type StreamDeckMessage,
} from "./stream-deck-client";

const originalWebSocket = globalThis.WebSocket;

class FakeWebSocket {
    static readonly instanceList: FakeWebSocket[] = [];

    readonly sentMessageList: string[] = [];

    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    onopen: ((event: Event) => void) | null = null;

    constructor(readonly url: string) {
        FakeWebSocket.instanceList.push(this);
    }

    send(message: string): void {
        this.sentMessageList.push(message);
    }

    open(): void {
        this.onopen?.(new Event("open"));
    }

    receive(message: StreamDeckMessage): void {
        this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
    }
}

beforeEach(() => {
    FakeWebSocket.instanceList.length = 0;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
});

test("connect registers the property inspector and publishes initial action settings", async () => {
    const client = new StreamDeckClient();
    const receivedEventList: DidReceiveSettingsEvent[] = [];
    client.didReceiveSettings.subscribe((event) => receivedEventList.push(event));

    await connectClient(client);
    const socket = readSingleSocket();

    assert.equal(socket.url, "ws://localhost:1234");
    assert.deepEqual(readSentMessage(socket), {
        event: "registerPropertyInspector",
        uuid: "pi-uuid",
    });
    assert.equal(receivedEventList.length, 1);
    assert.deepEqual(receivedEventList[0]?.payload.settings, {
        graphicType: "text",
    });
});

test("getSettings sends the current action request and waits for the matching settings event", async () => {
    const client = new StreamDeckClient();
    await connectClient(client);
    const socket = readSingleSocket();

    const settingsPromise = client.getSettings();
    await waitForSentMessageCount(socket, 2);

    socket.receive({
        event: "didReceiveSettings",
        action: "other.action",
        context: "other-context",
        device: "device-id",
        payload: {
            settings: {
                graphicType: "text",
            },
        },
    });
    socket.receive({
        event: "didReceiveSettings",
        action: "com.example.action",
        context: "action-context",
        device: "device-id",
        payload: {
            settings: {
                graphicType: "linear",
            },
        },
    });

    assert.deepEqual(readSentMessage(socket, 1), {
        event: "getSettings",
        context: "pi-uuid",
        action: "com.example.action",
    });
    assert.deepEqual(await settingsPromise, {
        settings: {
            graphicType: "linear",
        },
    });
});

test("getGlobalSettings returns the received settings payload", async () => {
    const client = new StreamDeckClient();
    await connectClient(client);
    const socket = readSingleSocket();

    const globalSettingsPromise = client.getGlobalSettings();
    await waitForSentMessageCount(socket, 2);

    socket.receive({
        event: "didReceiveGlobalSettings",
        payload: {
            settings: {
                overrideWidgetAppearance: true,
            },
        },
    });

    assert.deepEqual(readSentMessage(socket, 1), {
        event: "getGlobalSettings",
        context: "pi-uuid",
        action: "com.example.action",
    });
    assert.deepEqual(await globalSettingsPromise, {
        settings: {
            overrideWidgetAppearance: true,
        },
    });
});

test("setSettings and setGlobalSettings send Stream Deck command payloads", async () => {
    const client = new StreamDeckClient();
    await connectClient(client);
    const socket = readSingleSocket();

    await client.setSettings({ graphicType: "circular" });
    await client.setGlobalSettings({ overrideWidgetAppearance: true });

    assert.deepEqual(readSentMessage(socket, 1), {
        event: "setSettings",
        context: "pi-uuid",
        action: "com.example.action",
        payload: {
            graphicType: "circular",
        },
    });
    assert.deepEqual(readSentMessage(socket, 2), {
        event: "setGlobalSettings",
        context: "pi-uuid",
        action: "com.example.action",
        payload: {
            overrideWidgetAppearance: true,
        },
    });
});

test("sendToPropertyInspector subscription can be unsubscribed", async () => {
    const client = new StreamDeckClient();
    await connectClient(client);
    const socket = readSingleSocket();
    const receivedEventList: SendToPropertyInspectorEvent[] = [];
    const unsubscribe = client.sendToPropertyInspector.subscribe((event) => {
        receivedEventList.push(event);
    });

    socket.receive({
        event: "sendToPropertyInspector",
        action: "com.example.action",
        context: "action-context",
        payload: {
            command: "refresh",
        },
    });
    unsubscribe();
    socket.receive({
        event: "sendToPropertyInspector",
        action: "com.example.action",
        context: "action-context",
        payload: {
            command: "ignored",
        },
    });

    assert.deepEqual(receivedEventList.map((event) => event.payload), [
        {
            command: "refresh",
        },
    ]);
});

async function connectClient(client: StreamDeckClient): Promise<void> {
    await client.connect(
        "1234",
        "pi-uuid",
        "registerPropertyInspector",
        createRegistrationInfo(),
        createActionInfo({
            graphicType: "text",
        }),
    );
    readSingleSocket().open();
    await flushPromises();
}

function createRegistrationInfo(): RegistrationInfo {
    return {
        application: {
            platform: "windows",
        },
    };
}

function createActionInfo(settings: SettingsRecord): ActionInfo {
    return {
        action: "com.example.action",
        context: "action-context",
        device: "device-id",
        payload: {
            settings,
        },
    };
}

function readSingleSocket(): FakeWebSocket {
    assert.equal(FakeWebSocket.instanceList.length, 1);
    return FakeWebSocket.instanceList[0] as FakeWebSocket;
}

function readSentMessage(socket: FakeWebSocket, index = 0): StreamDeckMessage {
    return JSON.parse(socket.sentMessageList[index] as string) as StreamDeckMessage;
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

async function waitForSentMessageCount(socket: FakeWebSocket, expectedCount: number): Promise<void> {
    for (let attemptCount = 0; attemptCount < 10; attemptCount += 1) {
        if (socket.sentMessageList.length >= expectedCount) {
            return;
        }

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }

    assert.equal(socket.sentMessageList.length, expectedCount);
}
