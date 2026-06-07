import { useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { commonMessages } from "../../i18n/message-groups/shell";
import { catalogMessages, cpuMessages, denseMessages, gpuMessages, helperMessages } from "../../i18n/message-groups/widgets";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n, type I18n } from "../../i18n/react";
import type { LocalizedMessage } from "../../i18n/types";
import { readCatalogMetricMaximumInputValue, resolveCatalogMetricMaximumInputLabel, resolveCatalogMetricMaximumInputMaximum, resolveCatalogMetricMaximumInputStep, writeCatalogMetricMaximumInputValue } from "../../metrics/catalog-metric-scale";
import { resolveDefaultDiskVolumeOption } from "../../runtime/disk-volumes";
import type { MetricDescriptor, SourceClientStatus } from "../../runtime/sources/source-client";
import type { ResolvedCpuReading, ResolvedDenseMetricSlot, ResolvedDenseMultiMetricWidget, ResolvedDiskMetricTarget, ResolvedGpuReading, ResolvedMetricTarget, ResolvedNetworkReading } from "../../settings/resolved-settings";
import { DENSE_MULTI_METRIC_MAX_SLOT_COUNT, DENSE_MULTI_METRIC_MIN_SLOT_COUNT } from "../../settings/storage/dense-multi-metric-constraints";
import type { DenseMetricTargetPatch, StoredWidgetSettingsPatch } from "../../settings/storage/widget-settings-patch";
import { NumberSetting } from "../controls/NumberSetting";
import { SelectSetting } from "../controls/SelectSetting";
import { TextSetting } from "../controls/TextSetting";
import type { SelectOption } from "../inspector/types";
import { buildCatalogMetricOptions, type CatalogMetricOptions, type CatalogMetricSelection, type CatalogMetricTypeId, type SelectedCatalogMetric } from "../select-options/catalog-metric-options";
import { resolveDiskVolumeOptions } from "../select-options/runtime-select-options";
import { resolveHelperStatusGuidanceText } from "./helper-status-guidance";
import type { WidgetSettingsPanelProps } from "./panel-props";
import { SettingsSection } from "./SettingsSection";
import { buildCpuMetricKindOptionList, buildGpuMetricKindOptionList, diskMetricKindOptionList } from "./setting-options";

type DenseMetricCategoryId = "cpu" | "gpu" | "memory" | "disk" | "network" | "catalog";

const denseMetricCategoryOptionList = [
    { value: "cpu", label: "CPU" },
    { value: "gpu", label: "GPU" },
    { value: "memory", label: "Memory" },
    { value: "disk", label: "Disk" },
    { value: "network", label: "Network" },
    { value: "catalog", label: "Catalog" },
] as const satisfies readonly SelectOption<DenseMetricCategoryId>[];

export function DenseMetricRowsSettings({
    context,
    widget,
    onSettingsPatch,
}: WidgetSettingsPanelProps & {
    widget: ResolvedDenseMultiMetricWidget;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const [isReorderEnabled, setIsReorderEnabled] = useState(false);

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
                    onSettingsPatch={onSettingsPatch}
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
        </SettingsSection>
    );
}

function DenseMetricRowSettings({
    context,
    slot,
    rowIndex,
    rowCount,
    isReorderEnabled,
    onSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly slot: ResolvedDenseMetricSlot;
    readonly rowIndex: number;
    readonly rowCount: number;
    readonly isReorderEnabled: boolean;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const i18n = useI18n();
    const { t } = i18n;
    const target = slot.slot.metric.target;
    const categoryId = resolveDenseMetricCategoryId(target);
    const maximumInput = readDenseMaximumInputValue(slot);

    return (
        <>
            <DenseMetricCategorySetting
                categoryId={categoryId}
                rowIndex={rowIndex}
                descriptors={context.runtimeCache.availableCatalogMetricDescriptors}
                i18n={i18n}
                slotId={slot.slotId}
                onSettingsPatch={onSettingsPatch}
            />
            <DenseMetricTargetSettings
                context={context}
                target={target}
                slotId={slot.slotId}
                onSettingsPatch={onSettingsPatch}
            />
            <TextSetting
                label={t(denseMessages.rowLabelLabel)}
                value={slot.customLabel ?? ""}
                placeholder={resolveDenseMetricPlaceholderLabel(target)}
                onValueChange={(customLabel) => onSettingsPatch({
                    dense: {
                        updateSlot: {
                            slotId: slot.slotId,
                            customLabel: normalizeDenseLabel(customLabel),
                        },
                    },
                })}
            />
            <NumberSetting
                label={resolveDenseMaximumInputLabel(target, t)}
                value={maximumInput}
                onValueChange={(inputValue) => onSettingsPatch({
                    dense: {
                        updateSlot: {
                            slotId: slot.slotId,
                            customMaximumValue: writeDenseMaximumInputValue(target, inputValue),
                        },
                    },
                })}
                minimum={0.001}
                maximum={resolveDenseMaximumInputMaximum(target)}
                step={resolveDenseMaximumInputStep(target)}
                optional
            />
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
    rowIndex,
    descriptors,
    i18n,
    slotId,
    onSettingsPatch,
}: {
    readonly categoryId: DenseMetricCategoryId;
    readonly rowIndex: number;
    readonly descriptors: readonly MetricDescriptor[];
    readonly i18n: I18n;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const { t } = i18n;

    return (
        <SelectSetting
            label={`${t(denseMessages.rowMetricLabel)} ${rowIndex + 1}`}
            value={categoryId}
            optionList={localizeOptionList(t, denseMetricCategoryOptionList, denseMetricCategoryMessageByValue)}
            onValueChange={(nextCategoryId) => {
                onSettingsPatch({
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
    onSettingsPatch,
}: {
    readonly context: WidgetSettingsPanelProps["context"];
    readonly target: ResolvedMetricTarget;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
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
            return <DenseNetworkMetricSettings reading={target.reading} slotId={slotId} onSettingsPatch={onSettingsPatch} />;
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
    }
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
    reading,
    slotId,
    onSettingsPatch,
}: {
    readonly reading: ResolvedNetworkReading;
    readonly slotId: string;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const direction = reading.kind === "traffic" && reading.direction === "upload" ? "upload" : "download";

    return (
        <SelectSetting
            label={t(denseMessages.rowDirectionLabel)}
            value={direction}
            optionList={localizeOptionList(t, singleDirectionNetworkOptionList, networkDirectionMessageByValue)}
            onValueChange={(nextDirection) => {
                writeDenseSlotTarget(onSettingsPatch, slotId, { domain: "network", kind: "traffic", direction: nextDirection });
            }}
        />
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
        case "catalog":
            return "catalog";
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
        case "catalog":
            return buildDenseCatalogMetricTarget(buildCatalogMetricOptions(descriptors, {}, i18n).selectedMetric);
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

function readDenseMaximumInputValue(slot: ResolvedDenseMetricSlot): number | undefined {
    const target = slot.slot.metric.target;
    if (target.domain !== "catalog") {
        return slot.customMaximumValue;
    }

    return readCatalogMetricMaximumInputValue(slot.customMaximumValue, target.detectedUnit, target.detectedCategory);
}

function writeDenseMaximumInputValue(
    target: ResolvedMetricTarget,
    inputValue: number | undefined,
): number | undefined {
    if (inputValue === undefined || target.domain !== "catalog") {
        return inputValue;
    }

    return writeCatalogMetricMaximumInputValue(inputValue, target.detectedUnit, target.detectedCategory);
}

function resolveDenseMaximumInputLabel(target: ResolvedMetricTarget, t: I18n["t"]): string {
    return target.domain === "catalog"
        ? resolveCatalogMetricMaximumInputLabel(target.detectedUnit, target.detectedCategory)
        : t(denseMessages.rowMaximumLabel);
}

function resolveDenseMaximumInputMaximum(target: ResolvedMetricTarget): number | undefined {
    return target.domain === "catalog"
        ? resolveCatalogMetricMaximumInputMaximum(target.detectedUnit, target.detectedCategory)
        : 1_000_000_000;
}

function resolveDenseMaximumInputStep(target: ResolvedMetricTarget): number {
    return target.domain === "catalog"
        ? resolveCatalogMetricMaximumInputStep(target.detectedUnit, target.detectedCategory)
        : 1;
}

function resolveDenseMetricPlaceholderLabel(target: ResolvedMetricTarget): string {
    switch (target.domain) {
        case "cpu":
            return "CPU";
        case "gpu":
            return target.reading.kind === "vram" ? "VRAM" : "GPU";
        case "memory":
            return "RAM";
        case "disk":
            return target.reading.kind === "usage" ? "DSK" : "DISK";
        case "network":
            return target.reading.kind === "traffic" && target.reading.direction === "upload" ? "UP" : "DOWN";
        case "catalog":
            return target.detectedLabel ?? "METRIC";
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
    catalog: denseMessages.catalogMetricChoice,
} as const satisfies Record<DenseMetricCategoryId, LocalizedMessage>;

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
