export type SettingsRecord = Record<string, unknown>;

export interface StreamDeckPropertyInspectorClient {
    readonly message: EventSource<StreamDeckMessage>;
    readonly didReceiveSettings: EventSource<DidReceiveSettingsEvent>;
    readonly didReceiveGlobalSettings: EventSource<DidReceiveGlobalSettingsEvent>;
    readonly sendToPropertyInspector: EventSource<SendToPropertyInspectorEvent>;
    connect(
        port: string,
        propertyInspectorUuid: string,
        registerEvent: string,
        registrationInfo: RegistrationInfo,
        actionInfo: ActionInfo,
    ): Promise<void>;
    getConnectionInfo(): Promise<ConnectionInfo>;
    getSettings(): Promise<GetSettingsPayload>;
    getGlobalSettings(): Promise<GetSettingsPayload>;
    setSettings(settings: SettingsRecord): Promise<void>;
    setGlobalSettings(settings: SettingsRecord): Promise<void>;
    get<TReceived extends StreamDeckMessage>(
        sendEvent: string,
        receiveEvent: string,
        isComplete?: (event: TReceived) => boolean,
        payload?: unknown,
    ): Promise<TReceived>;
    send(event: string, payload?: unknown): Promise<void>;
}

export interface EventSource<TEvent> {
    subscribe(callback: EventCallback<TEvent>): () => void;
    unsubscribe(callback: EventCallback<TEvent>): void;
}

export type EventCallback<TEvent> = (event: TEvent) => void;

export interface StreamDeckMessage {
    event: string;
    [key: string]: unknown;
}

export interface GetSettingsPayload {
    settings: SettingsRecord;
    [key: string]: unknown;
}

export interface ActionPayload {
    settings?: SettingsRecord;
    [key: string]: unknown;
}

export interface ActionInfo {
    action?: string;
    context?: string;
    device?: string;
    uuid?: string;
    payload?: ActionPayload;
    [key: string]: unknown;
}

export interface RegistrationInfo {
    application?: {
        platform?: string;
        [key: string]: unknown;
    };
    devices?: Array<{
        id?: string;
        name?: string;
        size?: {
            columns?: number;
            rows?: number;
            [key: string]: unknown;
        };
        type?: number;
        [key: string]: unknown;
    }>;
    plugin?: {
        uuid?: string;
        version?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface ConnectionInfo {
    action?: string;
    actionInfo?: ActionInfo;
    application?: {
        platform?: string;
    };
    info?: RegistrationInfo;
    propertyInspectorUUID?: string;
    registerEvent?: string;
}

export interface DidReceiveSettingsEvent extends StreamDeckMessage {
    action?: string;
    context?: string;
    device?: string;
    event: "didReceiveSettings";
    payload: GetSettingsPayload;
}

export interface DidReceiveGlobalSettingsEvent extends StreamDeckMessage {
    event: "didReceiveGlobalSettings";
    payload: GetSettingsPayload;
}

export interface SendToPropertyInspectorEvent extends StreamDeckMessage {
    action?: string;
    context?: string;
    event: "sendToPropertyInspector";
    payload: unknown;
}

declare global {
    interface Window {
        connectElgatoStreamDeckSocket?: (
            port: string,
            uuid: string,
            event: string,
            info: string,
            actionInfo: string,
        ) => void | Promise<void>;
    }
}

class EventManager<TEvent> implements EventSource<TEvent> {
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

class Deferred<TValue> {
    private readonly promiseValue: Promise<TValue>;
    private resolveValue: ((value: TValue) => void) | undefined;
    private rejectValue: ((reason: Error) => void) | undefined;

    constructor() {
        this.promiseValue = new Promise<TValue>((resolve, reject) => {
            this.resolveValue = resolve;
            this.rejectValue = reject;
        });
    }

    get promise(): Promise<TValue> {
        return this.promiseValue;
    }

    resolve(value: TValue): void {
        this.resolveValue?.(value);
    }

    reject(reason: Error): void {
        this.rejectValue?.(reason);
    }
}

/**
 * Stream Deck Property Inspector websocket client.
 *
 * This is intentionally a small protocol wrapper, not a settings abstraction.
 * It replaces the SDPIComponents runtime dependency while preserving the same
 * public client surface the app uses: event subscriptions plus get/set/send.
 */
export class StreamDeckClient implements StreamDeckPropertyInspectorClient {
    private readonly connection = new Deferred<WebSocket>();
    private readonly connectionInfo = new Deferred<ConnectionInfo>();
    private isInitialized = false;

    readonly message = new EventManager<StreamDeckMessage>();
    readonly didReceiveSettings = new EventManager<DidReceiveSettingsEvent>();
    readonly didReceiveGlobalSettings = new EventManager<DidReceiveGlobalSettingsEvent>();
    readonly sendToPropertyInspector = new EventManager<SendToPropertyInspectorEvent>();

    /**
     * Connects the Property Inspector websocket and registers it with Stream Deck.
     */
    async connect(
        port: string,
        propertyInspectorUuid: string,
        registerEvent: string,
        registrationInfo: RegistrationInfo,
        actionInfo: ActionInfo,
    ): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const nextConnectionInfo: ConnectionInfo = {
            actionInfo,
            info: registrationInfo,
            propertyInspectorUUID: propertyInspectorUuid,
            registerEvent,
        };

        this.connectionInfo.resolve(nextConnectionInfo);

        const initialSettingsEvent = createInitialSettingsEvent(actionInfo);
        if (initialSettingsEvent) {
            this.didReceiveSettings.dispatch(initialSettingsEvent);
        }

        const webSocket = new WebSocket(`ws://localhost:${port}`);
        webSocket.onmessage = (event) => this.handleMessageEvent(event);
        webSocket.onerror = () => {
            this.connection.reject(new Error("Stream Deck Property Inspector websocket failed."));
        };
        webSocket.onopen = () => {
            webSocket.send(JSON.stringify({
                event: registerEvent,
                uuid: propertyInspectorUuid,
            }));
            this.connection.resolve(webSocket);
        };

        this.isInitialized = true;
    }

    /**
     * Gets plugin-wide settings and returns the payload shape consumed by App.
     */
    async getGlobalSettings(): Promise<GetSettingsPayload> {
        const response = await this.get<DidReceiveGlobalSettingsEvent>(
            "getGlobalSettings",
            "didReceiveGlobalSettings",
        );

        return response.payload;
    }

    /**
     * Writes plugin-wide settings.
     */
    setGlobalSettings(settings: SettingsRecord): Promise<void> {
        return this.send("setGlobalSettings", settings);
    }

    /**
     * Gets settings for the current action instance.
     */
    async getSettings(): Promise<GetSettingsPayload> {
        const currentConnectionInfo = await this.getConnectionInfo();
        const actionInfo = currentConnectionInfo.actionInfo;

        if (!actionInfo?.action || !actionInfo.context || !actionInfo.device) {
            throw new Error("Action information is incomplete; cannot request action settings.");
        }

        const response = await this.get<DidReceiveSettingsEvent>(
            "getSettings",
            "didReceiveSettings",
            (event) => event.action === actionInfo.action
                && event.context === actionInfo.context
                && event.device === actionInfo.device,
        );

        return response.payload;
    }

    /**
     * Writes settings for the current action instance.
     */
    setSettings(settings: SettingsRecord): Promise<void> {
        return this.send("setSettings", settings);
    }

    /**
     * Returns Stream Deck registration and action metadata.
     */
    async getConnectionInfo(): Promise<ConnectionInfo> {
        return this.connectionInfo.promise;
    }

    /**
     * Sends one websocket command and resolves when a matching response arrives.
     */
    async get<TReceived extends StreamDeckMessage>(
        sendEvent: string,
        receiveEvent: string,
        isComplete?: (event: TReceived) => boolean,
        payload?: unknown,
    ): Promise<TReceived> {
        const response = new Deferred<TReceived>();

        const listener = (event: StreamDeckMessage): void => {
            if (event.event !== receiveEvent) {
                return;
            }

            const receivedEvent = event as TReceived;
            if (isComplete === undefined || isComplete(receivedEvent)) {
                this.message.unsubscribe(listener);
                response.resolve(receivedEvent);
            }
        };

        this.message.subscribe(listener);
        await this.send(sendEvent, payload);

        return response.promise;
    }

    /**
     * Sends a raw Stream Deck websocket command.
     */
    async send(event: string, payload?: unknown): Promise<void> {
        const currentConnectionInfo = await this.connectionInfo.promise;
        const currentConnection = await this.connection.promise;
        const outboundMessage: StreamDeckMessage = {
            event,
            context: currentConnectionInfo.propertyInspectorUUID,
            action: currentConnectionInfo.actionInfo?.action,
        };

        if (payload !== undefined) {
            outboundMessage.payload = payload;
        }

        currentConnection.send(JSON.stringify(outboundMessage));
    }

    private handleMessageEvent(event: MessageEvent<string>): void {
        const message = parseStreamDeckMessage(event.data);

        switch (message.event) {
            case "didReceiveGlobalSettings":
                this.didReceiveGlobalSettings.dispatch(message as DidReceiveGlobalSettingsEvent);
                break;
            case "didReceiveSettings":
                this.didReceiveSettings.dispatch(message as DidReceiveSettingsEvent);
                break;
            case "sendToPropertyInspector":
                this.sendToPropertyInspector.dispatch(message as SendToPropertyInspectorEvent);
                break;
        }

        this.message.dispatch(message);
    }
}

export const streamDeckClient = new StreamDeckClient();

export function resolveStreamDeckClient(): StreamDeckPropertyInspectorClient {
    return streamDeckClient;
}

/**
 * Installs the Stream Deck global callback used to bootstrap the PI websocket.
 */
export function installStreamDeckPropertyInspectorBridge(targetWindow: Window): void {
    targetWindow.connectElgatoStreamDeckSocket = (
        port,
        propertyInspectorUuid,
        registerEvent,
        serializedRegistrationInfo,
        serializedActionInfo,
    ) => streamDeckClient.connect(
        port,
        propertyInspectorUuid,
        registerEvent,
        parseJsonArgument<RegistrationInfo>(serializedRegistrationInfo, "registration info"),
        parseJsonArgument<ActionInfo>(serializedActionInfo, "action info"),
    );
}

export function readActionUuid(connectionInfo: ConnectionInfo): string {
    return connectionInfo.actionInfo?.action
        ?? connectionInfo.actionInfo?.uuid
        ?? connectionInfo.action
        ?? "";
}

export function resolveIsWindowsPropertyInspector(connectionInfo: ConnectionInfo): boolean {
    const platformValue = String(
        connectionInfo.application?.platform
            ?? connectionInfo.info?.application?.platform
            ?? readNavigatorPlatform()
            ?? "",
    ).toLowerCase();

    return platformValue.includes("win");
}

function createInitialSettingsEvent(actionInfo: ActionInfo): DidReceiveSettingsEvent | null {
    if (!actionInfo.payload?.settings) {
        return null;
    }

    return {
        ...actionInfo,
        event: "didReceiveSettings",
        payload: {
            ...actionInfo.payload,
            settings: actionInfo.payload.settings,
        },
    };
}

function parseStreamDeckMessage(serializedMessage: string): StreamDeckMessage {
    const parsedMessage = JSON.parse(serializedMessage) as unknown;

    if (!isStreamDeckMessage(parsedMessage)) {
        throw new Error("Stream Deck message did not contain an event name.");
    }

    return parsedMessage;
}

function parseJsonArgument<TValue>(serializedValue: string, label: string): TValue {
    try {
        return JSON.parse(serializedValue) as TValue;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid Stream Deck ${label} JSON: ${message}`);
    }
}

function isStreamDeckMessage(value: unknown): value is StreamDeckMessage {
    return Boolean(
        value
            && typeof value === "object"
            && !Array.isArray(value)
            && typeof (value as { event?: unknown }).event === "string",
    );
}

function readNavigatorPlatform(): string {
    return typeof navigator === "undefined" ? "" : navigator.platform;
}

if (typeof window !== "undefined") {
    installStreamDeckPropertyInspectorBridge(window);
}
