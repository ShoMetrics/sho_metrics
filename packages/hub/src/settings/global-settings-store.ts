import { logger } from "../logging/node-logger";
import type { ResolvedGlobalSettings } from "./resolved-settings";
import { readStoredGlobalSettings } from "./storage/codec";
import { resolveStoredGlobalSettings } from "./storage/resolver";

type StoredGlobalSettings = ReturnType<typeof readStoredGlobalSettings>["settings"];

const log = logger.for("GlobalSettingsStore");

class GlobalSettingsStore {
    private settings: StoredGlobalSettings = readStoredGlobalSettings(undefined).settings;
    private listeners = new Set<(settings: StoredGlobalSettings) => void>();

    getStored(): StoredGlobalSettings {
        return this.settings;
    }

    getResolved(): ResolvedGlobalSettings {
        return resolveStoredGlobalSettings(this.settings);
    }

    update(rawSettings: unknown): StoredGlobalSettings {
        const globalSettingsRead = readStoredGlobalSettings(rawSettings);
        const readWarning = globalSettingsRead.warning;
        if (readWarning) {
            log.warn(() => `Global settings read warning: ${readWarning.message}`);
        }

        this.settings = globalSettingsRead.settings;
        for (const listener of this.listeners) {
            listener(this.settings);
        }
        return this.settings;
    }

    subscribe(listener: (settings: StoredGlobalSettings) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const pluginGlobalSettingsStore = new GlobalSettingsStore();
