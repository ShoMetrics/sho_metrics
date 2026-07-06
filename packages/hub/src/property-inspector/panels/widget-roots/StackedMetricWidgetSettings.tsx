import { useEffect, useState } from "react";
import { InspectorItem } from "../../components/InspectorItem";
import { multiMetricMessages, stackedMessages, systemMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import type {
    ResolvedMetricTarget,
    ResolvedStackedMetricSlot,
    ResolvedStackedMetricWidget,
} from "../../../settings/resolved-settings";
import { readSystemVendorHidPeripheralIdentity } from "../../../settings/resolved-settings";
import {
    STACKED_METRIC_MAX_SLOT_COUNT,
    STACKED_METRIC_MIN_SLOT_COUNT,
} from "../../../settings/storage/stacked-metric-constraints";
import { buildStackedCustomHttpConsumerSlug } from "../../../runtime/sources/custom-http/custom-http-metric-key";
import type {
    SingleMetricWidgetSettingsPatch,
    StoredWidgetSettingsPatch,
} from "../../../settings/storage/patch/widget-settings-patch";
import { SelectSetting } from "../../controls/SelectSetting";
import type { SelectOption } from "../../inspector/types";
import type { VisibilityContext } from "../../inspector/types";
import { PollingSettings } from "../controls/PollingSettings";
import { SettingsSection } from "../controls/SettingsSection";
import { SingleMetricWidgetSettings } from "./SingleMetricWidgetSettings";
import { formatDurationOptionLabel, type OptionLabelFormatter } from "../setting-options";
import {
    resolveBatteryPollingFrequencyOptionsForMinimum,
    resolveMinimumBatteryPollingFrequencySeconds,
} from "../battery-polling-options";
import type { WidgetSettingsPanelProps } from "../panel-props";

type StackedSlotMetricDomain = ResolvedMetricTarget["domain"];

const stackedSlotMetricDomainOptionList = [
    { value: "cpu", label: "CPU" },
    { value: "gpu", label: "GPU" },
    { value: "memory", label: "Memory" },
    { value: "disk", label: "Disk" },
    { value: "network", label: "Network" },
    { value: "system", label: "System & Battery" },
    { value: "catalog", label: "Catalog" },
    { value: "customMetric", label: "Custom Metric" },
] as const satisfies readonly SelectOption<StackedSlotMetricDomain>[];

const STACKED_ROTATION_INTERVAL_SECONDS = [1, 2, 3, 4, 5] as const;

export function StackedMetricWidgetSettings(props: WidgetSettingsPanelProps & {
    widget: ResolvedStackedMetricWidget;
}): React.JSX.Element {
    const { widget } = props;
    const { t } = useI18n();
    const [editingSlotId, setEditingSlotId] = useState<string | undefined>(undefined);
    const [isReorderEnabled, setIsReorderEnabled] = useState(false);
    const editingSlot = widget.slots.find(slot => slot.slotId === editingSlotId);
    const editingSlotIndex = editingSlot === undefined
        ? -1
        : widget.slots.findIndex(slot => slot.slotId === editingSlot.slotId);
    const isEditingSlot = editingSlot !== undefined;

    useEffect(() => {
        // Auto-save settings updates re-render this component frequently; keep
        // the drill-in page open unless the edited slot was actually removed.
        if (editingSlotId === undefined || widget.slots.some(slot => slot.slotId === editingSlotId)) {
            return;
        }

        setEditingSlotId(undefined);
    }, [editingSlotId, widget.slots]);

    useEffect(() => {
        props.onWidgetChromeSuppressionChange?.(isEditingSlot);

        return () => {
            props.onWidgetChromeSuppressionChange?.(false);
        };
    }, [isEditingSlot, props.onWidgetChromeSuppressionChange]);

    if (editingSlot !== undefined && editingSlotIndex >= 0) {
        return (
            <StackedSelectedSlotSettings
                {...props}
                slot={editingSlot}
                slotNumber={editingSlotIndex + 1}
                onBack={() => setEditingSlotId(undefined)}
            />
        );
    }

    return (
        <>
            <StackedSlotListSettings
                widget={widget}
                isReorderEnabled={isReorderEnabled}
                onReorderEnabledChange={setIsReorderEnabled}
                onEditSlot={setEditingSlotId}
                onSettingsPatch={props.onSettingsPatch}
            />
            <StackedRotationSettings
                widget={widget}
                onSettingsPatch={props.onSettingsPatch}
            />
            <PollingSettings
                {...props}
                optionList={resolveStackedPollingFrequencyOptions(
                    widget,
                    props.context.resolved.preferences.pollingFrequencySeconds,
                    t,
                )}
                note={resolveStackedPollingNote(widget, t)}
            />
        </>
    );
}

function StackedSlotListSettings({
    widget,
    isReorderEnabled,
    onReorderEnabledChange,
    onEditSlot,
    onSettingsPatch,
}: {
    readonly widget: ResolvedStackedMetricWidget;
    readonly isReorderEnabled: boolean;
    readonly onReorderEnabledChange: (isEnabled: boolean) => void;
    readonly onEditSlot: (slotId: string) => void;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(stackedMessages.stackSection)}>
            {widget.slots.map((slot, index) => (
                <InspectorItem key={slot.slotId} label={`${t(stackedMessages.slotLabel)} ${index + 1}`}>
                    <div className="advanced-action-stack">
                        <span className="readonly-text">{resolveStackedSlotSummary(slot.widget.slot.metric.target, t)}</span>
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={() => onEditSlot(slot.slotId)}
                        >
                            {t(stackedMessages.editSlotButton)}
                        </button>
                        {isReorderEnabled && (
                            <>
                                <button
                                    className="inline-action-button"
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => onSettingsPatch({
                                        stacked: { moveSlot: { slotId: slot.slotId, direction: "up" } },
                                    })}
                                >
                                    {t(stackedMessages.moveUpButton)}
                                </button>
                                <button
                                    className="inline-action-button"
                                    type="button"
                                    disabled={index === widget.slots.length - 1}
                                    onClick={() => onSettingsPatch({
                                        stacked: { moveSlot: { slotId: slot.slotId, direction: "down" } },
                                    })}
                                >
                                    {t(stackedMessages.moveDownButton)}
                                </button>
                            </>
                        )}
                        <button
                            className="inline-action-button"
                            type="button"
                            disabled={widget.slots.length <= STACKED_METRIC_MIN_SLOT_COUNT}
                            onClick={() => onSettingsPatch({ stacked: { removeSlotId: slot.slotId } })}
                        >
                            {t(stackedMessages.removeSlotButton)}
                        </button>
                    </div>
                </InspectorItem>
            ))}
            <InspectorItem label={t(stackedMessages.reorderLabel)}>
                <label className="native-checkbox-row">
                    <input
                        type="checkbox"
                        checked={isReorderEnabled}
                        onChange={(event) => {
                            onReorderEnabledChange(event.currentTarget.checked);
                        }}
                    />
                    <span>{t(stackedMessages.reorderMoveButtonsLabel)}</span>
                </label>
            </InspectorItem>
            <InspectorItem>
                <button
                    className="inline-action-button"
                    type="button"
                    disabled={widget.slots.length >= STACKED_METRIC_MAX_SLOT_COUNT}
                    onClick={() => onSettingsPatch({ stacked: { addSlot: {} } })}
                >
                    {t(stackedMessages.addSlotButton)}
                </button>
            </InspectorItem>
            {widget.slots.length >= STACKED_METRIC_MAX_SLOT_COUNT && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(multiMetricMessages.maxSlotCountReachedNote)}</p>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

function StackedRotationSettings({
    widget,
    onSettingsPatch,
}: {
    readonly widget: ResolvedStackedMetricWidget;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(stackedMessages.rotationSection)}>
            <InspectorItem label={t(stackedMessages.autoRotateLabel)}>
                <label className="native-checkbox-row">
                    <input
                        type="checkbox"
                        checked={widget.rotation.autoRotateEnabled}
                        onChange={(event) => onSettingsPatch({
                            stacked: { rotation: { autoRotateEnabled: event.currentTarget.checked } },
                        })}
                    />
                    <span>{t(stackedMessages.autoRotateLabel)}</span>
                </label>
            </InspectorItem>
            <SelectSetting
                label={t(stackedMessages.intervalSecondsLabel)}
                value={widget.rotation.intervalSeconds}
                optionList={buildStackedRotationIntervalOptionList(t)}
                onValueChange={(intervalSeconds) => onSettingsPatch({
                    stacked: { rotation: { intervalSeconds } },
                })}
            />
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">
                    <span>{t(stackedMessages.manualSwitchKeyNote)}</span>
                    <br />
                    <span>{t(stackedMessages.manualSwitchDialNote)}</span>
                    <br />
                    <span>{t(stackedMessages.manualSwitchAutoRotateNote)}</span>
                </p>
            </InspectorItem>
        </SettingsSection>
    );
}

function StackedSelectedSlotSettings({
    context,
    slot,
    slotNumber,
    onBack,
    onSettingsPatch,
    viewDisabled,
    themeDisabled,
    transparentSurfaceDisabled,
    colorDisabled,
    onGlobalSettingsPatch,
    onCustomHttpCredentialUpsert,
    onCustomHttpCredentialDelete,
}: WidgetSettingsPanelProps & {
    readonly slot: ResolvedStackedMetricSlot;
    readonly slotNumber: number;
    readonly onBack: () => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const [isChildDrillInOpen, setIsChildDrillInOpen] = useState(false);
    const childContext = buildStackedSlotVisibilityContext(context, slot);

    return (
        <>
            {!isChildDrillInOpen && (
                <SettingsSection title={t(stackedMessages.selectedSlotSection, { slotNumber })}>
                    <InspectorItem>
                        <div className="advanced-action-stack">
                            <button
                                className="inline-action-button"
                                type="button"
                                onClick={onBack}
                            >
                                {t(stackedMessages.backToStackButton)}
                            </button>
                        </div>
                    </InspectorItem>
                    <InspectorItem className="note-item note-item-caption">
                        <p className="section-note">{t(stackedMessages.selectedSlotNote)}</p>
                    </InspectorItem>
                    <SelectSetting
                        label={t(stackedMessages.metricTypeLabel)}
                        value={slot.widget.slot.metric.target.domain}
                        optionList={localizeStackedSlotMetricDomainOptions(t)}
                        onValueChange={(metricDomain) => onSettingsPatch({
                            ...buildStackedPollingPatchForMetricDomain(metricDomain, context),
                            stacked: {
                                updateSlot: {
                                    slotId: slot.slotId,
                                    metricDomain,
                                },
                            },
                        })}
                    />
                </SettingsSection>
            )}
            <SingleMetricWidgetSettings
                context={childContext}
                target={slot.widget.slot.metric.target}
                onSettingsPatch={(singleMetric) => onSettingsPatch(wrapStackedSlotSingleMetricPatch(
                    slot.slotId,
                    singleMetric,
                    context,
                ))}
                viewDisabled={viewDisabled}
                themeDisabled={themeDisabled}
                transparentSurfaceDisabled={transparentSurfaceDisabled}
                colorDisabled={colorDisabled}
                showPolling={false}
                customHttpConsumerSlug={buildStackedCustomHttpConsumerSlug(slot.slotId)}
                onGlobalSettingsPatch={onGlobalSettingsPatch}
                onCustomHttpCredentialUpsert={onCustomHttpCredentialUpsert}
                onCustomHttpCredentialDelete={onCustomHttpCredentialDelete}
                onWidgetChromeSuppressionChange={setIsChildDrillInOpen}
            />
        </>
    );
}

function localizeStackedSlotMetricDomainOptions(
    t: ReturnType<typeof useI18n>["t"],
): readonly SelectOption<StackedSlotMetricDomain>[] {
    return stackedSlotMetricDomainOptionList.map((option) => {
        switch (option.value) {
            case "catalog":
                return { ...option, label: t(stackedMessages.catalogMetricChoice) };
            case "system":
                return { ...option, label: t(stackedMessages.systemMetricChoice) };
            case "customMetric":
                return { ...option, label: t(stackedMessages.customMetricChoice) };
            default:
                return option;
        }
    });
}

function buildStackedSlotVisibilityContext(
    context: VisibilityContext,
    slot: ResolvedStackedMetricSlot,
): VisibilityContext {
    return {
        ...context,
        // Single-metric controls read context.resolved as their source of truth.
        // For Stacked, the selected slot is the editing scope while preferences
        // remain widget-level and are rendered outside the slot editor.
        resolved: {
            ...context.resolved,
            widget: slot.widget,
        },
    };
}

function resolveStackedPollingFrequencyOptions(
    widget: ResolvedStackedMetricWidget,
    currentPollingFrequencySeconds: number,
    t: OptionLabelFormatter,
): readonly SelectOption<number>[] | undefined {
    return resolveBatteryPollingFrequencyOptionsForMinimum({
        minimumPollingFrequencySeconds: resolveStackedMinimumPollingFrequencySeconds(widget),
        currentPollingFrequencySeconds,
        t,
    });
}

function buildStackedRotationIntervalOptionList(t: OptionLabelFormatter): readonly SelectOption<number>[] {
    return STACKED_ROTATION_INTERVAL_SECONDS.map(value => ({
        value,
        label: formatDurationOptionLabel(t, value),
    }));
}

function resolveStackedPollingNote(
    widget: ResolvedStackedMetricWidget,
    t: ReturnType<typeof useI18n>["t"],
): string {
    const sharedPollingNote = t(multiMetricMessages.sharedPollingNote);
    return hasVendorHidBatterySlot(widget)
        ? `${sharedPollingNote}\n${t(systemMessages.infrequentPollingNote)}`
        : sharedPollingNote;
}

function resolveStackedMinimumPollingFrequencySeconds(widget: ResolvedStackedMetricWidget): number {
    return Math.max(
        1,
        ...widget.slots
            .map(slot => resolveSlotMinimumPollingFrequencySeconds(slot.widget.slot.metric.target)),
    );
}

function resolveSlotMinimumPollingFrequencySeconds(target: ResolvedMetricTarget): number {
    return target.domain === "system"
        ? resolveMinimumBatteryPollingFrequencySeconds(target.reading.peripheralIdentity)
        : 1;
}

function hasVendorHidBatterySlot(widget: ResolvedStackedMetricWidget): boolean {
    return widget.slots.some(slot => {
        const target = slot.widget.slot.metric.target;
        return target.domain === "system"
            && readSystemVendorHidPeripheralIdentity(target.reading.peripheralIdentity) !== undefined;
    });
}

function buildStackedPollingPatchForMetricDomain(
    metricDomain: ResolvedMetricTarget["domain"],
    context: WidgetSettingsPanelProps["context"],
): Pick<StoredWidgetSettingsPatch, "preferences"> {
    return buildMinimumPollingPatch(
        metricDomain === "system" ? resolveMinimumBatteryPollingFrequencySeconds(undefined) : 1,
        context,
    );
}

function buildMinimumPollingPatch(
    minimumPollingFrequencySeconds: number,
    context: WidgetSettingsPanelProps["context"],
): Pick<StoredWidgetSettingsPatch, "preferences"> {
    // Stacked has one polling interval for all slots. We only raise it when a
    // newly selected slot needs a slower floor; removing that slot leaves the
    // user's current polling choice alone.
    return context.resolved.preferences.pollingFrequencySeconds < minimumPollingFrequencySeconds
        ? { preferences: { pollingFrequencySeconds: minimumPollingFrequencySeconds } }
        : {};
}

function wrapStackedSlotSingleMetricPatch(
    slotId: string,
    singleMetric: SingleMetricWidgetSettingsPatch,
    context: WidgetSettingsPanelProps["context"],
): StoredWidgetSettingsPatch {
    const peripheralIdentity = singleMetric.system?.peripheralIdentity;
    const minimumPollingFrequencySeconds = peripheralIdentity === undefined
        ? undefined
        : resolveMinimumBatteryPollingFrequencySeconds(peripheralIdentity);

    return {
        ...(minimumPollingFrequencySeconds === undefined
            ? {}
            : buildMinimumPollingPatch(minimumPollingFrequencySeconds, context)),
        stacked: {
            updateSlot: {
                slotId,
                singleMetric,
            },
        },
    };
}

function resolveStackedSlotSummary(target: ResolvedMetricTarget, t: ReturnType<typeof useI18n>["t"]): string {
    switch (target.domain) {
        case "cpu":
            return "CPU";
        case "gpu":
            return "GPU";
        case "memory":
            return "Memory";
        case "disk":
            return "Disk";
        case "network":
            return "Network";
        case "system":
            return t(stackedMessages.systemMetricChoice);
        case "catalog":
            return t(stackedMessages.catalogMetricChoice);
        case "customMetric":
            return t(stackedMessages.customMetricChoice);
    }
}
