import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { multiMetricMessages, stackedMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import type {
    ResolvedMetricTarget,
    ResolvedStackedMetricSlot,
    ResolvedStackedMetricWidget,
} from "../../settings/resolved-settings";
import {
    STACKED_METRIC_MAX_SLOT_COUNT,
    STACKED_METRIC_MIN_SLOT_COUNT,
} from "../../settings/storage/stacked-metric-constraints";
import type {
    SingleMetricWidgetSettingsPatch,
    StoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import { SelectSetting } from "../controls/SelectSetting";
import type { SelectOption } from "../inspector/types";
import type { VisibilityContext } from "../inspector/types";
import { PollingSettings } from "./PollingSettings";
import { SettingsSection } from "./SettingsSection";
import { SingleMetricWidgetSettings } from "./SingleMetricWidgetSettings";
import type { WidgetSettingsPanelProps } from "./panel-props";

type StackedSlotMetricDomain = ResolvedMetricTarget["domain"];

const stackedSlotMetricDomainOptionList = [
    { value: "cpu", label: "CPU" },
    { value: "gpu", label: "GPU" },
    { value: "memory", label: "Memory" },
    { value: "disk", label: "Disk" },
    { value: "network", label: "Network" },
    { value: "catalog", label: "Catalog" },
] as const satisfies readonly SelectOption<StackedSlotMetricDomain>[];

const stackedRotationIntervalOptionList = [
    { value: 1, label: "1s" },
    { value: 2, label: "2s" },
    { value: 3, label: "3s" },
    { value: 4, label: "4s" },
    { value: 5, label: "5s" },
] as const satisfies readonly SelectOption<number>[];

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
            <PollingSettings {...props} note={t(multiMetricMessages.sharedPollingNote)} />
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
                optionList={stackedRotationIntervalOptionList}
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
}: WidgetSettingsPanelProps & {
    readonly slot: ResolvedStackedMetricSlot;
    readonly slotNumber: number;
    readonly onBack: () => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const childContext = buildStackedSlotVisibilityContext(context, slot);

    return (
        <>
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
                        stacked: {
                            updateSlot: {
                                slotId: slot.slotId,
                                metricDomain,
                            },
                        },
                    })}
                />
            </SettingsSection>
            <SingleMetricWidgetSettings
                context={childContext}
                target={slot.widget.slot.metric.target}
                onSettingsPatch={(singleMetric) => onSettingsPatch(wrapStackedSlotSingleMetricPatch(
                    slot.slotId,
                    singleMetric,
                ))}
                viewDisabled={viewDisabled}
                themeDisabled={themeDisabled}
                transparentSurfaceDisabled={transparentSurfaceDisabled}
                colorDisabled={colorDisabled}
                showPolling={false}
            />
        </>
    );
}

function localizeStackedSlotMetricDomainOptions(
    t: ReturnType<typeof useI18n>["t"],
): readonly SelectOption<StackedSlotMetricDomain>[] {
    return stackedSlotMetricDomainOptionList.map(option => option.value === "catalog"
        ? { ...option, label: t(stackedMessages.catalogMetricChoice) }
        : option);
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

function wrapStackedSlotSingleMetricPatch(
    slotId: string,
    singleMetric: SingleMetricWidgetSettingsPatch,
): StoredWidgetSettingsPatch {
    return {
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
        case "catalog":
            return t(stackedMessages.catalogMetricChoice);
    }
}
