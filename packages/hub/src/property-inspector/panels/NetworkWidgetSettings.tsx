import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import { resolveNetworkInterfaceOptions } from "../select-options/runtime-select-options";
import {
    NetworkChannelColorSettings,
    StandardColorSettings,
} from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import type {
    ResolvedNetworkMetricTarget,
    ResolvedNetworkReading,
} from "../../settings/resolved-settings";
import {
    DEFAULT_NETWORK_PING_TARGET_HOST,
    normalizeNetworkPingTargetInput,
} from "../../settings/network-ping-target";
import {
    networkDirectionOptionList,
    networkMetricKindOptionList,
    networkUnitBaseOptionList,
    scaleModeOptionList,
} from "./setting-options";

type NetworkWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedNetworkMetricTarget;
};

const PING_TARGET_VALIDATION_MESSAGE = "Enter an IP address, hostname, or URL.";

type ResolvedNetworkTrafficMetricTarget = ResolvedNetworkMetricTarget & {
    readonly reading: Extract<ResolvedNetworkReading, { readonly kind: "traffic" }>;
};

type NetworkTrafficWidgetSettingsProps = Omit<NetworkWidgetSettingsProps, "target"> & {
    target: ResolvedNetworkTrafficMetricTarget;
};

export function NetworkWidgetSettings(props: NetworkWidgetSettingsProps): React.JSX.Element {
    const trafficTarget = readNetworkTrafficMetricTarget(props.target);

    return (
        <>
            <NetworkMetricSettings {...props} />
            <AppearanceSettings {...props} />
            {trafficTarget && (
                <NetworkScaleSettings {...props} target={trafficTarget} />
            )}
            <LineSettings {...props} />
            {trafficTarget && trafficTarget.reading.direction === "both" ? (
                <NetworkChannelColorSettings {...props} />
            ) : (
                <StandardColorSettings {...props} />
            )}
            <PollingSettings {...props} />
        </>
    );
}

function NetworkMetricSettings({
    context,
    target,
    onSettingsPatch,
}: NetworkWidgetSettingsProps): React.JSX.Element {
    const trafficTarget = readNetworkTrafficMetricTarget(target);
    const pingTargetHost = target.reading.kind === "ping"
        ? target.reading.targetHost
        : DEFAULT_NETWORK_PING_TARGET_HOST;

    return (
        <SettingsSection title="Metric">
            <SelectSetting
                label="Network Metric"
                value={target.reading.kind}
                optionList={networkMetricKindOptionList}
                onValueChange={(kind) => onSettingsPatch({
                    network: { kind },
                })}
            />
            {trafficTarget ? (
                <NetworkTrafficMetricSettings
                    context={context}
                    target={trafficTarget}
                    onSettingsPatch={onSettingsPatch}
                />
            ) : (
                <NetworkPingTargetSetting
                    targetHost={pingTargetHost}
                    onSettingsPatch={onSettingsPatch}
                />
            )}
        </SettingsSection>
    );
}

function NetworkPingTargetSetting({
    targetHost,
    onSettingsPatch,
}: Pick<NetworkWidgetSettingsProps, "onSettingsPatch"> & {
    readonly targetHost: string;
}): React.JSX.Element {
    const [draftTargetHost, setDraftTargetHost] = useState(targetHost);
    const [isEditing, setIsEditing] = useState(false);
    const [validationMessage, setValidationMessage] = useState("");
    const textValue = isEditing
        ? draftTargetHost
        : targetHost;

    useEffect(() => {
        if (!isEditing) {
            setDraftTargetHost(targetHost);
        }
    }, [isEditing, targetHost]);

    return (
        <TextSetting
            label="Ping Target"
            value={textValue}
            placeholder={DEFAULT_NETWORK_PING_TARGET_HOST}
            validationMessage={validationMessage}
            onFocus={() => setIsEditing(true)}
            onValueChange={(value) => {
                setDraftTargetHost(value);
                setValidationMessage(readPingTargetValidationMessage(value));
            }}
            onBlur={() => {
                const normalizedTarget = normalizeNetworkPingTargetInput(draftTargetHost);
                setIsEditing(false);

                if (normalizedTarget.status === "normalized" || draftTargetHost.trim().length === 0) {
                    setValidationMessage("");
                    setDraftTargetHost(normalizedTarget.targetHost);
                    onSettingsPatch({
                        network: {
                            pingTargetHost: normalizedTarget.targetHost,
                        },
                    });
                    return;
                }

                setValidationMessage(PING_TARGET_VALIDATION_MESSAGE);
            }}
        />
    );
}

function readPingTargetValidationMessage(value: string): string {
    if (value.trim().length === 0) {
        return "";
    }

    return normalizeNetworkPingTargetInput(value).status === "normalized"
        ? ""
        : PING_TARGET_VALIDATION_MESSAGE;
}

function NetworkTrafficMetricSettings({
    context,
    target,
    onSettingsPatch,
}: NetworkTrafficWidgetSettingsProps): React.JSX.Element {
    const reading = target.reading;

    return (
        <>
            <SelectSetting
                label="Direction"
                value={reading.direction}
                optionList={networkDirectionOptionList}
                onValueChange={(direction) => onSettingsPatch({
                    network: { direction },
                })}
            />
            {context.resolved.widget.slot.appearance.view.selectedView === "circle" && (
                <InspectorItem className="note-item note-item-default">
                    <p className="section-note">Upload and download split the circle into two halves.</p>
                </InspectorItem>
            )}
            <SelectSetting
                label="Network Interface"
                value={reading.interfaceId ?? ""}
                optionList={resolveNetworkInterfaceOptions(context)}
                onValueChange={(interfaceId) => onSettingsPatch({
                    network: { interfaceId },
                })}
            />
        </>
    );
}

function NetworkScaleSettings({
    target,
    onSettingsPatch,
}: NetworkTrafficWidgetSettingsProps): React.JSX.Element {
    const display = target.reading.display;
    const isAutoScale = display.scaleMode === "auto";

    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                label="Scale"
                value={display.scaleMode}
                optionList={scaleModeOptionList}
                onValueChange={(scaleMode) => onSettingsPatch({
                    network: { scaleMode },
                })}
            />
            <NumberSetting
                label="Upload Max (Mbps)"
                value={display.maximumUploadSpeedMegabitsPerSecond}
                onValueChange={(maximumUploadSpeedMegabitsPerSecond) => onSettingsPatch({
                    network: {
                        scaleMode: "custom",
                        maximumUploadSpeedMegabitsPerSecond,
                    },
                })}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
            />
            <NumberSetting
                label="Download Max (Mbps)"
                value={display.maximumDownloadSpeedMegabitsPerSecond}
                onValueChange={(maximumDownloadSpeedMegabitsPerSecond) => onSettingsPatch({
                    network: {
                        scaleMode: "custom",
                        maximumDownloadSpeedMegabitsPerSecond,
                    },
                })}
                minimum={1}
                step={1}
                optional
                disabled={isAutoScale}
            />
            <SelectSetting
                label="Unit"
                value={display.unitBase}
                optionList={networkUnitBaseOptionList}
                onValueChange={(unitBase) => onSettingsPatch({
                    network: { unitBase },
                })}
            />
        </SettingsSection>
    );
}

function readNetworkTrafficMetricTarget(
    target: ResolvedNetworkMetricTarget,
): ResolvedNetworkTrafficMetricTarget | undefined {
    return isNetworkTrafficMetricTarget(target) ? target : undefined;
}

function isNetworkTrafficMetricTarget(target: ResolvedNetworkMetricTarget): target is ResolvedNetworkTrafficMetricTarget {
    return target.reading.kind === "traffic";
}
