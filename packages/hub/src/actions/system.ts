import { action, PropertyInspectorDidAppearEvent, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { SYSTEM_BATTERY_DEVICE_DESCRIPTOR } from "../runtime/sources/battery/battery-device-descriptor";
import { readVendorHidBatteryDeviceDescriptors } from "../runtime/sources/battery/vendor-hid-battery-source-client";
import { setMetricView } from "../view-updates/runner";
import { logger } from "../logging/logger";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";
import { readResolvedMetricTarget } from "./shared/resolved-metric-target";
import {
    buildSystemViewOptions,
    resolveSystemMetricKeys,
} from "./system/view-builder";

const log = logger.for("Action:System");

/** System action for built-in and supported peripheral battery readings. */
@action({ UUID: STREAM_DECK_ACTION_UUID_BY_KIND.system })
export class System extends MetricAction {
    protected readonly actionKind = "system";

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "system");

        return resolveSystemMetricKeys(target);
    }

    protected onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const target = readResolvedMetricTarget(settings, "system");

        setMetricView(buildSystemViewOptions({
            event,
            settings,
            target,
            metrics: this.getMetricReader(event),
        }));
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        this.refreshBatteryDevicesForPropertyInspector(event).catch(error => {
            log.error(() => `Failed to publish battery devices: ${String(error)}`);
        });
    }

    protected async refreshBatteryDevicesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        const vendorBatteryDevices = await readVendorHidBatteryDeviceDescriptors({
            isExperimentalVendorHidEnabled: this.resolveGlobalVendorHidBatteryEnabled(),
        });

        await this.updateRuntimeCache(event, {
            availableBatteryDevices: [
                SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
                ...vendorBatteryDevices,
            ],
        });
    }

    private resolveGlobalVendorHidBatteryEnabled(): boolean {
        return pluginGlobalSettingsStore.getResolved().system.experimentalVendorHidBatteryEnabled;
    }
}
