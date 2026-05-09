import {
    defaultPluginGlobalSettings,
    normalizePluginGlobalSettings,
    type PluginGlobalSettings,
} from "./widget-settings";

class PluginGlobalSettingsStore {
    private settings: PluginGlobalSettings = { ...defaultPluginGlobalSettings };
    private listeners = new Set<(settings: PluginGlobalSettings) => void>();

    get(): PluginGlobalSettings {
        return this.settings;
    }

    update(rawSettings: unknown): PluginGlobalSettings {
        this.settings = normalizePluginGlobalSettings(rawSettings);
        for (const listener of this.listeners) {
            listener(this.settings);
        }
        return this.settings;
    }

    subscribe(listener: (settings: PluginGlobalSettings) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const pluginGlobalSettingsStore = new PluginGlobalSettingsStore();
