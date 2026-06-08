import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { commonMessages } from "../../i18n/message-groups/shell";
import { networkMessages } from "../../i18n/message-groups/widgets";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n, type I18n } from "../../i18n/react";
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
import {
    requireResolvedSingleMetricWidget,
    type ResolvedNetworkMetricTarget,
    type ResolvedNetworkReading,
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
            {props.showPolling !== false && <PollingSettings {...props} />}
        </>
    );
}

function NetworkMetricSettings({
    context,
    target,
    onSettingsPatch,
}: NetworkWidgetSettingsProps): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const trafficTarget = readNetworkTrafficMetricTarget(target);
    const pingTargetHost = target.reading.kind === "ping"
        ? target.reading.targetHost
        : DEFAULT_NETWORK_PING_TARGET_HOST;

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            <SelectSetting
                label={t(networkMessages.networkMetricLabel)}
                value={target.reading.kind}
                optionList={localizeOptionList(t, networkMetricKindOptionList, networkMetricKindMessageByValue)}
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
    const i18n = useI18n();
    const { t } = i18n;
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
            label={t(networkMessages.pingTargetLabel)}
            value={textValue}
            placeholder={DEFAULT_NETWORK_PING_TARGET_HOST}
            validationMessage={validationMessage}
            onFocus={() => setIsEditing(true)}
            onValueChange={(value) => {
                setDraftTargetHost(value);
                setValidationMessage(readPingTargetValidationMessage(i18n, value));
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

                setValidationMessage(t(networkMessages.pingTargetValidation));
            }}
        />
    );
}

function readPingTargetValidationMessage(i18n: I18n, value: string): string {
    const { t } = i18n;

    if (value.trim().length === 0) {
        return "";
    }

    return normalizeNetworkPingTargetInput(value).status === "normalized"
        ? ""
        : t(networkMessages.pingTargetValidation);
}

function NetworkTrafficMetricSettings({
    context,
    target,
    onSettingsPatch,
}: NetworkTrafficWidgetSettingsProps): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const reading = target.reading;

    return (
        <>
            <SelectSetting
                label={t(commonMessages.directionLabel)}
                value={reading.direction}
                optionList={localizeOptionList(t, networkDirectionOptionList, networkDirectionMessageByValue)}
                onValueChange={(direction) => onSettingsPatch({
                    network: { direction },
                })}
            />
            {requireResolvedSingleMetricWidget(context.resolved).slot.appearance.view.selectedView === "circle" && (
                <InspectorItem className="note-item note-item-default">
                    <p className="section-note">{t(networkMessages.networkCircleSplitNote)}</p>
                </InspectorItem>
            )}
            <SelectSetting
                label={t(networkMessages.networkInterfaceLabel)}
                value={reading.interfaceId ?? ""}
                optionList={resolveNetworkInterfaceOptions(context, i18n)}
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
    const i18n = useI18n();
    const { t } = i18n;
    const display = target.reading.display;
    const isAutoScale = display.scaleMode === "auto";

    return (
        <SettingsSection title={t(commonMessages.scaleUnitsSection)}>
            <SelectSetting
                label={t(commonMessages.scaleLabel)}
                value={display.scaleMode}
                optionList={localizeOptionList(t, scaleModeOptionList, scaleModeMessageByValue)}
                onValueChange={(scaleMode) => onSettingsPatch({
                    network: { scaleMode },
                })}
            />
            <NumberSetting
                label={t(networkMessages.uploadMaxMbpsLabel)}
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
                label={t(networkMessages.downloadMaxMbpsLabel)}
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
                label={t(commonMessages.unitLabel)}
                value={display.unitBase}
                optionList={localizeOptionList(t, networkUnitBaseOptionList, networkUnitBaseMessageByValue)}
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

const networkMetricKindMessageByValue = {
    traffic: optionMessages.trafficOption,
    ping: optionMessages.pingOption,
} as const;

const networkDirectionMessageByValue = {
    both: optionMessages.uploadDownloadOption,
    upload: optionMessages.uploadOption,
    download: optionMessages.downloadOption,
} as const;

const scaleModeMessageByValue = {
    auto: optionMessages.autoOption,
    custom: optionMessages.customOption,
} as const;

const networkUnitBaseMessageByValue = {
    byte: optionMessages.bytePerSecondOption,
    bit: optionMessages.bitPerSecondOption,
} as const;
