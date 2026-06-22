import {
    SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
    type BatteryDeviceDescriptor,
    type BatteryDeviceDiscoveryDiagnostics,
    type BatteryDeviceHiddenCandidateDiagnostic,
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
    const batteryDeviceDiscoveryDiagnostics = props.context.runtimeCache.batteryDeviceDiscoveryDiagnostics;
    const optionList = buildBatteryDeviceOptions({
        descriptors: batteryDevices,
        selectedDescriptorId,
        selectedUnavailableLabel: resolveSelectedBatteryUnavailableLabel(props.target),
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
                    hint={isSelectedBatteryDeviceUnavailable({
                        selectedDescriptorId,
                        selectedBatteryDevice,
                        loadStatus: props.context.runtimeCacheStatus.batteryDeviceOptionsStatus,
                    }) ? (
                        <p className="section-note">
                            {t(systemMessages.unavailableBatterySelectionNote)}
                        </p>
                    ) : undefined}
                    onValueChange={(descriptorId) => {
                        const descriptor = batteryDevices
                            .find(candidate => candidate.descriptorId === descriptorId);

                        props.onSettingsPatch({
                            system: {
                                peripheralIdentity: descriptor?.identity,
                                detectedPeripheralDisplayName: descriptor?.identity === undefined
                                    ? undefined
                                    : descriptor.displayName,
                            },
                        });
                    }}
                />
                {selectedBatteryDevice?.diagnostics?.batteryPercentSources.includes("voltageEstimated") === true && (
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">
                            {t(systemMessages.voltageEstimatedBatteryNote)}
                        </p>
                    </InspectorItem>
                )}
                {batteryDeviceDiscoveryDiagnostics !== undefined
                    && batteryDeviceDiscoveryDiagnostics.hiddenCandidates.length > 0 && (
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note battery-hidden-devices-note">
                            <span>{t(systemMessages.hiddenBatteryDevicesNote)}</span>
                            <button
                                className="inline-action-button battery-hidden-devices-details-button"
                                type="button"
                                onClick={() => {
                                    openBatteryDeviceDiscoveryDiagnosticsWindow({
                                        diagnostics: batteryDeviceDiscoveryDiagnostics,
                                        title: t(systemMessages.hiddenBatteryDevicesWindowTitle),
                                        intro: t(systemMessages.hiddenBatteryDevicesWindowIntro),
                                    });
                                }}
                            >
                                {t(systemMessages.hiddenBatteryDevicesDetailsButton)}
                            </button>
                        </p>
                    </InspectorItem>
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
    readonly selectedUnavailableLabel: string;
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
    const pendingOption = {
        value: "",
        label: options.t(systemMessages.loadingBatteryDevicesOption),
        disabled: true,
    } satisfies SelectOption;
    const visibleOptionList = options.loadStatus === "pending"
        ? [pendingOption, ...optionList]
        : optionList;

    if (!hasSelectedOption && options.selectedDescriptorId.length > 0) {
        if (options.loadStatus === "pending") {
            return [
                {
                    value: options.selectedDescriptorId,
                    label: options.t(systemMessages.searchingBatterySelectionOption, {
                        label: options.selectedUnavailableLabel,
                    }),
                    disabled: true,
                },
                ...optionList,
            ];
        }

        return [
            {
                value: options.selectedDescriptorId,
                label: options.t(systemMessages.unavailableBatterySelectionOption, {
                    label: options.selectedUnavailableLabel,
                }),
                disabled: true,
            },
            ...visibleOptionList,
        ];
    }

    if (visibleOptionList.length > 0) {
        return visibleOptionList;
    }

    switch (options.loadStatus) {
        case "pending":
            return [pendingOption];
        case "failed":
            return [{ value: "", label: options.t(systemMessages.batteryDevicesUnavailableOption), disabled: true }];
        case "ready":
            return [{ value: "", label: options.t(systemMessages.noBatteryDevicesOption), disabled: true }];
    }
}

function isSelectedBatteryDeviceUnavailable(input: {
    readonly selectedDescriptorId: string;
    readonly selectedBatteryDevice: BatteryDeviceDescriptor | undefined;
    readonly loadStatus: "pending" | "ready" | "failed";
}): boolean {
    return input.selectedDescriptorId === "selected-peripheral"
        && input.selectedBatteryDevice === undefined
        && input.loadStatus !== "pending";
}

function resolveSelectedBatteryUnavailableLabel(target: ResolvedSystemMetricTarget): string {
    if (target.reading.peripheralIdentity === undefined) {
        return "system";
    }

    const displayName = target.reading.detectedPeripheralDisplayName
        ?? target.reading.peripheralIdentity.productName
        ?? "selected-peripheral";
    return `[${formatBatteryTransportLabel({
        transport: target.reading.peripheralIdentity.bindingTransport ?? "usbReceiver",
    })}] ${displayName}`;
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

function formatBatteryTransportLabel(input: Pick<BatteryDeviceDescriptor, "transport">): string {
    switch (input.transport) {
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

function openBatteryDeviceDiscoveryDiagnosticsWindow(input: {
    readonly diagnostics: BatteryDeviceDiscoveryDiagnostics;
    readonly title: string;
    readonly intro: string;
}): void {
    const diagnosticsWindow = window.open(
        "",
        "sho-metrics-battery-device-diagnostics",
        "width=900,height=700",
    );
    if (diagnosticsWindow === null) {
        return;
    }

    diagnosticsWindow.document.open();
    diagnosticsWindow.document.write(buildBatteryDeviceDiscoveryDiagnosticsHtml(input));
    diagnosticsWindow.document.close();
}

function buildBatteryDeviceDiscoveryDiagnosticsHtml(input: {
    readonly diagnostics: BatteryDeviceDiscoveryDiagnostics;
    readonly title: string;
    readonly intro: string;
}): string {
    const hiddenCandidates = input.diagnostics.hiddenCandidates;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title)}</title>
<style>
body { background: #1f1f1f; color: #f3f3f3; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; }
h1 { font-size: 20px; margin: 0 0 8px; }
p { color: #cfcfcf; margin: 0 0 16px; }
.summary { color: #aeb8c2; margin-bottom: 18px; }
details { border: 1px solid #555; border-radius: 6px; margin: 10px 0; padding: 10px 12px; background: #262626; }
summary { cursor: pointer; font-weight: 600; }
dl { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 6px 14px; margin: 12px 0 0; }
dt { color: #aeb8c2; }
dd { margin: 0; overflow-wrap: anywhere; }
code { color: #f1d18a; }
</style>
</head>
<body>
<h1>${escapeHtml(input.title)}</h1>
<p>${escapeHtml(input.intro)}</p>
<div class="summary">Detected candidates: ${input.diagnostics.detectedCandidateCount}. Displayed devices: ${input.diagnostics.displayedDescriptorCount}. Hidden devices: ${hiddenCandidates.length}.</div>
${hiddenCandidates.map(buildHiddenBatteryCandidateHtml).join("") || "<p>No hidden devices in this snapshot.</p>"}
</body>
</html>`;
}

function buildHiddenBatteryCandidateHtml(candidate: BatteryDeviceHiddenCandidateDiagnostic): string {
    return `<details>
<summary>${escapeHtml(candidate.displayName)} <code>${escapeHtml(candidate.reason)}</code></summary>
<dl>
${buildDiagnosticFieldHtml("Candidate id", candidate.candidateId)}
${buildDiagnosticFieldHtml("Reason", candidate.reason)}
${buildDiagnosticFieldHtml("Support state", candidate.supportState)}
${buildDiagnosticFieldHtml("Transport", candidate.transport)}
${buildDiagnosticFieldHtml("Receiver kind", candidate.receiverKind)}
${buildDiagnosticFieldHtml("Vendor id", formatOptionalHex(candidate.vendorId))}
${buildDiagnosticFieldHtml("Product id", formatOptionalHex(candidate.productId))}
${buildDiagnosticFieldHtml("Model id", candidate.modelId)}
${buildDiagnosticFieldHtml("Manufacturer", candidate.manufacturer)}
${buildDiagnosticFieldHtml("Product name", candidate.productName)}
${buildDiagnosticFieldHtml("Interface", candidate.interfaceNumber)}
${buildDiagnosticFieldHtml("Usage page", formatOptionalHex(candidate.usagePage))}
${buildDiagnosticFieldHtml("Usage id", formatOptionalHex(candidate.usageId))}
${buildDiagnosticFieldHtml("Receiver slot", candidate.receiverSlot)}
${buildDiagnosticFieldHtml("Source path id", candidate.sourcePathId)}
</dl>
</details>`;
}

function buildDiagnosticFieldHtml(label: string, value: string | number | undefined): string {
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value === undefined ? "n/a" : String(value))}</dd>`;
}

function formatOptionalHex(value: number | undefined): string | undefined {
    return value === undefined ? undefined : `0x${value.toString(16).padStart(4, "0")}`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/"/gu, "&quot;")
        .replace(/'/gu, "&#39;");
}
