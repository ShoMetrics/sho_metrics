import { systemMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import type {
    ResolvedSystemMetricTarget,
} from "../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../settings/resolved-settings";
import { AppearanceSettings } from "./AppearanceSettings";
import { StandardColorSettings } from "./ColorSettings";
import { LineSettings } from "./LineSettings";
import { PollingSettings } from "./PollingSettings";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { resolveBatteryPollingFrequencyOptions } from "./battery-polling-options";
import {
    normalizeSystemBatteryCustomLabel,
} from "../../settings/system-battery-label";
import {
    requireResolvedSingleMetricWidget,
} from "../../settings/resolved-settings";
import {
    METRIC_CUSTOM_LABEL_INPUT_MAXIMUM_CHARACTERS,
    resolveMetricCustomLabelDisplayMaximumCharacters,
    resolveMetricCustomLabelKeyShape,
} from "../../settings/metric-custom-label-policy";
import { MetricCustomizationSettings } from "./MetricCustomizationSettings";
import { BatteryDeviceSettingsSection } from "./BatteryDeviceSettingsSection";

export function SystemWidgetSettings(props: WidgetSettingsPanelProps & {
    readonly target: ResolvedSystemMetricTarget;
}): React.JSX.Element {
    const { t } = useI18n();
    const isVendorHidPeripheralSelected = readSystemVendorHidPeripheralIdentity(
        props.target.reading.peripheralIdentity,
    ) !== undefined;
    const widget = requireResolvedSingleMetricWidget(props.context.resolved);
    const viewSettings = widget.slot.appearance.view;
    const displayMaximumLabelCharacters = resolveMetricCustomLabelDisplayMaximumCharacters({
        viewSettings,
        selectedTheme: widget.slot.appearance.theme.selectedTheme,
        keyShape: resolveMetricCustomLabelKeyShape({
            selectedView: viewSettings.selectedView,
            isTouchStrip: props.context.isTouchStrip,
        }),
    });
    const selectedPeripheralDisplayName = props.target.reading.peripheralIdentity === undefined
        ? undefined
        : props.target.reading.detectedPeripheralDisplayName;

    return (
        <>
            <BatteryDeviceSettingsSection
                context={props.context}
                target={props.target}
                onBatterySettingsPatch={(system) => props.onSettingsPatch({
                    system: {
                        ...system,
                        // A single-metric battery label is user-owned. Device
                        // names are fallback display text, so changing devices
                        // clears stale custom text instead of copying it.
                        customLabel: undefined,
                    },
                })}
                onGlobalSettingsPatch={props.onGlobalSettingsPatch}
            />
            <AppearanceSettings {...props} />
            <MetricCustomizationSettings
                label={{
                    value: props.target.reading.customLabel,
                    prefillValue: selectedPeripheralDisplayName,
                    inputMaximumCharacters: METRIC_CUSTOM_LABEL_INPUT_MAXIMUM_CHARACTERS,
                    displayMaximumCharacters: displayMaximumLabelCharacters,
                    onValueChange: (label) => props.onSettingsPatch({
                        system: {
                            customLabel: normalizeSystemBatteryCustomLabel(label),
                        },
                    }),
                }}
                icon={{
                    iconId: props.target.reading.customIconId,
                    onIconIdChange: (customIconId) => props.onSettingsPatch({
                        system: { customIconId },
                    }),
                }}
            />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            {props.showPolling !== false && (
                <PollingSettings
                    {...props}
                    optionList={resolveBatteryPollingFrequencyOptions(props.target.reading.peripheralIdentity)}
                    note={isVendorHidPeripheralSelected ? t(systemMessages.infrequentPollingNote) : undefined}
                />
            )}
        </>
    );
}
