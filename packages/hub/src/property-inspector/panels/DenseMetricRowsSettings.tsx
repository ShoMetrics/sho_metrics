import { useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { SectionHeading } from "../components/SectionHeading";
import { commonMessages } from "../../i18n/message-groups/shell";
import { catalogMessages, cpuMessages, customMetricMessages, denseMessages, gpuMessages, helperMessages, multiMetricMessages, networkMessages } from "../../i18n/message-groups/widgets";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n, type I18n } from "../../i18n/react";
import type { LocalizedMessage } from "../../i18n/types";
import { readCatalogMetricMaximumInputValue, resolveCatalogMetricMaximumInputLabel, resolveCatalogMetricMaximumInputMaximum, resolveCatalogMetricMaximumInputStep, writeCatalogMetricMaximumInputValue } from "../../metrics/catalog-metric-scale";
import { resolveDefaultDiskVolumeOption } from "../../runtime/disk-volumes";
import { buildDenseCustomHttpConsumerSlug } from "../../runtime/sources/custom-http/custom-http-metric-key";
import type { MetricDescriptor, SourceClientStatus } from "../../runtime/sources/source-client";
import type { ResolvedCpuReading, ResolvedDenseMetricSlot, ResolvedDenseMultiMetricWidget, ResolvedDiskMetricTarget, ResolvedGpuReading, ResolvedMetricTarget, ResolvedNetworkReading, ResolvedSystemMetricTarget } from "../../settings/resolved-settings";
import { DENSE_MULTI_METRIC_MAX_SLOT_COUNT, DENSE_MULTI_METRIC_MIN_SLOT_COUNT } from "../../settings/storage/dense-multi-metric-constraints";
import type { DenseMetricTargetPatch, StoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import { resolveDenseBatteryPrefillLabel } from "../../settings/metric-custom-label-policy";
import { resolveDefaultDenseRowLabel } from "../../settings/dense-metric-row-label";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import type { SelectOption } from "../inspector/types";
import { buildCatalogMetricOptions, type CatalogMetricOptions, type CatalogMetricSelection, type CatalogMetricTypeId, type SelectedCatalogMetric } from "../select-options/catalog-metric-options";
import { resolveDiskVolumeOptions, resolveNetworkInterfaceOptions } from "../select-options/runtime-select-options";
import { resolveHelperStatusGuidanceText } from "./helper-status-guidance";
import { CustomMetricSourceEditorPanel } from "./custom-metric/CustomMetricSourceEditorPanel";
import { BatteryDeviceSelector } from "./BatteryDeviceSettingsSection";
import { resolveMinimumBatteryPollingFrequencySeconds } from "./battery-polling-options";
import {
    buildDiskThroughputMaximumInputSpec,
    buildMillisecondsMaximumInputSpec,
    buildNetworkTrafficMaximumInputSpec,
    buildPercentMaximumInputSpec,
    buildPowerMaximumInputSpec,
    buildTemperatureMaximumInputSpec,
    MetricMaximumNumberSetting,
    readByteRateAsMegabitsPerSecond,
    readByteRateAsMebibytesPerSecond,
    type MetricMaximumInputSpec,
    writeMegabitsPerSecondAsByteRate,
    writeMebibytesPerSecondAsByteRate,
} from "./MetricMaximumSettings";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { SettingsSection } from "./SettingsSection";
import { buildCpuMetricKindOptionList, buildGpuMetricKindOptionList, diskMetricKindOptionList } from "./setting-options";

type DenseMetricCategoryId = "cpu" | "gpu" | "memory" | "disk" | "network" | "system" | "catalog" | "customMetric";

const denseMetricCategoryOptionList = [
    { value: "cpu", label: "CPU" },
    { value: "gpu", label: "GPU" },
    { value: "memory", label: "Memory" },
    { value: "disk", label: "Disk" },
    { value: "network", label: "Network" },
    { value: "system", label: "System & Battery" },
    { value: "catalog", label: "Catalog" },
    { value: "customMetric", label: "Custom Metric" },
] as const satisfies readonly SelectOption<DenseMetricCategoryId>[];

/**
 * Renders the Dense row editor and writes row-scoped metric patches.
 *
 * Dense keeps labels and maximums at the row level, but delegates target-owned
 * editors such as battery device selection and Custom HTTP source editing to
 * their domain components so PI defaults stay aligned with runtime rendering.
 */
export function DenseMetricRowsSettings({
    context,
    widget,
    editingCustomMetricSlotId,
    onEditingCustomMetricSlotIdChange,
    onWidgetChromeSuppressionChange,
    onCustomHttpCredentialUpsert,
    onCustomHttpCredentialDelete,
    onSettingsPatch,
    onGlobalSettingsPatch,
}: WidgetSettingsPanelProps & {
    widget: ResolvedDenseMultiMetricWidget;
    editingCustomMetricSlotId: string | undefined;
    onEditingCustomMetricSlotIdChange: (slotId: string | undefined) => void;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const [isReorderEnabled, setIsReorderEnabled] = useState(false);
    const editingCustomMetricSlot = widget.slots.find(slot =>
        slot.slotId === editingCustomMetricSlotId
        && slot.slot.metric.target.domain === "customMetric",
    );

    if (editingCustomMetricSlot !== undefined) {
        return (
            <DenseCustomMetricSourcePage
                context={context}
                slot={editingCustomMetricSlot}
                onBack={() => onEditingCustomMetricSlotIdChange(undefined)}
                onWidgetChromeSuppressionChange={onWidgetChromeSuppressionChange}
                onCustomHttpCredentialUpsert={onCustomHttpCredentialUpsert}
                onCustomHttpCredentialDelete={onCustomHttpCredentialDelete}
                onSettingsPatch={onSettingsPatch}
            />
        );
    }

    return (
        <SettingsSection title={t(denseMessages.rowsSection)}>
            {widget.slots.map((slot, index) => (
                <DenseMetricRowSettings
                    key={slot.slotId}
                    context={context}
                    slot={slot}
                    rowIndex={index}
                    rowCount={widget.slots.length}
                    isReorderEnabled={isReorderEnabled}
                    onEditCustomMetricSource={onEditingCustomMetricSlotIdChange}
                    onSettingsPatch={onSettingsPatch}
                    onGlobalSettingsPatch={onGlobalSettingsPatch}
                />
            ))}
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">{t(denseMessages.shortLabelNote)}</p>
            </InspectorItem>
            <InspectorItem label={t(denseMessages.reorderLabel)}>
                <label className="native-checkbox-row">
                    <input
                        type="checkbox"
                        checked={isReorderEnabled}
                        onChange={(event) => {
                            setIsReorderEnabled(event.currentTarget.checked);
                        }}
                    />
                    <span>{t(denseMessages.reorderMoveButtonsLabel)}</span>
                </label>
            </InspectorItem>
            <InspectorItem>
                <button
                    className="inline-action-button"
                    type="button"
                    disabled={widget.slots.length >= DENSE_MULTI_METRIC_MAX_SLOT_COUNT}
                    onClick={() => onSettingsPatch({
                        dense: {
                            addSlot: {
                                target: { domain: "memory" },
                                customLabel: undefined,
                                customMaximumValue: undefined,
                            },
                        },
                    })}
                >
                    {t(denseMessages.addMetricButton)}
                </button>
            </InspectorItem>
            {widget.slots.length >= DENSE_MULTI_METRIC_MAX_SLOT_COUNT && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(multiMetricMessages.maxSlotCountReachedNote)}</p>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

function DenseMetricRowSettings({
    context,
    slot,
    rowIndex,
    rowCount,
    isReorderEnabled,
    onEditCustomMetricSource,
    onSettingsPatch,
    onGlobalSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly slot: ResolvedDenseMetricSlot;
    readonly rowIndex: number;
    readonly rowCount: number;
    readonly isReorderEnabled: boolean;
    readonly onEditCustomMetricSource: (slotId: string) => void;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    readonly onGlobalSettingsPatch: WidgetSettingsPanelProps["onGlobalSettingsPatch"];
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const target = slot.slot.metric.target;
    const categoryId = resolveDenseMetricCategoryId(target);
    const maximumInput = resolveDenseMaximumInputSpec(slot, t);

    return (
        <>
            <SectionHeading text={`${t(denseMessages.rowMetricLabel)} ${rowIndex + 1}`} />
            <DenseMetricCategorySetting
                categoryId={categoryId}
                context={context}
                descriptors={context.runtimeCache.availableCatalogMetricDescriptors}
                i18n={i18n}
                slotId={slot.slotId}
                onSettingsPatch={onSettingsPatch}
            />
            <DenseMetricTargetSettings
                context={context}
                target={target}
                slotId={slot.slotId}
                onEditCustomMetricSource={onEditCustomMetricSource}
                onSettingsPatch={onSettingsPatch}
                onGlobalSettingsPatch={onGlobalSettingsPatch}
            />
            <TextSetting
                label={t(denseMessages.rowLabelLabel)}
                value={slot.customLabel ?? ""}
                placeholder={resolveDefaultDenseRowLabel(target)}
                onValueChange={(customLabel) => onSettingsPatch({
                    dense: {
                        updateSlot: {
                            slotId: slot.slotId,
                            customLabel: normalizeDenseLabel(customLabel),
                        },
                    },
                })}
            />
            {maximumInput !== undefined && (
                <MetricMaximumNumberSetting
                    input={maximumInput}
                    onValueChange={(inputValue) => onSettingsPatch({
                        dense: {
                            updateSlot: {
                                slotId: slot.slotId,
                                customMaximumValue: writeDenseMaximumInputValue(target, inputValue),
                            },
                        },
                    })}
                />
            )}
            <InspectorItem>
                <div className="advanced-action-stack">
                    {isReorderEnabled && (
                        <>
                            <button
                                className="inline-action-button"
                                type="button"
                                disabled={rowIndex === 0}
                                onClick={() => onSettingsPatch({
                                    dense: { moveSlot: { slotId: slot.slotId, direction: "up" } },
                                })}
                            >
                                {t(denseMessages.moveUpButton)}
                            </button>
                            <button
                                className="inline-action-button"
                                type="button"
                                disabled={rowIndex === rowCount - 1}
                                onClick={() => onSettingsPatch({
                                    dense: { moveSlot: { slotId: slot.slotId, direction: "down" } },
                                })}
                            >
                                {t(denseMessages.moveDownButton)}
                            </button>
                        </>
                    )}
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={rowCount <= DENSE_MULTI_METRIC_MIN_SLOT_COUNT}
                        onClick={() => onSettingsPatch({
                            dense: { removeSlotId: slot.slotId },
                        })}
                    >
                        {t(denseMessages.removeMetricButton)}
                    </button>
                </div>
            </InspectorItem>
        </>
    );
}

function DenseMetricCategorySetting({
    categoryId,
    context,
    descriptors,
    i18n,
    slotId,
    onSettingsPatch,
}: {
    readonly categoryId: DenseMetricCategoryId;
    readonly context: WidgetSettingsPanelProps["context"];
    readonly descriptors: readonly MetricDescriptor[];
    readonly i18n: I18n;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const { t } = i18n;

    return (
        <SelectSetting
            label={t(denseMessages.rowMetricLabel)}
            value={categoryId}
            optionList={localizeOptionList(t, denseMetricCategoryOptionList, denseMetricCategoryMessageByValue)}
            onValueChange={(nextCategoryId) => {
                onSettingsPatch({
                    ...buildDenseMinimumPollingPatchForMetricCategory(nextCategoryId, context),
                    dense: {
                        updateSlot: {
                            slotId,
                            target: buildDefaultDenseMetricTarget(nextCategoryId, descriptors, i18n),
                            customLabel: undefined,
                            customMaximumValue: undefined,
                        },
                    },
                });
            }}
        />
    );
}

function DenseMetricTargetSettings({
    context,
    target,
    slotId,
    onEditCustomMetricSource,
    onSettingsPatch,
    onGlobalSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly target: ResolvedMetricTarget;
    readonly slotId: string;
    readonly onEditCustomMetricSource: (slotId: string) => void;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    readonly onGlobalSettingsPatch: WidgetSettingsPanelProps["onGlobalSettingsPatch"];
}): React.JSX.Element {
    switch (target.domain) {
        case "cpu":
            return <DenseCpuMetricSetting platform={context.platform} kind={target.reading.kind} slotId={slotId} onSettingsPatch={onSettingsPatch} />;
        case "gpu":
            return <DenseGpuMetricSetting platform={context.platform} kind={target.reading.kind} slotId={slotId} onSettingsPatch={onSettingsPatch} />;
        case "memory":
            return <></>;
        case "disk":
            return <DenseDiskMetricSettings context={context} target={target} slotId={slotId} onSettingsPatch={onSettingsPatch} />;
        case "network":
            return <DenseNetworkMetricSettings context={context} reading={target.reading} slotId={slotId} onSettingsPatch={onSettingsPatch} />;
        case "system":
            return (
                <DenseSystemMetricSettings
                    context={context}
                    target={target}
                    slotId={slotId}
                    onSettingsPatch={onSettingsPatch}
                    onGlobalSettingsPatch={onGlobalSettingsPatch}
                />
            );
        case "catalog":
            return (
                <DenseCatalogMetricSettings
                    descriptors={context.runtimeCache.availableCatalogMetricDescriptors}
                    descriptorStatus={context.runtimeCacheStatus.catalogMetricDescriptorStatus}
                    sourceStatus={context.runtimeCache.catalogMetricDescriptorSourceStatus}
                    metricId={target.metricId}
                    slotId={slotId}
                    onSettingsPatch={onSettingsPatch}
                />
            );
        case "customMetric":
            return (
                <DenseCustomMetricSourceSummary
                    target={target}
                    onEdit={() => onEditCustomMetricSource(slotId)}
                />
            );
    }
}

function DenseSystemMetricSettings({
    context,
    target,
    slotId,
    onSettingsPatch,
    onGlobalSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly target: ResolvedSystemMetricTarget;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    readonly onGlobalSettingsPatch: WidgetSettingsPanelProps["onGlobalSettingsPatch"];
}): React.JSX.Element {
    return (
        <BatteryDeviceSelector
            context={context}
            target={target}
            onBatterySettingsPatch={(system, selectedDevice) => {
                onSettingsPatch({
                    ...buildDenseMinimumPollingPatchForBattery(system.peripheralIdentity, context),
                    dense: {
                        updateSlot: {
                            slotId,
                            customLabel: resolveDenseBatteryPrefillLabel(selectedDevice?.displayName),
                            target: {
                                domain: "system",
                                peripheralIdentity: system.peripheralIdentity,
                                detectedPeripheralDisplayName: system.detectedPeripheralDisplayName,
                            },
                        },
                    },
                });
            }}
            onGlobalSettingsPatch={onGlobalSettingsPatch}
        />
    );
}

function DenseCustomMetricSourceSummary({
    target,
    onEdit,
}: {
    readonly target: Extract<ResolvedMetricTarget, { readonly domain: "customMetric" }>;
    readonly onEdit: () => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <InspectorItem label={t(customMetricMessages.sourceSummaryLabel)}>
            <div className="advanced-action-stack">
                <button
                    className="inline-action-button"
                    type="button"
                    onClick={onEdit}
                >
                    {t(customMetricMessages.editSourceButton)}
                </button>
                <p className="section-note">
                    {target.configuration.state === "configured"
                        ? t(customMetricMessages.sourceConfiguredSummary)
                        : t(customMetricMessages.sourceNeedsSetupSummary)}
                </p>
            </div>
        </InspectorItem>
    );
}

function DenseCustomMetricSourcePage({
    context,
    slot,
    onBack,
    onWidgetChromeSuppressionChange,
    onCustomHttpCredentialUpsert,
    onCustomHttpCredentialDelete,
    onSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly slot: ResolvedDenseMetricSlot;
    readonly onBack: () => void;
    readonly onWidgetChromeSuppressionChange: WidgetSettingsPanelProps["onWidgetChromeSuppressionChange"];
    readonly onCustomHttpCredentialUpsert: WidgetSettingsPanelProps["onCustomHttpCredentialUpsert"];
    readonly onCustomHttpCredentialDelete: WidgetSettingsPanelProps["onCustomHttpCredentialDelete"];
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const target = slot.slot.metric.target;
    if (target.domain !== "customMetric") {
        return <></>;
    }

    return (
        <CustomMetricSourceEditorPanel
            context={context}
            target={target}
            customHttpConsumerSlug={buildDenseCustomHttpConsumerSlug(slot.slotId)}
            onBack={onBack}
            onWidgetChromeSuppressionChange={onWidgetChromeSuppressionChange}
            onCustomHttpCredentialUpsert={onCustomHttpCredentialUpsert}
            onCustomHttpCredentialDelete={onCustomHttpCredentialDelete}
            onSettingsPatch={(patch) => {
                // Dense rows reuse only the Custom HTTP source editor.
                // Visual and polling settings stay owned by the Dense widget.
                if (patch.customMetric === undefined) {
                    return;
                }

                onSettingsPatch({
                    dense: {
                        updateSlot: {
                            slotId: slot.slotId,
                            customMetric: patch.customMetric,
                        },
                    },
                });
            }}
        />
    );
}

function DenseCpuMetricSetting({
    platform,
    kind,
    slotId,
    onSettingsPatch,
}: {
    readonly platform: WidgetSettingsPanelProps["context"]["platform"];
    readonly kind: ResolvedCpuReading["kind"];
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SelectSetting
            label={t(cpuMessages.cpuMetricLabel)}
            value={kind}
            optionList={localizeOptionList(t, buildCpuMetricKindOptionList(platform, kind), cpuMetricKindMessageByValue)}
            onValueChange={(nextKind) => {
                writeDenseSlotTarget(onSettingsPatch, slotId, { domain: "cpu", kind: nextKind });
            }}
        />
    );
}

function DenseGpuMetricSetting({
    platform,
    kind,
    slotId,
    onSettingsPatch,
}: {
    readonly platform: WidgetSettingsPanelProps["context"]["platform"];
    readonly kind: ResolvedGpuReading["kind"];
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SelectSetting
            label={t(gpuMessages.gpuMetricLabel)}
            value={kind}
            optionList={localizeOptionList(t, buildGpuMetricKindOptionList(platform, kind), gpuMetricKindMessageByValue)}
            onValueChange={(nextKind) => {
                writeDenseSlotTarget(onSettingsPatch, slotId, { domain: "gpu", kind: nextKind });
            }}
        />
    );
}

function DenseDiskMetricSettings({
    context,
    target,
    slotId,
    onSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly target: ResolvedDiskMetricTarget;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const reading = target.reading;
    const kind = reading.kind;
    const selectedDiskVolumeId = target.volumeId
        ?? resolveDefaultDiskVolumeOption(context.runtimeCache.availableDiskVolumes)?.id
        ?? "";

    return (
        <>
            <SelectSetting
                label={t(denseMessages.rowMetricSubtypeLabel)}
                value={kind}
                optionList={localizeOptionList(t, diskMetricKindOptionList, diskMetricKindMessageByValue)}
                onValueChange={(nextKind) => {
                    writeDenseSlotTarget(onSettingsPatch, slotId, nextKind === "usage"
                        ? { domain: "disk", kind: "usage" }
                        : { domain: "disk", kind: "throughput", throughputDirection: "read" });
                }}
            />
            {kind === "usage" && (
                <SelectSetting
                    label={t(commonMessages.volumeLabel)}
                    value={selectedDiskVolumeId}
                    optionList={resolveDiskVolumeOptions(context, selectedDiskVolumeId, i18n)}
                    onValueChange={(volumeId) => {
                        writeDenseSlotTarget(onSettingsPatch, slotId, { domain: "disk", kind: "usage", volumeId });
                    }}
                />
            )}
            {kind === "throughput" && (
                <SelectSetting
                    label={t(denseMessages.rowDirectionLabel)}
                    value={reading.direction === "write" ? "write" : "read"}
                    optionList={localizeOptionList(t, singleDirectionDiskThroughputOptionList, diskThroughputDirectionMessageByValue)}
                    onValueChange={(throughputDirection) => {
                        writeDenseSlotTarget(onSettingsPatch, slotId, { domain: "disk", kind: "throughput", throughputDirection });
                    }}
                />
            )}
        </>
    );
}

function DenseNetworkMetricSettings({
    context,
    reading,
    slotId,
    onSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly reading: ResolvedNetworkReading;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const direction = reading.kind === "traffic" && reading.direction === "upload" ? "upload" : "download";
    const interfaceId = reading.kind === "traffic" ? reading.interfaceId ?? "" : "";

    return (
        <>
            <SelectSetting
                label={t(denseMessages.rowDirectionLabel)}
                value={direction}
                optionList={localizeOptionList(t, singleDirectionNetworkOptionList, networkDirectionMessageByValue)}
                onValueChange={(nextDirection) => {
                    writeDenseSlotTargetPreservingCustomDisplay(onSettingsPatch, slotId, {
                        domain: "network",
                        kind: "traffic",
                        direction: nextDirection,
                        interfaceId,
                    });
                }}
            />
            <SelectSetting
                label={t(networkMessages.networkInterfaceLabel)}
                value={interfaceId}
                optionList={resolveNetworkInterfaceOptions(context, i18n)}
                onValueChange={(nextInterfaceId) => {
                    writeDenseSlotTargetPreservingCustomDisplay(onSettingsPatch, slotId, {
                        domain: "network",
                        kind: "traffic",
                        direction,
                        interfaceId: nextInterfaceId,
                    });
                }}
            />
        </>
    );
}

function DenseCatalogMetricSettings({
    descriptors,
    descriptorStatus,
    sourceStatus,
    metricId,
    slotId,
    onSettingsPatch,
}: {
    readonly descriptors: readonly MetricDescriptor[];
    readonly descriptorStatus: "pending" | "ready" | "failed";
    readonly sourceStatus: SourceClientStatus | undefined;
    readonly metricId: string;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const options = buildCatalogMetricOptions(descriptors, { metricId }, i18n);
    const selection = options.resolvedSelection;

    if (descriptors.length === 0) {
        return (
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">{resolveCatalogMetricDescriptorStatusText(i18n, descriptorStatus, sourceStatus)}</p>
            </InspectorItem>
        );
    }

    return (
        <>
            {shouldShowCatalogTypeSetting(options) && (
                <SelectSetting
                    label={t(catalogMessages.typeLabel)}
                    value={selection.typeId}
                    optionList={options.typeOptions}
                    onValueChange={(typeId) => {
                        writeSelectedDenseCatalogMetric(onSettingsPatch, slotId, descriptors, { typeId });
                    }}
                />
            )}
            {selection.typeId.length > 0 && countEnabledOptions(options.hardwareOptions) > 1 && (
                <SelectSetting
                    label={t(catalogMessages.hardwareLabel)}
                    value={selection.hardwareId}
                    optionList={options.hardwareOptions}
                    onValueChange={(hardwareId) => {
                        writeSelectedDenseCatalogMetric(onSettingsPatch, slotId, descriptors, {
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
                        writeSelectedDenseCatalogMetric(onSettingsPatch, slotId, descriptors, {
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
                    onValueChange={(nextMetricId) => {
                        writeSelectedDenseCatalogMetric(onSettingsPatch, slotId, descriptors, { metricId: nextMetricId });
                    }}
                />
            )}
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">{t(helperMessages.sourceHelperOnly)}</p>
            </InspectorItem>
        </>
    );
}

function resolveDenseMetricCategoryId(target: ResolvedMetricTarget): DenseMetricCategoryId {
    switch (target.domain) {
        case "cpu":
        case "gpu":
        case "memory":
        case "disk":
        case "network":
            return target.domain;
        case "system":
            return "system";
        case "catalog":
            return "catalog";
        case "customMetric":
            return "customMetric";
    }
}

function buildDefaultDenseMetricTarget(
    categoryId: DenseMetricCategoryId,
    descriptors: readonly MetricDescriptor[],
    i18n: I18n,
): DenseMetricTargetPatch {
    switch (categoryId) {
        case "cpu":
            return { domain: "cpu", kind: "usage" };
        case "gpu":
            return { domain: "gpu", kind: "usage" };
        case "memory":
            return { domain: "memory" };
        case "disk":
            return { domain: "disk", kind: "usage" };
        case "network":
            return { domain: "network", kind: "traffic", direction: "download" };
        case "system":
            return { domain: "system" };
        case "catalog":
            return buildDenseCatalogMetricTarget(buildCatalogMetricOptions(descriptors, {}, i18n).selectedMetric);
        case "customMetric":
            return { domain: "customMetric" };
    }
}

function writeDenseSlotTarget(
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void,
    slotId: string,
    target: DenseMetricTargetPatch,
): void {
    onSettingsPatch({
        dense: {
            updateSlot: {
                slotId,
                target,
                customLabel: undefined,
                customMaximumValue: undefined,
            },
        },
    });
}

function writeDenseSlotTargetPreservingCustomDisplay(
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void,
    slotId: string,
    target: DenseMetricTargetPatch,
): void {
    // Network direction/interface changes keep the metric in the same traffic unit family,
    // so custom label and maximum remain valid and must not be reset.
    onSettingsPatch({
        dense: {
            updateSlot: {
                slotId,
                target,
            },
        },
    });
}

function writeSelectedDenseCatalogMetric(
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void,
    slotId: string,
    descriptors: readonly MetricDescriptor[],
    selection: Partial<CatalogMetricSelection>,
): void {
    if (selection.typeId === "") {
        writeDenseSlotTarget(onSettingsPatch, slotId, buildEmptyDenseCatalogMetricTarget());
        return;
    }

    const selectedMetric = buildCatalogMetricOptions(descriptors, selection).selectedMetric;
    if (selectedMetric !== undefined) {
        writeDenseSlotTarget(onSettingsPatch, slotId, buildDenseCatalogMetricTarget(selectedMetric));
    }
}

function buildDenseCatalogMetricTarget(selectedMetric: SelectedCatalogMetric | undefined): DenseMetricTargetPatch {
    if (selectedMetric === undefined) {
        return buildEmptyDenseCatalogMetricTarget();
    }

    return {
        domain: "catalog",
        metricId: selectedMetric.metricId,
        detectedLabel: selectedMetric.label,
        detectedUnit: selectedMetric.unit,
        detectedCategory: selectedMetric.category,
        detectedReadingKind: selectedMetric.readingKind,
    };
}

function buildEmptyDenseCatalogMetricTarget(): DenseMetricTargetPatch {
    return {
        domain: "catalog",
        metricId: "",
        detectedLabel: undefined,
        detectedUnit: undefined,
        detectedCategory: undefined,
        detectedReadingKind: undefined,
    };
}

function shouldShowCatalogTypeSetting(options: CatalogMetricOptions): boolean {
    return options.resolvedSelection.typeId.length === 0 || countTypeOptions(options.typeOptions) > 1;
}

function countTypeOptions(options: readonly SelectOption<CatalogMetricTypeId | "">[]): number {
    return options.filter(option => option.value !== "" && option.disabled !== true).length;
}

function countEnabledOptions(options: readonly SelectOption[]): number {
    return options.filter(option => option.disabled !== true).length;
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

function resolveDenseMaximumInputSpec(
    slot: ResolvedDenseMetricSlot,
    t: I18n["t"],
): MetricMaximumInputSpec | undefined {
    const target = slot.slot.metric.target;
    const maximumLabel = t(denseMessages.rowMaximumLabel);

    switch (target.domain) {
        case "cpu":
            return resolveCpuDenseMaximumInputSpec(target, slot.customMaximumValue, t, maximumLabel);
        case "gpu":
            return resolveGpuDenseMaximumInputSpec(target, slot.customMaximumValue, t, maximumLabel);
        case "memory":
            return undefined;
        case "disk":
            return target.reading.kind === "throughput"
                ? buildDiskThroughputMaximumInputSpec(
                    t,
                    target.reading.direction === "write" ? "write" : "read",
                    readByteRateAsMebibytesPerSecond(slot.customMaximumValue),
                )
                : undefined;
        case "network":
            if (target.reading.kind === "ping") {
                return buildMillisecondsMaximumInputSpec(maximumLabel, slot.customMaximumValue);
            }

            return buildNetworkTrafficMaximumInputSpec(
                t,
                target.reading.direction === "upload" ? "upload" : "download",
                readByteRateAsMegabitsPerSecond(slot.customMaximumValue),
            );
        case "catalog":
            return {
                label: resolveCatalogMetricMaximumInputLabel(target.detectedUnit, target.detectedCategory),
                value: readCatalogMetricMaximumInputValue(
                    slot.customMaximumValue,
                    target.detectedUnit,
                    target.detectedCategory,
                ),
                minimum: 0.001,
                maximum: resolveCatalogMetricMaximumInputMaximum(target.detectedUnit, target.detectedCategory),
                step: resolveCatalogMetricMaximumInputStep(target.detectedUnit, target.detectedCategory),
                optional: true,
            };
        case "system":
        case "customMetric":
            return undefined;
    }
}

function writeDenseMaximumInputValue(
    target: ResolvedMetricTarget,
    inputValue: number | undefined,
): number | undefined {
    if (inputValue === undefined) {
        return inputValue;
    }

    if (target.domain === "catalog") {
        return writeCatalogMetricMaximumInputValue(inputValue, target.detectedUnit, target.detectedCategory);
    }

    if (target.domain === "disk" && target.reading.kind === "throughput") {
        return writeMebibytesPerSecondAsByteRate(inputValue);
    }

    if (target.domain === "network" && target.reading.kind === "traffic") {
        return writeMegabitsPerSecondAsByteRate(inputValue);
    }

    return inputValue;
}

function resolveCpuDenseMaximumInputSpec(
    target: Extract<ResolvedMetricTarget, { readonly domain: "cpu" }>,
    customMaximumValue: number | undefined,
    t: I18n["t"],
    maximumLabel: string,
): MetricMaximumInputSpec | undefined {
    switch (target.reading.kind) {
        case "usage":
            return buildPercentMaximumInputSpec(maximumLabel, customMaximumValue);
        case "temperature":
            return buildTemperatureMaximumInputSpec(t, customMaximumValue ?? target.reading.maximumCelsius);
        case "power":
            return buildPowerMaximumInputSpec(t, customMaximumValue ?? target.reading.maximumWatts);
    }
}

function resolveGpuDenseMaximumInputSpec(
    target: Extract<ResolvedMetricTarget, { readonly domain: "gpu" }>,
    customMaximumValue: number | undefined,
    t: I18n["t"],
    maximumLabel: string,
): MetricMaximumInputSpec | undefined {
    switch (target.reading.kind) {
        case "usage":
            return buildPercentMaximumInputSpec(maximumLabel, customMaximumValue);
        case "temperature":
            return buildTemperatureMaximumInputSpec(t, customMaximumValue ?? target.reading.maximumCelsius);
        case "power":
            return buildPowerMaximumInputSpec(t, customMaximumValue ?? target.reading.maximumWatts);
        case "vram":
            return undefined;
    }
}

function normalizeDenseLabel(value: string): string | undefined {
    const normalized = value.trim();
    return normalized.length === 0 ? undefined : normalized;
}

const denseMetricCategoryMessageByValue = {
    cpu: cpuMessages.cpuMetricLabel,
    gpu: gpuMessages.gpuMetricLabel,
    memory: optionMessages.memoryOption,
    disk: optionMessages.diskOption,
    network: optionMessages.networkOption,
    system: {
        en: "System & Battery",
        zh_CN: "系统与电池",
        ja: "システムとバッテリー",
    },
    catalog: denseMessages.catalogMetricChoice,
    customMetric: denseMessages.customMetricChoice,
} as const satisfies Record<DenseMetricCategoryId, LocalizedMessage>;

function buildDenseMinimumPollingPatchForMetricCategory(
    categoryId: DenseMetricCategoryId,
    context: WidgetSettingsPanelProps["context"],
): Pick<StoredWidgetSettingsPatch, "preferences"> {
    return buildDenseMinimumPollingPatch(
        categoryId === "system" ? resolveMinimumBatteryPollingFrequencySeconds(undefined) : 1,
        context,
    );
}

function buildDenseMinimumPollingPatchForBattery(
    peripheralIdentity: ResolvedSystemMetricTarget["reading"]["peripheralIdentity"],
    context: WidgetSettingsPanelProps["context"],
): Pick<StoredWidgetSettingsPatch, "preferences"> {
    return buildDenseMinimumPollingPatch(
        resolveMinimumBatteryPollingFrequencySeconds(peripheralIdentity),
        context,
    );
}

function buildDenseMinimumPollingPatch(
    minimumPollingFrequencySeconds: number,
    context: WidgetSettingsPanelProps["context"],
): Pick<StoredWidgetSettingsPatch, "preferences"> {
    // Dense has one polling interval for all rows. Adding a slower battery row
    // raises the shared floor; removing it leaves the user's current choice as-is.
    return context.resolved.preferences.pollingFrequencySeconds < minimumPollingFrequencySeconds
        ? { preferences: { pollingFrequencySeconds: minimumPollingFrequencySeconds } }
        : {};
}

const cpuMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    temperature: optionMessages.temperatureOption,
    power: optionMessages.powerOption,
} as const satisfies Record<ResolvedCpuReading["kind"], LocalizedMessage>;

const gpuMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    temperature: optionMessages.temperatureOption,
    vram: optionMessages.vramOption,
    power: optionMessages.powerOption,
} as const satisfies Record<ResolvedGpuReading["kind"], LocalizedMessage>;

const diskMetricKindMessageByValue = {
    usage: optionMessages.usageOption,
    throughput: optionMessages.throughputOption,
} as const;

const diskThroughputDirectionMessageByValue = {
    read: optionMessages.readOption,
    write: optionMessages.writeOption,
} as const;

const networkDirectionMessageByValue = {
    upload: optionMessages.uploadOption,
    download: optionMessages.downloadOption,
} as const;

const singleDirectionDiskThroughputOptionList = [
    { value: "read", label: "Read" },
    { value: "write", label: "Write" },
] as const satisfies readonly SelectOption<"read" | "write">[];

const singleDirectionNetworkOptionList = [
    { value: "download", label: "Download" },
    { value: "upload", label: "Upload" },
] as const satisfies readonly SelectOption<"download" | "upload">[];
