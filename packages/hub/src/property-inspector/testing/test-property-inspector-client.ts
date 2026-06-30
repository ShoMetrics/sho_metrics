import type {
    ConnectionInfo,
    DidReceiveGlobalSettingsEvent,
    DidReceiveSettingsEvent,
    EventCallback,
    EventSource as StreamDeckEventSource,
    GetSettingsPayload,
    SendToPropertyInspectorEvent,
    SettingsRecord,
    StreamDeckMessage,
    StreamDeckPropertyInspectorClient,
} from "../stream-deck/stream-deck-client";
import type { PropertyInspectorExternalUrl } from "../external-urls";

interface TestPropertyInspectorClientOptions {
    readonly actionUuid: string;
    readonly settings?: SettingsRecord;
    readonly globalSettings?: SettingsRecord;
    readonly language?: string;
    readonly platform?: string;
}

export interface SentStreamDeckMessage {
    readonly event: string;
    readonly payload: unknown;
}

class TestEventSource<TEvent> implements StreamDeckEventSource<TEvent> {
    private readonly callbackSet = new Set<EventCallback<TEvent>>();

    subscribe(callback: EventCallback<TEvent>): () => void {
        this.callbackSet.add(callback);
        return () => this.unsubscribe(callback);
    }

    unsubscribe(callback: EventCallback<TEvent>): void {
        this.callbackSet.delete(callback);
    }

    dispatch(event: TEvent): void {
        for (const callback of [...this.callbackSet]) {
            callback(event);
        }
    }
}

export class TestPropertyInspectorClient implements StreamDeckPropertyInspectorClient {
    private readonly connectionInfo: ConnectionInfo;
    private settings: SettingsRecord;
    private globalSettings: SettingsRecord;

    readonly message = new TestEventSource<StreamDeckMessage>();
    readonly didReceiveSettings = new TestEventSource<DidReceiveSettingsEvent>();
    readonly didReceiveGlobalSettings = new TestEventSource<DidReceiveGlobalSettingsEvent>();
    readonly sendToPropertyInspector = new TestEventSource<SendToPropertyInspectorEvent>();
    readonly setSettingsCalls: SettingsRecord[] = [];
    readonly setGlobalSettingsCalls: SettingsRecord[] = [];
    readonly sentMessages: SentStreamDeckMessage[] = [];

    constructor(options: TestPropertyInspectorClientOptions) {
        this.settings = options.settings ?? {};
        this.globalSettings = options.globalSettings ?? {};
        this.connectionInfo = {
            actionInfo: {
                action: options.actionUuid,
                context: "context-1",
                device: "device-1",
                payload: {
                    settings: this.settings,
                },
            },
            info: {
                application: {
                    language: options.language ?? "en",
                    platform: options.platform ?? "win32",
                },
            },
        };
    }

    async connect(): Promise<void> {
        return;
    }

    async getConnectionInfo(): Promise<ConnectionInfo> {
        return this.connectionInfo;
    }

    async getSettings(): Promise<GetSettingsPayload> {
        return { settings: this.settings };
    }

    async getGlobalSettings(): Promise<GetSettingsPayload> {
        return { settings: this.globalSettings };
    }

    async setSettings(settings: SettingsRecord): Promise<void> {
        this.settings = settings;
        this.setSettingsCalls.push(settings);
    }

    async setGlobalSettings(settings: SettingsRecord): Promise<void> {
        this.globalSettings = settings;
        this.setGlobalSettingsCalls.push(settings);
    }

    async openUrl(url: PropertyInspectorExternalUrl): Promise<void> {
        await this.send("openUrl", { url });
    }

    async get<TReceived extends StreamDeckMessage>(): Promise<TReceived> {
        throw new Error("TestPropertyInspectorClient.get is not implemented for this test.");
    }

    async send(event: string, payload?: unknown): Promise<void> {
        this.sentMessages.push({
            event,
            payload,
        });
    }

    dispatchSendToPropertyInspector(payload: unknown): void {
        this.sendToPropertyInspector.dispatch({
            event: "sendToPropertyInspector",
            payload,
        });
    }
}

export function readTestSettingsRecord(rawSettings: unknown): SettingsRecord {
    if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
        throw new Error("Test settings must be a JSON object.");
    }

    return rawSettings as SettingsRecord;
}
