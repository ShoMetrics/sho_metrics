import { useState } from "react";

import {
    SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
    type BatteryDeviceDescriptor,
    type BatteryDeviceDiscoveryDiagnostics,
    type BatteryDeviceHiddenCandidateDiagnostic,
} from "../../runtime/sources/battery/battery-device-descriptor";
import { areBatteryPeripheralIdentitiesEquivalentForSelection } from "../../runtime/sources/battery/battery-peripheral-identity-comparison";
import { shouldEnableVendorHidBatterySupport } from "../../runtime/source-capabilities/vendor-hid-battery-platform-capabilities";
import { systemMessages } from "../../i18n/message-groups/widgets";
import { type I18n, useI18n } from "../../i18n/react";
import type { ResolvedSystemMetricTarget } from "../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../settings/resolved-settings";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import { InspectorItem } from "../components/InspectorItem";
import { SelectSetting } from "../controls/SelectSetting";
import type { SelectOption } from "../inspector/types";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { SettingsSection } from "./SettingsSection";

// Placeholder option id for a persisted peripheral that is not in the current discovery list.
const UNAVAILABLE_SELECTED_BATTERY_DESCRIPTOR_ID = "selected-peripheral";

/** Props for a battery selector that writes target patches without owning the surrounding section. */
export interface BatteryDeviceSelectorProps {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly target: ResolvedSystemMetricTarget;

    /**
     * Writes the System battery target patch and exposes the selected descriptor.
     *
     * The descriptor is PI/runtime-only state, not stored settings. Dense uses it
     * to prefill its row label once when the user changes devices; single System
     * ignores it and keeps label ownership in SystemBatteryMetricTarget.
     */
    readonly onBatterySettingsPatch: (
        patch: NonNullable<StoredWidgetSettingsPatch["system"]>,
        selectedDevice: BatteryDeviceDescriptor | undefined,
    ) => void;
    readonly onGlobalSettingsPatch: WidgetSettingsPanelProps["onGlobalSettingsPatch"];
}

/** Renders the shared System battery device selector without owning a section boundary. */
export function BatteryDeviceSelector({
    context,
    target,
    onBatterySettingsPatch,
    onGlobalSettingsPatch,
}: BatteryDeviceSelectorProps): React.JSX.Element {
    const { t } = useI18n();
    const [
        didEnableVendorHidBatteryInThisInspectorSession,
        setDidEnableVendorHidBatteryInThisInspectorSession,
    ] = useState(false);
    const isVendorHidBatterySupported = shouldEnableVendorHidBatterySupport(context.platform);
    const isVendorHidBatteryEnabled = isVendorHidBatterySupported
        && context.globalSettings.system.experimentalVendorHidBatteryEnabled;
    const batteryDevices = withSystemBatteryDevice(context.runtimeCache.availableBatteryDevices);
    const selectedDescriptorId = resolveSelectedBatteryDescriptorId(batteryDevices, target);
    const selectedBatteryDevice = batteryDevices.find(descriptor => descriptor.descriptorId === selectedDescriptorId);
    const batteryDeviceDiscoveryDiagnostics = context.runtimeCache.batteryDeviceDiscoveryDiagnostics;
    const optionList = buildBatteryDeviceOptions({
        descriptors: batteryDevices,
        selectedDescriptorId,
        selectedUnavailableLabel: resolveSelectedBatteryUnavailableLabel(target),
        isVendorHidEnabled: isVendorHidBatteryEnabled,
        loadStatus: context.runtimeCacheStatus.batteryDeviceOptionsStatus,
        t,
    });
    const isBatteryDeviceSearchPending = context.runtimeCacheStatus.batteryDeviceOptionsStatus === "pending";

    return (
        <>
            <SelectSetting
                label={t(systemMessages.batteryDeviceLabel)}
                value={selectedDescriptorId}
                optionList={optionList}
                hint={isSelectedBatteryDeviceUnavailable({
                    selectedDescriptorId,
                    selectedBatteryDevice,
                    loadStatus: context.runtimeCacheStatus.batteryDeviceOptionsStatus,
                }) ? (
                    <p className="section-note">
                        {t(systemMessages.unavailableBatterySelectionNote)}
                    </p>
                ) : undefined}
                onValueChange={(descriptorId) => {
                    const descriptor = batteryDevices.find(candidate => candidate.descriptorId === descriptorId);

                    onBatterySettingsPatch({
                        peripheralIdentity: descriptor?.identity,
                        detectedPeripheralDisplayName: descriptor?.identity === undefined
                            ? undefined
                            : descriptor.displayName,
                    }, descriptor);
                }}
            />
            {isBatteryDeviceSearchPending && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">
                        {t(systemMessages.searchingBatteryDevicesNote)}
                    </p>
                </InspectorItem>
            )}
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
            {isVendorHidBatterySupported && (
                <InspectorItem label={t(systemMessages.experimentalVendorHidBatterySettingLabel)}>
                    <div className="override-toggle-control">
                        <label className="native-checkbox-row">
                            <input
                                type="checkbox"
                                checked={context.globalSettings.system.experimentalVendorHidBatteryEnabled}
                                onChange={(event) => {
                                    const shouldEnableExperimentalVendorHidBattery = event.currentTarget.checked;
                                    if (
                                        shouldEnableExperimentalVendorHidBattery
                                        && !context.globalSettings.system.experimentalVendorHidBatteryEnabled
                                    ) {
                                        setDidEnableVendorHidBatteryInThisInspectorSession(true);
                                    }
                                    onGlobalSettingsPatch?.({
                                        system: {
                                            experimentalVendorHidBatteryEnabled: shouldEnableExperimentalVendorHidBattery,
                                        },
                                    });
                                }}
                            />
                            <span>{t(systemMessages.experimentalVendorHidBatteryCheckboxLabel)}</span>
                        </label>
                        {didEnableVendorHidBatteryInThisInspectorSession
                            && context.globalSettings.system.experimentalVendorHidBatteryEnabled && (
                            <p className="section-note">
                                <strong>{t(systemMessages.experimentalVendorHidBatteryReopenPanelNote)}</strong>
                            </p>
                        )}
                        <p className="section-note">
                            {t(systemMessages.experimentalVendorHidBatteryNote)}
                        </p>
                    </div>
                </InspectorItem>
            )}
        </>
    );
}

type BatteryDeviceSettingsSectionProps = BatteryDeviceSelectorProps;

/** Renders the System battery settings section for single-metric widgets. */
export function BatteryDeviceSettingsSection(props: BatteryDeviceSettingsSectionProps): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(systemMessages.batterySection)}>
            <BatteryDeviceSelector {...props} />
        </SettingsSection>
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
        && areBatteryPeripheralIdentitiesEquivalentForSelection(descriptor.identity, selectedIdentity),
    )?.descriptorId ?? UNAVAILABLE_SELECTED_BATTERY_DESCRIPTOR_ID;
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

    if (!hasSelectedOption && options.selectedDescriptorId.length > 0) {
        if (options.loadStatus === "pending") {
            return [
                {
                    value: options.selectedDescriptorId,
                    label: options.selectedUnavailableLabel,
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
            ...optionList,
        ];
    }

    if (optionList.length > 0) {
        return optionList;
    }

    switch (options.loadStatus) {
        case "pending":
            return [{ value: "", label: options.t(systemMessages.noBatteryDevicesOption), disabled: true }];
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
    return input.selectedDescriptorId === UNAVAILABLE_SELECTED_BATTERY_DESCRIPTOR_ID
        && input.selectedBatteryDevice === undefined
        && input.loadStatus !== "pending";
}

function resolveSelectedBatteryUnavailableLabel(target: ResolvedSystemMetricTarget): string {
    if (target.reading.peripheralIdentity === undefined) {
        return "system";
    }

    const displayName = target.reading.detectedPeripheralDisplayName
        ?? UNAVAILABLE_SELECTED_BATTERY_DESCRIPTOR_ID;
    const vendorHidIdentity = readSystemVendorHidPeripheralIdentity(target.reading.peripheralIdentity);
    return `[${formatBatteryTransportLabel({
        transport: target.reading.peripheralIdentity.evidence.kind === "bluetooth"
            ? "bluetooth"
            : vendorHidIdentity?.bindingTransport ?? "usbReceiver",
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

    renderBatteryDeviceDiscoveryDiagnosticsDocument(diagnosticsWindow.document, input);
}

function renderBatteryDeviceDiscoveryDiagnosticsDocument(targetDocument: Document, input: {
    readonly diagnostics: BatteryDeviceDiscoveryDiagnostics;
    readonly title: string;
    readonly intro: string;
}): void {
    const hiddenCandidates = input.diagnostics.hiddenCandidates;
    const meta = targetDocument.createElement("meta");
    meta.setAttribute("charset", "utf-8");
    const style = targetDocument.createElement("style");
    style.textContent = [
        "body { background: #1f1f1f; color: #f3f3f3; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; margin: 24px; }",
        "h1 { font-size: 20px; margin: 0 0 8px; }",
        "p { color: #cfcfcf; margin: 0 0 16px; }",
        ".summary { color: #aeb8c2; margin-bottom: 18px; }",
        "details { border: 1px solid #555; border-radius: 6px; margin: 10px 0; padding: 10px 12px; background: #262626; }",
        "summary { cursor: pointer; font-weight: 600; }",
        "dl { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 6px 14px; margin: 12px 0 0; }",
        "dt { color: #aeb8c2; }",
        "dd { margin: 0; overflow-wrap: anywhere; }",
        "code { color: #f1d18a; }",
    ].join("\n");

    targetDocument.title = input.title;
    targetDocument.head.replaceChildren(meta, style);

    const title = targetDocument.createElement("h1");
    title.textContent = input.title;

    const intro = targetDocument.createElement("p");
    intro.textContent = input.intro;

    const summary = targetDocument.createElement("div");
    summary.className = "summary";
    summary.textContent = `Detected candidates: ${input.diagnostics.detectedCandidateCount}. `
        + `Displayed devices: ${input.diagnostics.displayedDescriptorCount}. `
        + `Hidden devices: ${hiddenCandidates.length}.`;

    const candidateElements = hiddenCandidates.length === 0
        ? [createParagraph(targetDocument, "No hidden devices in this snapshot.")]
        : hiddenCandidates.map(candidate => buildHiddenBatteryCandidateElement(targetDocument, candidate));

    targetDocument.body.replaceChildren(title, intro, summary, ...candidateElements);
}

function buildHiddenBatteryCandidateElement(
    targetDocument: Document,
    candidate: BatteryDeviceHiddenCandidateDiagnostic,
): HTMLElement {
    const details = targetDocument.createElement("details");
    const summary = targetDocument.createElement("summary");
    summary.append(
        candidate.displayName,
        " ",
        createCode(targetDocument, candidate.reason),
    );
    details.append(summary, buildDiagnosticFieldListElement(targetDocument, [
        ["Candidate id", candidate.candidateId],
        ["Reason", candidate.reason],
        ["Support state", candidate.supportState],
        ["Transport", candidate.transport],
        ["Receiver kind", candidate.receiverKind],
        ["Vendor id", formatOptionalHex(candidate.vendorId)],
        ["Product id", formatOptionalHex(candidate.productId)],
        ["Model id", candidate.modelId],
        ["Manufacturer", candidate.manufacturer],
        ["Product name", candidate.productName],
        ["Interface", candidate.interfaceNumber],
        ["Usage page", formatOptionalHex(candidate.usagePage)],
        ["Usage id", formatOptionalHex(candidate.usageId)],
        ["Receiver slot", candidate.receiverSlot],
        ["Source path id", candidate.sourcePathId],
    ]));

    return details;
}

function buildDiagnosticFieldListElement(
    targetDocument: Document,
    fields: readonly (readonly [string, string | number | undefined])[],
): HTMLElement {
    const descriptionList = targetDocument.createElement("dl");
    for (const [label, value] of fields) {
        const term = targetDocument.createElement("dt");
        term.textContent = label;
        const description = targetDocument.createElement("dd");
        description.textContent = value === undefined ? "n/a" : String(value);
        descriptionList.append(term, description);
    }

    return descriptionList;
}

function createParagraph(targetDocument: Document, text: string): HTMLParagraphElement {
    const paragraph = targetDocument.createElement("p");
    paragraph.textContent = text;
    return paragraph;
}

function createCode(targetDocument: Document, text: string): HTMLElement {
    const code = targetDocument.createElement("code");
    code.textContent = text;
    return code;
}

function formatOptionalHex(value: number | undefined): string | undefined {
    return value === undefined ? undefined : `0x${value.toString(16).padStart(4, "0")}`;
}
