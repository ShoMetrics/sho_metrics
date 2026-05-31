import { InspectorItem } from "../components/InspectorItem";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import type { DisplayedMetricReadAttribution } from "../../runtime/widget-runtime-cache";
import type { ResolvedGpuMetricTarget, ResolvedGpuReading } from "../../settings/resolved-settings";
import { isBuiltInMetricSupportedOnPlatform } from "../../runtime/source-routing/metric-source-preferences";
import type { PropertyInspectorPlatform } from "../inspector/platform";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { MetricSourceSettings } from "./MetricSourceSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";
import {
    buildGpuMetricKindOptionList,
    resolveGpuMetricKindMetricKeys,
    temperatureUnitOptionList,
} from "./setting-options";

type GpuTemperatureReading = Extract<ResolvedGpuReading, { readonly kind: "temperature" }>;
type GpuPowerReading = Extract<ResolvedGpuReading, { readonly kind: "power" }>;

type GpuWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedGpuMetricTarget;
};

export function GpuWidgetSettings(props: GpuWidgetSettingsProps): React.JSX.Element {
    const reading = props.target.reading;
    const isSelectedReadingSupported = isGpuReadingSupportedOnCurrentPlatform(props.context.platform, props.target);

    return (
        <>
            <GpuMetricSettings {...props} />
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            {isSelectedReadingSupported
                && reading.kind === "temperature"
                && <GpuTemperatureScaleSettings {...props} reading={reading} />}
            {isSelectedReadingSupported
                && reading.kind === "power"
                && <GpuPowerScaleSettings {...props} reading={reading} />}
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}

function GpuMetricSettings({
    context,
    target,
    onSettingsPatch,
}: GpuWidgetSettingsProps): React.JSX.Element {
    const optionList = buildGpuMetricKindOptionList(context.platform, target.reading.kind);
    const isSelectedReadingSupported = isGpuReadingSupportedOnCurrentPlatform(context.platform, target);
    const noValueGuidance = resolveGpuNoValueGuidanceText(
        context.isWindows,
        context.runtimeCache.displayedMetricReadAttribution,
    );

    return (
        <SettingsSection title="Metric">
            <SelectSetting
                label="GPU Metric"
                value={target.reading.kind}
                optionList={optionList}
                onValueChange={(kind) => onSettingsPatch({
                    gpu: { kind },
                })}
            />
            {!isSelectedReadingSupported && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">
                        Current GPU metric is not supported on this platform. Choose a supported metric to continue.
                    </p>
                </InspectorItem>
            )}
            {context.isWindows && (
                <MetricSourceSettings
                    sourcePolicy={context.resolved.widget.slot.metric.source}
                    onSettingsPatch={onSettingsPatch}
                />
            )}
            {noValueGuidance !== undefined && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{noValueGuidance}</p>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

function resolveGpuNoValueGuidanceText(
    isWindows: boolean,
    attribution: DisplayedMetricReadAttribution | undefined,
): string | undefined {
    if (!isWindows || attribution?.metricKey.startsWith("gpu.") !== true) {
        return undefined;
    }

    if (attribution.outcome?.kind === "value") {
        return undefined;
    }

    return "No GPU value is available from the current source. Intel and AMD GPU metrics usually require ShoMetrics Helper. If Helper is installed, restart it or open ShoMetrics Control Panel for diagnostics.";
}

function GpuTemperatureScaleSettings({
    reading,
    onSettingsPatch,
}: GpuWidgetSettingsProps & {
    reading: GpuTemperatureReading;
}): React.JSX.Element {
    return (
        <SettingsSection title="Scale & Units">
            <SelectSetting
                label="Unit"
                value={reading.unit}
                optionList={temperatureUnitOptionList}
                onValueChange={(temperatureUnit) => onSettingsPatch({
                    gpu: { temperatureUnit },
                })}
            />
            <NumberSetting
                label="Max Temp (C)"
                value={reading.maximumCelsius}
                onValueChange={(maximumTemperatureCelsius) => onSettingsPatch({
                    gpu: { maximumTemperatureCelsius },
                })}
                minimum={1}
                step={1}
            />
        </SettingsSection>
    );
}

function GpuPowerScaleSettings({
    reading,
    onSettingsPatch,
}: GpuWidgetSettingsProps & {
    reading: GpuPowerReading;
}): React.JSX.Element {
    return (
        <SettingsSection title="Scale & Units">
            <NumberSetting
                label="Max Power (W)"
                value={reading.maximumWatts}
                onValueChange={(maximumGpuPowerWatts) => onSettingsPatch({
                    gpu: { maximumPowerWatts: maximumGpuPowerWatts },
                })}
                minimum={1}
                step={1}
                optional
            />
        </SettingsSection>
    );
}

function isGpuReadingSupportedOnCurrentPlatform(
    platform: PropertyInspectorPlatform,
    target: ResolvedGpuMetricTarget,
): boolean {
    return resolveGpuMetricKindMetricKeys(target.reading.kind).every(metricKey =>
        isBuiltInMetricSupportedOnPlatform(metricKey, platform),
    );
}
