import {
    SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
    type BatteryDeviceDescriptor,
} from "../../runtime/sources/battery/battery-device-descriptor";
import { systemMessages } from "../../i18n/message-groups/widgets";
import { type I18n, useI18n } from "../../i18n/react";
import type {
    ResolvedSystemMetricTarget,
    ResolvedSystemPeripheralIdentity,
} from "../../settings/resolved-settings";
import { InspectorItem } from "../components/InspectorItem";
import type { SelectOption } from "../inspector/types";
import { SelectSetting } from "../controls/SelectSetting";
import { AppearanceSettings } from "./AppearanceSettings";
import { StandardColorSettings } from "./ColorSettings";
import { LineSettings } from "./LineSettings";
import { PollingSettings } from "./PollingSettings";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { SettingsSection } from "./SettingsSection";

// Vendor-HID peripheral battery reads are intentionally low-frequency because
// experimental devices can share queues with manufacturer software.
const PERIPHERAL_POLLING_FREQUENCY_OPTIONS = [
    { value: 600, label: "10m" },
    { value: 1200, label: "20m" },
    { value: 1800, label: "30m" },
    { value: 3600, label: "60m" },
] as const satisfies readonly SelectOption<number>[];

const SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS = [
    { value: 60, label: "60s" },
    { value: 180, label: "3m" },
    { value: 300, label: "5m" },
    { value: 600, label: "10m" },
    { value: 1200, label: "20m" },
    { value: 1800, label: "30m" },
    { value: 3600, label: "60m" },
] as const satisfies readonly SelectOption<number>[];

export function SystemWidgetSettings(props: WidgetSettingsPanelProps & {
    readonly target: ResolvedSystemMetricTarget;
}): React.JSX.Element {
    const { t } = useI18n();
    const batteryDevices = withSystemBatteryDevice(props.context.runtimeCache.availableBatteryDevices);
    const selectedDescriptorId = resolveSelectedBatteryDescriptorId(
        batteryDevices,
        props.target,
    );
    const selectedBatteryDevice = batteryDevices.find(descriptor => descriptor.descriptorId === selectedDescriptorId);
    const optionList = buildBatteryDeviceOptions({
        descriptors: batteryDevices,
        selectedDescriptorId,
        isVendorHidEnabled: props.context.globalSettings.system.experimentalVendorHidBatteryEnabled,
        loadStatus: props.context.runtimeCacheStatus.batteryDeviceOptionsStatus,
        t,
    });
    const isPeripheralSelected = props.target.reading.peripheralIdentity !== undefined;

    return (
        <>
            <SettingsSection title={t(systemMessages.batterySection)}>
                <SelectSetting
                    label={t(systemMessages.batteryDeviceLabel)}
                    value={selectedDescriptorId}
                    optionList={optionList}
                    onValueChange={(descriptorId) => {
                        const descriptor = batteryDevices
                            .find(candidate => candidate.descriptorId === descriptorId);

                        props.onSettingsPatch({
                            system: {
                                peripheralIdentity: descriptor?.identity,
                            },
                        });
                    }}
                />
                {selectedBatteryDevice?.diagnostics?.batteryPercentSources.includes("voltageEstimated") === true && (
                    <p className="section-note">
                        {t(systemMessages.voltageEstimatedBatteryNote)}
                    </p>
                )}
                <InspectorItem label={t(systemMessages.experimentalVendorHidBatterySettingLabel)}>
                    <div className="override-toggle-control">
                        <label className="native-checkbox-row">
                            <input
                                type="checkbox"
                                checked={props.context.globalSettings.system.experimentalVendorHidBatteryEnabled}
                                onChange={(event) => props.onGlobalSettingsPatch?.({
                                    system: {
                                        experimentalVendorHidBatteryEnabled: event.currentTarget.checked,
                                    },
                                })}
                            />
                            <span>{t(systemMessages.experimentalVendorHidBatteryCheckboxLabel)}</span>
                        </label>
                        <p className="section-note">
                            {t(systemMessages.experimentalVendorHidBatteryNote)}
                        </p>
                    </div>
                </InspectorItem>
            </SettingsSection>
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            <PollingSettings
                {...props}
                optionList={isPeripheralSelected
                    ? PERIPHERAL_POLLING_FREQUENCY_OPTIONS
                    : SYSTEM_BATTERY_POLLING_FREQUENCY_OPTIONS}
                note={isPeripheralSelected ? t(systemMessages.infrequentPollingNote) : undefined}
            />
        </>
    );
}

function withSystemBatteryDevice(
    descriptors: readonly BatteryDeviceDescriptor[],
): readonly BatteryDeviceDescriptor[] {
    if (descriptors.some(descriptor => descriptor.transport === "system")) {
        return descriptors;
    }

    return [SYSTEM_BATTERY_DEVICE_DESCRIPTOR, ...descriptors];
}

function resolveSelectedBatteryDescriptorId(
    descriptors: readonly BatteryDeviceDescriptor[],
    target: ResolvedSystemMetricTarget,
): string {
    if (target.reading.peripheralIdentity === undefined) {
        return "system";
    }

    const selectedIdentity = target.reading.peripheralIdentity;
    return descriptors.find(descriptor =>
        descriptor.identity !== undefined
        && arePeripheralIdentitiesEqual(descriptor.identity, selectedIdentity),
    )?.descriptorId ?? "selected-peripheral";
}

function buildBatteryDeviceOptions(options: {
    readonly descriptors: readonly BatteryDeviceDescriptor[];
    readonly selectedDescriptorId: string;
    readonly isVendorHidEnabled: boolean;
    readonly loadStatus: "pending" | "ready" | "failed";
    readonly t: I18n["t"];
}): readonly SelectOption[] {
    const descriptors = options.isVendorHidEnabled
        ? options.descriptors
        : options.descriptors.filter(descriptor => !descriptor.isExperimental);
    const optionList = descriptors.map(descriptor => ({
        value: descriptor.descriptorId,
        label: formatBatteryDeviceOptionLabel(descriptor, options.t),
        disabled: descriptor.supportState === "unsupported"
            || descriptor.supportState === "ambiguous"
            || descriptor.supportState === "offline",
    }));
    const hasSelectedOption = optionList.some(option => option.value === options.selectedDescriptorId);

    if (!hasSelectedOption && options.selectedDescriptorId.length > 0) {
        return [
            {
                value: options.selectedDescriptorId,
                label: options.t(systemMessages.unavailableBatterySelectionOption, {
                    label: options.selectedDescriptorId,
                }),
                disabled: true,
            },
            ...optionList,
        ];
    }

    if (optionList.length > 0) {
        return optionList;
    }

    switch (options.loadStatus) {
        case "pending":
            return [{ value: "", label: options.t(systemMessages.loadingBatteryDevicesOption), disabled: true }];
        case "failed":
            return [{ value: "", label: options.t(systemMessages.batteryDevicesUnavailableOption), disabled: true }];
        case "ready":
            return [{ value: "", label: options.t(systemMessages.noBatteryDevicesOption), disabled: true }];
    }
}

function formatBatteryDeviceOptionLabel(
    descriptor: BatteryDeviceDescriptor,
    t: I18n["t"],
): string {
    if (descriptor.transport === "system") {
        return t(systemMessages.systemBatteryOption);
    }

    return `[${formatBatteryTransportLabel(descriptor)}] ${descriptor.displayName}`;
}

function arePeripheralIdentitiesEqual(
    left: ResolvedSystemPeripheralIdentity,
    right: ResolvedSystemPeripheralIdentity,
): boolean {
    return left.vendorId === right.vendorId
        && left.productId === right.productId
        && left.manufacturer === right.manufacturer
        && left.productName === right.productName
        && left.serialNumber === right.serialNumber
        && left.interfaceNumber === right.interfaceNumber
        && left.usagePage === right.usagePage
        && left.usageId === right.usageId
        && left.bindingTransport === right.bindingTransport
        && left.receiverKind === right.receiverKind
        && left.vendorUnitId === right.vendorUnitId
        && left.modelId === right.modelId
        && left.receiverSlot === right.receiverSlot;
}

function formatBatteryTransportLabel(descriptor: BatteryDeviceDescriptor): string {
    switch (descriptor.transport) {
        case "system":
            return "System";
        case "bluetooth":
            return "Bluetooth";
        case "usbReceiver":
            return "Dongle";
        case "usbWired":
            return "Wired";
    }
}
