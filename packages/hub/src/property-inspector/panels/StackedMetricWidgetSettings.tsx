import { useEffect, useState } from "react";
import { InspectorItem } from "../components/InspectorItem";
import { stackedMessages } from "../../i18n/message-groups/widgets";
import { useI18n } from "../../i18n/react";
import type {
    ResolvedMetricTarget,
    ResolvedStackedMetricSlot,
    ResolvedStackedMetricWidget,
} from "../../settings/resolved-settings";
import {
    STACKED_METRIC_MAX_INTERVAL_SECONDS,
    STACKED_METRIC_MAX_SLOT_COUNT,
    STACKED_METRIC_MIN_INTERVAL_SECONDS,
    STACKED_METRIC_MIN_SLOT_COUNT,
} from "../../settings/storage/stacked-metric-constraints";
import type {
    SingleMetricWidgetSettingsPatch,
    StoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import { NumberSetting } from "../controls/NumberSetting";
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

export function StackedMetricWidgetSettings(props: WidgetSettingsPanelProps & {
    widget: ResolvedStackedMetricWidget;
}): React.JSX.Element {
    const { widget } = props;
    const [selectedSlotId, setSelectedSlotId] = useState(widget.slots[0]?.slotId);
    const [isReorderEnabled, setIsReorderEnabled] = useState(false);
    const selectedSlot = widget.slots.find(slot => slot.slotId === selectedSlotId)
        ?? widget.slots[0];

    useEffect(() => {
        if (widget.slots.some(slot => slot.slotId === selectedSlotId)) {
            return;
        }

        setSelectedSlotId(widget.slots[0]?.slotId);
    }, [selectedSlotId, widget.slots]);

    return (
        <>
            <StackedSlotListSettings
                widget={widget}
                selectedSlotId={selectedSlot?.slotId}
                isReorderEnabled={isReorderEnabled}
                onReorderEnabledChange={setIsReorderEnabled}
                onSelectedSlotIdChange={setSelectedSlotId}
                onSettingsPatch={props.onSettingsPatch}
            />
            <StackedRotationSettings
                widget={widget}
                onSettingsPatch={props.onSettingsPatch}
            />
            {selectedSlot !== undefined && (
                <StackedSelectedSlotSettings
                    {...props}
                    slot={selectedSlot}
                />
            )}
            <PollingSettings {...props} />
        </>
    );
}

function StackedSlotListSettings({
    widget,
    selectedSlotId,
    isReorderEnabled,
    onReorderEnabledChange,
    onSelectedSlotIdChange,
    onSettingsPatch,
}: {
    readonly widget: ResolvedStackedMetricWidget;
    readonly selectedSlotId: string | undefined;
    readonly isReorderEnabled: boolean;
    readonly onReorderEnabledChange: (isEnabled: boolean) => void;
    readonly onSelectedSlotIdChange: (slotId: string) => void;
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
                            disabled={slot.slotId === selectedSlotId}
                            onClick={() => onSelectedSlotIdChange(slot.slotId)}
                        >
                            {slot.slotId === selectedSlotId
                                ? t(stackedMessages.selectedSlotButton)
                                : t(stackedMessages.editSlotButton)}
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
            <NumberSetting
                label={t(stackedMessages.intervalSecondsLabel)}
                value={widget.rotation.intervalSeconds}
                onValueChange={(intervalSeconds) => onSettingsPatch({
                    stacked: { rotation: { intervalSeconds } },
                })}
                minimum={STACKED_METRIC_MIN_INTERVAL_SECONDS}
                maximum={STACKED_METRIC_MAX_INTERVAL_SECONDS}
                step={1}
            />
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">{t(stackedMessages.manualSwitchNote)}</p>
            </InspectorItem>
        </SettingsSection>
    );
}

function StackedSelectedSlotSettings({
    context,
    slot,
    onSettingsPatch,
    viewDisabled,
    themeDisabled,
    transparentSurfaceDisabled,
    colorDisabled,
}: WidgetSettingsPanelProps & {
    readonly slot: ResolvedStackedMetricSlot;
}): React.JSX.Element {
    const { t } = useI18n();
    const childContext = buildStackedSlotVisibilityContext(context, slot);

    return (
        <>
            <SettingsSection title={t(stackedMessages.selectedSlotSection)}>
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
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{t(stackedMessages.selectedSlotNote)}</p>
                </InspectorItem>
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
