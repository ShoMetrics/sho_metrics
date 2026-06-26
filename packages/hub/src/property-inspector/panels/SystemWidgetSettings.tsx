import { useState } from "react";

import {
    SYSTEM_BATTERY_DEVICE_DESCRIPTOR,
    type BatteryDeviceDescriptor,
    type BatteryDeviceDiscoveryDiagnostics,
    type BatteryDeviceHiddenCandidateDiagnostic,
} from "../../runtime/sources/battery/battery-device-descriptor";
import { areBatteryPeripheralIdentitiesEquivalentForSelection } from "../../runtime/sources/battery/battery-peripheral-identity-comparison";
import { systemMessages } from "../../i18n/message-groups/widgets";
import { type I18n, useI18n } from "../../i18n/react";
import type {
    ResolvedSystemMetricTarget,
} from "../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../settings/resolved-settings";
import { InspectorItem } from "../components/InspectorItem";
import type { SelectOption } from "../inspector/types";
import { SelectSetting } from "../controls/SelectSetting";
import { AppearanceSettings } from "./AppearanceSettings";
import { StandardColorSettings } from "./ColorSettings";
import { LineSettings } from "./LineSettings";
import { PollingSettings } from "./PollingSettings";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { SettingsSection } from "./SettingsSection";
import { shouldEnableVendorHidBatterySupport } from "../../runtime/source-capabilities/vendor-hid-battery-platform-capabilities";
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

export function SystemWidgetSettings(props: WidgetSettingsPanelProps & {
    readonly target: ResolvedSystemMetricTarget;
}): React.JSX.Element {
    const { t } = useI18n();
    const [
        didEnableVendorHidBatteryInThisInspectorSession,
        setDidEnableVendorHidBatteryInThisInspectorSession,
    ] = useState(false);
    const isVendorHidBatterySupported = shouldEnableVendorHidBatterySupport(props.context.platform);
    const isVendorHidBatteryEnabled = isVendorHidBatterySupported
        && props.context.globalSettings.system.experimentalVendorHidBatteryEnabled;
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
        isVendorHidEnabled: isVendorHidBatteryEnabled,
        loadStatus: props.context.runtimeCacheStatus.batteryDeviceOptionsStatus,
        t,
    });
    const isVendorHidPeripheralSelected = readSystemVendorHidPeripheralIdentity(
        props.target.reading.peripheralIdentity,
    ) !== undefined;
    const isBatteryDeviceSearchPending = props.context.runtimeCacheStatus.batteryDeviceOptionsStatus === "pending";
    const widget = requireResolvedSingleMetricWidget(props.context.resolved);
    const displayMaximumLabelCharacters = resolveMetricCustomLabelDisplayMaximumCharacters({
        selectedView: widget.slot.appearance.view.selectedView,
        keyShape: resolveMetricCustomLabelKeyShape({
            selectedView: widget.slot.appearance.view.selectedView,
            isTouchStrip: props.context.isTouchStrip,
        }),
    });
    const selectedPeripheralDisplayName = props.target.reading.peripheralIdentity === undefined
        ? undefined
        : props.target.reading.detectedPeripheralDisplayName;

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
                                // A battery label is user-owned. Device names are
                                // only fallback display text, so changing devices
                                // clears stale custom text instead of copying it.
                                customLabel: undefined,
                            },
                        });
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
                                    checked={props.context.globalSettings.system.experimentalVendorHidBatteryEnabled}
                                    onChange={(event) => {
                                        const shouldEnableExperimentalVendorHidBattery = event.currentTarget.checked;
                                        if (
                                            shouldEnableExperimentalVendorHidBattery
                                            && !props.context.globalSettings.system.experimentalVendorHidBatteryEnabled
                                        ) {
                                            setDidEnableVendorHidBatteryInThisInspectorSession(true);
                                        }
                                        props.onGlobalSettingsPatch?.({
                                            system: {
                                                experimentalVendorHidBatteryEnabled: shouldEnableExperimentalVendorHidBattery,
                                            },
                                        });
                                    }}
                                />
                                <span>{t(systemMessages.experimentalVendorHidBatteryCheckboxLabel)}</span>
                            </label>
                            {didEnableVendorHidBatteryInThisInspectorSession
                                && props.context.globalSettings.system.experimentalVendorHidBatteryEnabled && (
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
            </SettingsSection>
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
                    iconId: props.target.reading.iconId,
                    onIconIdChange: (iconId) => props.onSettingsPatch({
                        system: { iconId },
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
    return input.selectedDescriptorId === "selected-peripheral"
        && input.selectedBatteryDevice === undefined
        && input.loadStatus !== "pending";
}

function resolveSelectedBatteryUnavailableLabel(target: ResolvedSystemMetricTarget): string {
    if (target.reading.peripheralIdentity === undefined) {
        return "system";
    }

    const displayName = target.reading.detectedPeripheralDisplayName
        ?? "selected-peripheral";
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
