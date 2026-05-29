import { InspectorItem } from "../components/InspectorItem";
import { SelectSetting } from "../controls/SelectSetting";
import type { SelectOption } from "../inspector/types";
import {
    buildCatalogMetricOptions,
    type CatalogMetricOptions,
    type CatalogMetricSelection,
    type CatalogMetricTypeId,
} from "../select-options/catalog-metric-options";
import type { MetricDescriptor } from "../../runtime/sources/source-client";
import type { ResolvedCatalogMetricTarget } from "../../settings/resolved-settings";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import type { WidgetSettingsPanelProps } from "./panel-props";

type CatalogMetricWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedCatalogMetricTarget;
};

export function CatalogMetricWidgetSettings(props: CatalogMetricWidgetSettingsProps): React.JSX.Element {
    return (
        <>
            <CatalogMetricPicker {...props} />
            <AppearanceSettings {...props} />
            <LineSettings {...props} />
            <StandardColorSettings {...props} />
            <PollingSettings {...props} />
        </>
    );
}

function CatalogMetricPicker({
    context,
    target,
    onSettingsPatch,
}: CatalogMetricWidgetSettingsProps): React.JSX.Element {
    // Keep showing cached descriptors during a transient pending refresh so the
    // picker does not blank out every time the Property Inspector reopens.
    const descriptors = context.runtimeCache.availableCatalogMetricDescriptors;
    const options = buildCatalogMetricOptions(descriptors, {
        metricId: target.metricId,
    });
    const selection = options.resolvedSelection;

    return (
        <SettingsSection title="Metric">
            {descriptors.length === 0 ? (
                <CatalogMetricDescriptorStatusNote status={context.runtimeCacheStatus.catalogMetricDescriptorStatus} />
            ) : (
                <>
                    {shouldShowTypeSetting(options) && (
                        <SelectSetting
                            label="Type"
                            value={selection.typeId}
                            optionList={options.typeOptions}
                            onValueChange={(typeId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, descriptors, { typeId });
                            }}
                        />
                    )}
                    {selection.typeId.length > 0 && countEnabledOptions(options.hardwareOptions) > 1 && (
                        <SelectSetting
                            label="Hardware"
                            value={selection.hardwareId}
                            optionList={options.hardwareOptions}
                            onValueChange={(hardwareId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, descriptors, {
                                    typeId: selection.typeId,
                                    hardwareId,
                                });
                            }}
                        />
                    )}
                    {selection.hardwareId.length > 0 && countEnabledOptions(options.readingOptions) > 1 && (
                        <SelectSetting
                            label="Reading"
                            value={selection.readingId}
                            optionList={options.readingOptions}
                            onValueChange={(readingId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, descriptors, {
                                    typeId: selection.typeId,
                                    hardwareId: selection.hardwareId,
                                    readingId,
                                });
                            }}
                        />
                    )}
                    {selection.readingId.length > 0 && countEnabledOptions(options.metricOptions) > 1 && (
                        <SelectSetting
                            label="Metric"
                            value={selection.metricId}
                            optionList={options.metricOptions}
                            onValueChange={(metricId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, descriptors, { metricId });
                            }}
                        />
                    )}
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">Source: Helper only</p>
                    </InspectorItem>
                </>
            )}
        </SettingsSection>
    );
}

function CatalogMetricDescriptorStatusNote({
    status,
}: {
    status: "pending" | "ready" | "failed";
}): React.JSX.Element {
    const text = status === "failed"
        ? "Metrics unavailable"
        : status === "ready"
            ? "No helper metrics"
            : "Loading metrics...";

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">{text}</p>
        </InspectorItem>
    );
}

function shouldShowTypeSetting(
    options: CatalogMetricOptions,
): boolean {
    return options.resolvedSelection.typeId.length === 0 || countTypeOptions(options.typeOptions) > 1;
}

function writeSelectedCatalogMetric(
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void,
    descriptors: readonly MetricDescriptor[],
    selection: Partial<CatalogMetricSelection>,
): void {
    if (selection.typeId === "") {
        onSettingsPatch({
            catalog: {
                metricId: "",
                fallbackLabel: undefined,
                fallbackUnit: undefined,
            },
        });
        return;
    }

    const options = buildCatalogMetricOptions(descriptors, selection);
    const selectedMetric = options.selectedMetric;
    if (!selectedMetric) {
        // A descriptor refresh can make a DOM event stale between render and
        // commit. Keep the stored metric unchanged instead of writing a partial
        // or empty catalog target.
        return;
    }

    onSettingsPatch({
        catalog: {
            metricId: selectedMetric.metricId,
            fallbackLabel: selectedMetric.label,
            fallbackUnit: selectedMetric.unit,
        },
    });
}

function countTypeOptions(options: readonly SelectOption<CatalogMetricTypeId | "">[]): number {
    return options.filter(option => option.value !== "" && option.disabled !== true).length;
}

function countEnabledOptions(options: readonly SelectOption[]): number {
    return options.filter(option => option.disabled !== true).length;
}
