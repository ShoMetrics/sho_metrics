import type { WillAppearEvent } from "@elgato/streamdeck";
import type { MetricStoreReader } from "../../runtime/metric-store";
import {
    SYSTEM_BATTERY_PERCENT_METRIC_KEY,
    buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash,
    buildBluetoothBatteryPercentMetricKey,
} from "../../runtime/metric-keys";
import { buildBatteryMetricKeyFromIdentity } from "../../runtime/sources/battery/battery-metric-key";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedSystemMetricTarget,
    type ResolvedWidgetSettings,
} from "../../settings/resolved-settings";
import type { SingleMetricViewOptions } from "../../view-updates/runner";
import { buildMetricViewIcons } from "../../widgets/icons/metric-view-icons";

const MISSING_BLUETOOTH_PRIMARY_IDENTIFIER_DESCRIPTOR_ID = "missing-primary-identifier";

export function buildSystemViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedSystemMetricTarget;
    readonly metrics: MetricStoreReader;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const metricKey = resolveSystemMetricKey(options.target);

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: widget.slot.appearance,
        metricKey,
        widgetData: options.metrics.getWidgetData(
            metricKey,
            "BATT",
            "%",
            100,
        ),
        ...buildMetricViewIcons({ hardware: "other", status: "percentage" }),
    };
}

export function resolveSystemMetricKeys(target: ResolvedSystemMetricTarget): readonly string[] {
    return [resolveSystemMetricKey(target)];
}

function resolveSystemMetricKey(target: ResolvedSystemMetricTarget): string {
    const peripheralIdentity = target.reading.peripheralIdentity;
    if (peripheralIdentity === undefined) {
        return SYSTEM_BATTERY_PERCENT_METRIC_KEY;
    }

    if (peripheralIdentity.evidence?.kind === "bluetooth") {
        const primaryIdentifier = peripheralIdentity.evidence.primaryIdentifier;
        if (primaryIdentifier === undefined) {
            // Malformed Bluetooth evidence should fail closed without crossing into vendor HID routing.
            return buildBluetoothBatteryPercentMetricKey(MISSING_BLUETOOTH_PRIMARY_IDENTIFIER_DESCRIPTOR_ID);
        }

        const descriptorId = buildBluetoothBatteryDescriptorIdFromPrimaryIdentifierHash(primaryIdentifier.hash);
        return buildBluetoothBatteryPercentMetricKey(descriptorId);
    }

    return buildBatteryMetricKeyFromIdentity(peripheralIdentity);
}
