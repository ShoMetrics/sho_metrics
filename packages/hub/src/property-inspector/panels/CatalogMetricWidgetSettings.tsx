import { InspectorItem } from "../components/InspectorItem";
import { catalogMessages, helperMessages } from "../../i18n/message-groups/widgets";
import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n, type I18n } from "../../i18n/react";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import type { SelectOption } from "../inspector/types";
import {
    buildCatalogMetricOptions,
    type CatalogMetricOptions,
    type CatalogMetricSelection,
    type CatalogMetricTypeId,
} from "../select-options/catalog-metric-options";
import {
    readCatalogMetricMaximumInputValue,
    resolveCatalogMetricDefaultMaximumValue,
    resolveCatalogMetricMaximumInputLabel,
    resolveCatalogMetricMaximumInputMaximum,
    resolveCatalogMetricMaximumInputStep,
    writeCatalogMetricMaximumInputValue,
} from "../../metrics/catalog-metric-scale";
import type { MetricDescriptor, SourceClientStatus } from "../../runtime/sources/source-client";
import type { ResolvedCatalogMetricTarget, ScaleMode } from "../../settings/resolved-settings";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { StandardColorSettings } from "./ColorSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { PollingSettings } from "./PollingSettings";
import { LineSettings } from "./LineSettings";
import { SettingsSection } from "./SettingsSection";
import { resolveHelperStatusGuidanceText } from "./helper-status-guidance";
import { scaleModeOptionList } from "./setting-options";
import type { WidgetSettingsPanelProps } from "./panel-props";

type CatalogMetricWidgetSettingsProps = WidgetSettingsPanelProps & {
    target: ResolvedCatalogMetricTarget;
};

export function CatalogMetricWidgetSettings(props: CatalogMetricWidgetSettingsProps): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;

    if (!props.context.isWindows) {
        return (
            <SettingsSection title={t(commonMessages.metricSection)}>
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(catalogMessages.catalogUnsupportedPlatformNotice)}</p>
                </InspectorItem>
            </SettingsSection>
        );
    }

    return (
        <>
            <CatalogMetricPicker {...props} />
            <AppearanceSettings {...props} />
            {props.target.metricId.length > 0 && <CatalogMetricLabelScaleSettings {...props} />}
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
    const i18n = useI18n();
    const { t } = i18n;
    // Keep showing cached descriptors during a transient pending refresh so the
    // picker does not blank out every time the Property Inspector reopens.
    const descriptors = context.runtimeCache.availableCatalogMetricDescriptors;
    const options = buildCatalogMetricOptions(descriptors, {
        metricId: target.metricId,
    }, i18n);
    const selection = options.resolvedSelection;

    return (
        <SettingsSection title={t(commonMessages.metricSection)}>
            {descriptors.length === 0 ? (
                <CatalogMetricDescriptorStatusNote
                    status={context.runtimeCacheStatus.catalogMetricDescriptorStatus}
                    sourceStatus={context.runtimeCache.catalogMetricDescriptorSourceStatus}
                />
            ) : (
                <>
                    {shouldShowTypeSetting(options) && (
                        <SelectSetting
                            label={t(catalogMessages.typeLabel)}
                            value={selection.typeId}
                            optionList={options.typeOptions}
                            onValueChange={(typeId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, target, descriptors, { typeId });
                            }}
                        />
                    )}
                    {selection.typeId.length > 0 && countEnabledOptions(options.hardwareOptions) > 1 && (
                        <SelectSetting
                            label={t(catalogMessages.hardwareLabel)}
                            value={selection.hardwareId}
                            optionList={options.hardwareOptions}
                            onValueChange={(hardwareId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, target, descriptors, {
                                    typeId: selection.typeId,
                                    hardwareId,
                                });
                            }}
                        />
                    )}
                    {selection.hardwareId.length > 0 && countEnabledOptions(options.readingOptions) > 1 && (
                        <SelectSetting
                            label={t(catalogMessages.readingLabel)}
                            value={selection.readingId}
                            optionList={options.readingOptions}
                            onValueChange={(readingId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, target, descriptors, {
                                    typeId: selection.typeId,
                                    hardwareId: selection.hardwareId,
                                    readingId,
                                });
                            }}
                        />
                    )}
                    {selection.readingId.length > 0 && countEnabledOptions(options.metricOptions) > 1 && (
                        <SelectSetting
                            label={t(catalogMessages.metricLabel)}
                            value={selection.metricId}
                            optionList={options.metricOptions}
                            onValueChange={(metricId) => {
                                writeSelectedCatalogMetric(onSettingsPatch, target, descriptors, { metricId });
                            }}
                        />
                    )}
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">{t(helperMessages.sourceHelperOnly)}</p>
                    </InspectorItem>
                </>
            )}
        </SettingsSection>
    );
}

function CatalogMetricDescriptorStatusNote({
    sourceStatus,
    status,
}: {
    sourceStatus: SourceClientStatus | undefined;
    status: "pending" | "ready" | "failed";
}): React.JSX.Element {
    const i18n = useI18n();
    const text = resolveCatalogMetricDescriptorStatusText(i18n, status, sourceStatus);

    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">{text}</p>
        </InspectorItem>
    );
}

function resolveCatalogMetricDescriptorStatusText(
    i18n: I18n,
    status: "pending" | "ready" | "failed",
    sourceStatus: SourceClientStatus | undefined,
): string {
    const { t } = i18n;
    const helperGuidance = resolveHelperStatusGuidanceText(sourceStatus, {
        i18n,
        installSubject: "catalogMetrics",
    });
    if (helperGuidance !== undefined) {
        return helperGuidance;
    }

    return status === "failed"
        ? t(catalogMessages.metricsUnavailable)
        : status === "ready"
            ? t(catalogMessages.noHelperMetrics)
            : t(catalogMessages.loadingMetrics);
}

function CatalogMetricLabelScaleSettings({
    target,
    onSettingsPatch,
}: CatalogMetricWidgetSettingsProps): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const scaleMode: ScaleMode = target.customMaximumValue === undefined ? "auto" : "custom";
    const customMaximumInputValue = readCatalogMetricMaximumInputValue(
        target.customMaximumValue,
        target.detectedUnit,
        target.detectedCategory,
    );

    return (
        <SettingsSection title={t(catalogMessages.labelScaleSection)}>
            <TextSetting
                label={t(catalogMessages.labelLabel)}
                value={target.customLabel ?? ""}
                placeholder={target.detectedLabel ?? t(catalogMessages.detectedLabelPlaceholder)}
                onValueChange={(customLabel) => onSettingsPatch(buildCatalogMetricCustomLabelPatch(customLabel))}
                actionButton={(
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={target.customLabel === undefined}
                        onClick={() => onSettingsPatch(buildCatalogMetricUseDetectedLabelPatch())}
                    >
                        {t(catalogMessages.useDetectedButton)}
                    </button>
                )}
            />
            <SelectSetting<ScaleMode>
                label={t(commonMessages.scaleLabel)}
                value={scaleMode}
                optionList={localizeOptionList(t, scaleModeOptionList, scaleModeMessageByValue)}
                onValueChange={(nextScaleMode) => onSettingsPatch(buildCatalogMetricScaleModePatch(
                    target,
                    nextScaleMode,
                ))}
            />
            {scaleMode === "custom" && (
                <NumberSetting
                    label={resolveCatalogMetricMaximumInputLabel(target.detectedUnit, target.detectedCategory)}
                    value={customMaximumInputValue}
                    onValueChange={(maximumInputValue) => onSettingsPatch({
                        catalog: {
                            customMaximumValue: writeCatalogMetricMaximumInputValue(
                                maximumInputValue,
                                target.detectedUnit,
                                target.detectedCategory,
                            ),
                        },
                    })}
                    minimum={0.001}
                    maximum={resolveCatalogMetricMaximumInputMaximum(target.detectedUnit, target.detectedCategory)}
                    step={resolveCatalogMetricMaximumInputStep(target.detectedUnit, target.detectedCategory)}
                    optional
                />
            )}
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">{t(catalogMessages.catalogLabelScaleResetNote)}</p>
            </InspectorItem>
        </SettingsSection>
    );
}

export function buildCatalogMetricCustomLabelPatch(customLabel: string): StoredWidgetSettingsPatch {
    return {
        catalog: { customLabel: normalizeCustomLabel(customLabel) },
    };
}

export function buildCatalogMetricUseDetectedLabelPatch(): StoredWidgetSettingsPatch {
    return {
        catalog: { customLabel: undefined },
    };
}

export function buildCatalogMetricScaleModePatch(
    target: ResolvedCatalogMetricTarget,
    nextScaleMode: ScaleMode,
): StoredWidgetSettingsPatch {
    return {
        catalog: {
            customMaximumValue: nextScaleMode === "auto"
                ? undefined
                : target.customMaximumValue ?? resolveCatalogMetricDefaultMaximumValue(
                    target.detectedUnit,
                    target.detectedCategory,
                    target.detectedReadingKind,
                ),
        },
    };
}

function shouldShowTypeSetting(
    options: CatalogMetricOptions,
): boolean {
    return options.resolvedSelection.typeId.length === 0 || countTypeOptions(options.typeOptions) > 1;
}

function writeSelectedCatalogMetric(
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void,
    target: ResolvedCatalogMetricTarget,
    descriptors: readonly MetricDescriptor[],
    selection: Partial<CatalogMetricSelection>,
): void {
    const patch = buildCatalogMetricSelectionPatch(target, descriptors, selection);
    if (patch) {
        onSettingsPatch(patch);
    }
}

export function buildCatalogMetricSelectionPatch(
    target: ResolvedCatalogMetricTarget,
    descriptors: readonly MetricDescriptor[],
    selection: Partial<CatalogMetricSelection>,
): StoredWidgetSettingsPatch | undefined {
    if (selection.typeId === "") {
        return {
            catalog: {
                metricId: "",
                detectedLabel: undefined,
                detectedUnit: undefined,
                detectedCategory: undefined,
                detectedReadingKind: undefined,
                customLabel: undefined,
                customMaximumValue: undefined,
            },
        };
    }

    const options = buildCatalogMetricOptions(descriptors, selection);
    const selectedMetric = options.selectedMetric;
    if (!selectedMetric) {
        // A descriptor refresh can make a DOM event stale between render and
        // commit. Keep the stored metric unchanged instead of writing a partial
        // or empty catalog target.
        return undefined;
    }

    return {
        catalog: {
            metricId: selectedMetric.metricId,
            detectedLabel: selectedMetric.label,
            detectedUnit: selectedMetric.unit,
            detectedCategory: selectedMetric.category,
            detectedReadingKind: selectedMetric.readingKind,
            // Keep user overrides only when descriptor refreshes resolve to the
            // same metric. A different metric should not inherit stale CPU/GPU
            // labels or scale values from the previous selection.
            ...(selectedMetric.metricId === target.metricId
                ? {}
                : {
                    customLabel: undefined,
                    customMaximumValue: undefined,
                }),
        },
    };
}

function normalizeCustomLabel(value: string): string | undefined {
    return value.trim().length === 0 ? undefined : value;
}

function countTypeOptions(options: readonly SelectOption<CatalogMetricTypeId | "">[]): number {
    return options.filter(option => option.value !== "" && option.disabled !== true).length;
}

function countEnabledOptions(options: readonly SelectOption[]): number {
    return options.filter(option => option.disabled !== true).length;
}

const scaleModeMessageByValue = {
    auto: optionMessages.autoOption,
    custom: optionMessages.customOption,
} as const;
