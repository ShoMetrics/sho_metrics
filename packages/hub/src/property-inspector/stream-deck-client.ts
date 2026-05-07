export interface StreamDeckPropertyInspectorClient {
    didReceiveSettings: {
        subscribe(callback: (event: DidReceiveSettingsEvent) => void): void;
    };
    didReceiveGlobalSettings: {
        subscribe(callback: (event: DidReceiveGlobalSettingsEvent) => void): void;
    };
    getConnectionInfo(): Promise<ConnectionInfo>;
    getSettings(): Promise<GetSettingsPayload>;
    getGlobalSettings(): Promise<GetSettingsPayload>;
    setSettings(settings: SettingsRecord): Promise<void>;
    setGlobalSettings(settings: SettingsRecord): Promise<void>;
}

export type SettingsRecord = Record<string, unknown>;

export interface DidReceiveSettingsEvent {
    payload: {
        settings: SettingsRecord;
    };
}

export interface GetSettingsPayload {
    settings: SettingsRecord;
}

export interface DidReceiveGlobalSettingsEvent {
    payload: {
        settings: SettingsRecord;
    };
}

export interface ConnectionInfo {
    action?: string;
    actionInfo?: {
        action?: string;
        uuid?: string;
    };
    application?: {
        platform?: string;
    };
    info?: {
        application?: {
            platform?: string;
        };
    };
}

declare global {
    interface Window {
        SDPIComponents?: {
            streamDeckClient: StreamDeckPropertyInspectorClient;
        };
    }
}

export function resolveStreamDeckClient(): StreamDeckPropertyInspectorClient {
    const client = window.SDPIComponents?.streamDeckClient;

    if (!client) {
        throw new Error("SDPIComponents streamDeckClient was not found.");
    }

    return client;
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
            ?? navigator.platform
            ?? "",
    ).toLowerCase();

    return platformValue.includes("win");
}
