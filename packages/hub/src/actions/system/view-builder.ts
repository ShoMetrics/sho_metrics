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
import {
    resolveSystemBatteryLabel,
    resolveSystemBatterySecondaryLabel,
    SYSTEM_BATTERY_TITLE_LABEL,
} from "../../settings/system-battery-label";
import {
    resolveMetricCustomLabelDisplayMaximumCharacters,
    resolveMetricCustomLabelKeyShape,
} from "../../settings/metric-custom-label-policy";
import type { SingleMetricViewOptions } from "../../view-updates/runner";
import { TITLE_CARD_BATTERY_CAPTION_TEXT } from "../../view-rendering/text-content/title-card-text-content";
import { getMetricIconFragment } from "../../widgets/icons/metric-icons";
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
    const selectedView = widget.slot.appearance.view.selectedView;
    const displayMaximumLabelCharacters = resolveMetricCustomLabelDisplayMaximumCharacters({
        selectedView,
        keyShape: resolveMetricCustomLabelKeyShape({
            selectedView,
            isTouchStrip: options.event.action.isDial(),
        }),
    });
    const batteryLabel = resolveSystemBatteryLabel({
        customLabel: options.target.reading.customLabel,
        selectedPeripheralDisplayName: options.target.reading.detectedPeripheralDisplayName,
        selectedView,
        circleVariant: widget.slot.appearance.view.circleVariant,
        textVariant: widget.slot.appearance.view.textVariant,
        maximumCharacters: displayMaximumLabelCharacters,
    });
    const secondaryBatteryLabel = resolveSystemBatterySecondaryLabel({
        customLabel: options.target.reading.customLabel,
        selectedPeripheralDisplayName: options.target.reading.detectedPeripheralDisplayName,
        maximumCharacters: displayMaximumLabelCharacters,
    });
    const defaultIcons = buildMetricViewIcons({ hardware: "battery", status: "percentage" });

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: widget.slot.appearance,
        metricKey,
        widgetData: {
            ...options.metrics.getWidgetData(
                metricKey,
                selectedView === "bar" ? SYSTEM_BATTERY_TITLE_LABEL : batteryLabel,
                "%",
                100,
            ),
            ...(selectedView === "bar" ? {
                barLabel: SYSTEM_BATTERY_TITLE_LABEL,
                secondaryDisplayValue: secondaryBatteryLabel,
            } : {}),
            titleCardCaptionText: TITLE_CARD_BATTERY_CAPTION_TEXT,
        },
        ...defaultIcons,
        centerIconFragment: getMetricIconFragment(options.target.reading.iconId)
            ?? defaultIcons.centerIconFragment,
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

    if (peripheralIdentity.evidence.kind === "bluetooth") {
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
