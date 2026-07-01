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
import { buildPercentageWidgetData } from "../../metrics/percentage-widget-data";
import { TITLE_CARD_BATTERY_CAPTION_TEXT } from "../../view-rendering/text-content/title-card-text-content";
import { getMetricIconFragment } from "../../widgets/icons/metric-icons";
import { buildMetricViewIcons } from "../../widgets/icons/metric-view-icons";
import type { HardwareIconKind } from "../../widgets/icons/hardware-icons";

const MISSING_BLUETOOTH_PRIMARY_IDENTIFIER_DESCRIPTOR_ID = "missing-primary-identifier";

export function buildSystemViewOptions(options: {
    readonly event: WillAppearEvent;
    readonly settings: ResolvedWidgetSettings;
    readonly target: ResolvedSystemMetricTarget;
    readonly metrics: MetricStoreReader;
}): SingleMetricViewOptions {
    const widget = requireResolvedSingleMetricWidget(options.settings);
    const metricKey = resolveSystemMetricKey(options.target);
    const viewSettings = widget.slot.appearance.view;
    const selectedView = viewSettings.selectedView;
    const displayMaximumLabelCharacters = resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings,
        selectedTheme: widget.slot.appearance.theme.selectedTheme,
        keyShape: resolveMetricCustomLabelKeyShape({
            selectedView,
            isTouchStrip: options.event.action.isDial(),
        }),
    });
    const batteryLabel = resolveSystemBatteryLabel({
        customLabel: options.target.reading.customLabel,
        selectedPeripheralDisplayName: options.target.reading.detectedPeripheralDisplayName,
        selectedView,
        circleVariant: viewSettings.circleVariant,
        textVariant: viewSettings.textVariant,
        maximumCharacters: displayMaximumLabelCharacters,
    });
    const secondaryBatteryLabel = resolveSystemBatterySecondaryLabel({
        customLabel: options.target.reading.customLabel,
        selectedPeripheralDisplayName: options.target.reading.detectedPeripheralDisplayName,
        maximumCharacters: displayMaximumLabelCharacters,
    });
    const widgetData = buildPercentageWidgetData(options.metrics.getWidgetData(
        metricKey,
        selectedView === "bar" ? SYSTEM_BATTERY_TITLE_LABEL : batteryLabel,
        "%",
        100,
    ));
    const defaultIcons = buildMetricViewIcons({
        hardware: resolveBatteryHardwareIconKind(widgetData),
        status: "percentage",
    });

    return {
        event: options.event,
        metricRenderKind: "singleMetric",
        resolvedSettings: widget.slot.appearance,
        metricKey,
        widgetData: {
            ...widgetData,
            ...(selectedView === "bar" ? {
                barLabel: SYSTEM_BATTERY_TITLE_LABEL,
                secondaryDisplayValue: secondaryBatteryLabel,
            } : {}),
            titleCardCaptionText: TITLE_CARD_BATTERY_CAPTION_TEXT,
        },
        ...defaultIcons,
        centerIconFragment: getMetricIconFragment(options.target.reading.customIconId)
            ?? defaultIcons.centerIconFragment,
    };
}

function resolveBatteryHardwareIconKind(widgetData: {
    readonly current: number;
    readonly sampleTimestampMilliseconds?: number;
}): HardwareIconKind {
    if (widgetData.sampleTimestampMilliseconds === undefined) {
        return "battery";
    }

    const batteryPercent = widgetData.current;
    if (batteryPercent >= 100) {
        return "battery-full";
    }

    if (batteryPercent > 0) {
        return "battery-medium";
    }

    return "battery-empty";
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
