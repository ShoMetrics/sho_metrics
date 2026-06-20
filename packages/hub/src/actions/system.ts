import { action, PropertyInspectorDidAppearEvent, WillAppearEvent } from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import { SYSTEM_BATTERY_DEVICE_DESCRIPTOR } from "../runtime/sources/battery/battery-device-descriptor";
import { setMetricView } from "../view-updates/runner";
import { logger } from "../logging/logger";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
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
        this.updateRuntimeCache(event, {
            availableBatteryDevices: [SYSTEM_BATTERY_DEVICE_DESCRIPTOR],
        }).catch(error => {
            log.error(() => `Failed to publish battery devices: ${String(error)}`);
        });
    }
}
