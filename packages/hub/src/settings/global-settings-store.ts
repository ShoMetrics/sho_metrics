import { readGlobalSettings } from "./codec";
import { resolveGlobalSettings } from "./resolver";
import type { GlobalSettings, ResolvedGlobalSettings } from "./widget-settings";

class GlobalSettingsStore {
    private settings: GlobalSettings = {};
    private listeners = new Set<(settings: GlobalSettings) => void>();

    get(): GlobalSettings {
        return this.settings;
    }

    getResolved(): ResolvedGlobalSettings {
        return resolveGlobalSettings(this.settings);
    }

    update(rawSettings: unknown): GlobalSettings {
        this.settings = readGlobalSettings(rawSettings);
        for (const listener of this.listeners) {
            listener(this.settings);
        }
        return this.settings;
    }

    subscribe(listener: (settings: GlobalSettings) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const pluginGlobalSettingsStore = new GlobalSettingsStore();
