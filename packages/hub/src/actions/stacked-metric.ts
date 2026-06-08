import {
    action,
    type DialRotateEvent,
    type DidReceiveSettingsEvent,
    type KeyDownEvent,
    type PropertyInspectorDidAppearEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import { MetricAction } from "./metric-action";
import {
    requireResolvedStackedMetricWidget,
    type ResolvedStackedMetricSlot,
    type ResolvedStackedMetricWidget,
} from "../settings/resolved-settings";
import {
    STREAM_DECK_STACKED_METRIC_ACTION_UUID,
} from "../shared/stream-deck-actions";
import { setMetricView } from "../view-updates/runner";
import type { MetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import {
    buildStackedMetricReadPlan,
    listStackedMetricReadPlanKeys,
    readStackedDisplayedMetricKey,
} from "./stacked-metric/read-plan";
import { buildStackedSingleMetricViewOptions } from "./stacked-metric/single-metric-view-builder";
import type { StackedMetricIndicator } from "../view-rendering/stacked-metric-indicator";
import { refreshCatalogMetricDescriptorRuntimeCache } from "./shared/catalog-metric-descriptor-runtime-cache";
import { refreshDiskVolumeRuntimeCache } from "./shared/disk-volume-runtime-cache";
import { refreshNetworkInterfaceRuntimeCache } from "./shared/network-interface-runtime-cache";
import { logger } from "../logging/logger";
import type { MetricDescriptorSnapshot } from "../runtime/sources/source-client";
import { backgroundMetricCollection } from "../runtime/metric-collection/background-metric-collection";
import { WINDOWS_HELPER_SOURCE_ID } from "../runtime/sources/source-ids";
import { pluginGlobalSettingsStore } from "../settings/global-settings-store";

const INDICATOR_VISIBLE_MILLISECONDS = 1000;
const log = logger.for("Action:StackedMetric");

interface StackedMetricActionState {
    activeSlotId: string | undefined;
    autoRotateTimer: unknown | null;
    indicatorHideTimer: unknown | null;
    indicatorVisible: boolean;
}

export interface StackedMetricTimerScheduler {
    set(callback: () => void, delayMilliseconds: number): unknown;
    clear(handle: unknown): void;
}

const defaultTimerScheduler: StackedMetricTimerScheduler = {
    set: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Stacked Metric action that rotates several complete single-metric slots. */
@action({ UUID: STREAM_DECK_STACKED_METRIC_ACTION_UUID })
export class StackedMetric extends MetricAction {
    protected readonly actionKind = "stackedMetric";

    private readonly states = new Map<string, StackedMetricActionState>();

    constructor(private readonly timerScheduler: StackedMetricTimerScheduler = defaultTimerScheduler) {
        super();
    }

    override onWillAppear(event: WillAppearEvent): void {
        this.states.set(event.action.id, createStackedMetricActionState());
        super.onWillAppear(event);
        this.reconcileActiveSlot(event.action.id);
        this.rescheduleAutoRotate(event.action.id);
    }

    override onDidReceiveSettings(event: DidReceiveSettingsEvent): void {
        super.onDidReceiveSettings(event);
        this.reconcileActiveSlot(event.action.id);
        this.rescheduleAutoRotate(event.action.id);
    }

    override onWillDisappear(event: WillDisappearEvent): void {
        this.disposeActionTimers(event.action.id);
        this.states.delete(event.action.id);
        super.onWillDisappear(event);
    }

    override onKeyDown(event: KeyDownEvent): void {
        this.switchActiveSlot(event.action.id, 1);
    }

    override onDialRotate(event: DialRotateEvent): void {
        if (event.payload.ticks !== 0) {
            this.switchActiveSlot(event.action.id, event.payload.ticks);
        }
    }

    protected override getMetricKeys(event: WillAppearEvent): readonly string[] {
        return listStackedMetricReadPlanKeys(this.buildStackedReadPlan(event));
    }

    protected override getDisplayedMetricKey(event: WillAppearEvent): string | undefined {
        const activeSlot = this.reconcileAndReadActiveSlot(event);

        return activeSlot === undefined
            ? undefined
            : readStackedDisplayedMetricKey(this.buildStackedReadPlan(event), activeSlot.slotId);
    }

    protected override buildMetricCollectionReadPlan(event: WillAppearEvent): MetricReadPlan {
        return this.buildStackedReadPlan(event).readPlan;
    }

    protected override refreshRuntimeCacheForPropertyInspector(event: PropertyInspectorDidAppearEvent): void {
        // Stacked selected-slot editors reuse single metric pickers, but the
        // action itself does not own one stable single-metric target. Warm every
        // runtime picker cache those editors can need.
        refreshCatalogMetricDescriptorRuntimeCache({
            platform: this.currentPlatform(),
            readCachedSourceStatus: sourceId => this.readCachedSourceStatus(sourceId),
            updateRuntimeCache: patch => this.updateRuntimeCache(event, patch),
            readMetricDescriptorSnapshot: () => this.readCatalogMetricDescriptorSnapshot(),
        })
            .catch(error => {
                log.warn(() => `Failed to refresh stacked metric catalog runtime cache: ${String(error)}`);
            });
        this.refreshDiskVolumesForPropertyInspector(event)
            .catch(error => {
                log.warn(() => `Failed to refresh stacked metric disk volume runtime cache: ${String(error)}`);
            });
        this.refreshNetworkInterfacesForPropertyInspector(event)
            .catch(error => {
                log.warn(() => `Failed to refresh stacked metric network interface runtime cache: ${String(error)}`);
            });
    }

    protected refreshDiskVolumesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        return refreshDiskVolumeRuntimeCache({
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
            platform: this.currentPlatform(),
            updateRuntimeCache: patch => this.updateRuntimeCache(event, patch),
        });
    }

    protected refreshNetworkInterfacesForPropertyInspector(event: PropertyInspectorDidAppearEvent): Promise<void> {
        return refreshNetworkInterfaceRuntimeCache({
            defaultSourceProfileId: pluginGlobalSettingsStore.getResolved().defaultSourceProfileId,
            platform: this.currentPlatform(),
            updateRuntimeCache: patch => this.updateRuntimeCache(event, patch),
        });
    }

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const widget = requireResolvedStackedMetricWidget(settings);
        const activeSlot = this.reconcileAndReadActiveSlot(event, widget);
        if (activeSlot === undefined) {
            return;
        }
        const actionState = this.states.get(event.action.id);

        const viewOptions = buildStackedSingleMetricViewOptions({
            event,
            widget: activeSlot.widget,
            preferences: settings.preferences,
            target: activeSlot.widget.slot.metric.target,
            metrics: this.getMetricReader(event),
            platform: this.currentPlatform(),
            currentTimestampMilliseconds: this.currentTimestampMilliseconds(),
            readCachedSourceStatus: sourceId => this.readCachedSourceStatus(sourceId),
        });

        setMetricView({
            ...viewOptions,
            // The active slot renders exactly like a single metric. Stacked
            // adds indicator data only after a completed switch, so the
            // renderer can overlay it without changing slot layout.
            ...(actionState?.indicatorVisible === true
                ? { stackedIndicator: buildStackedMetricIndicator(widget, activeSlot) }
                : {}),
        });
    }

    protected isIndicatorVisibleForTest(actionId: string): boolean {
        return this.states.get(actionId)?.indicatorVisible ?? false;
    }

    protected readActiveSlotIdForTest(actionId: string): string | undefined {
        return this.states.get(actionId)?.activeSlotId;
    }

    protected readCatalogMetricDescriptorSnapshot(): Promise<MetricDescriptorSnapshot> {
        return backgroundMetricCollection.readSourceMetricDescriptors(WINDOWS_HELPER_SOURCE_ID);
    }

    private buildStackedReadPlan(event: WillAppearEvent) {
        return buildStackedMetricReadPlan({
            widget: requireResolvedStackedMetricWidget(this.resolveSettings(event)),
            platform: this.currentPlatform(),
        });
    }

    private switchActiveSlot(actionId: string, stepCount: number): void {
        const widget = requireResolvedStackedMetricWidget(this.resolveSettingsForAction(actionId));
        const activeSlot = this.reconcileAndReadActiveSlot(actionId, widget);
        if (activeSlot === undefined || widget.slots.length <= 1) {
            return;
        }

        const currentIndex = widget.slots.findIndex(slot => slot.slotId === activeSlot.slotId);
        const nextIndex = modulo(currentIndex + stepCount, widget.slots.length);
        const nextSlot = widget.slots[nextIndex];
        if (nextSlot === undefined || nextSlot.slotId === activeSlot.slotId) {
            return;
        }

        const state = this.ensureState(actionId);
        state.activeSlotId = nextSlot.slotId;
        state.indicatorVisible = true;
        this.rescheduleIndicatorHide(actionId);
        this.rescheduleAutoRotate(actionId);
        this.refreshMetricViewForAction(actionId);
    }

    private reconcileAndReadActiveSlot(
        eventOrActionId: WillAppearEvent | string,
        widget: ResolvedStackedMetricWidget = requireResolvedStackedMetricWidget(
            typeof eventOrActionId === "string"
                ? this.resolveSettingsForAction(eventOrActionId)
                : this.resolveSettings(eventOrActionId),
        ),
    ): ResolvedStackedMetricSlot | undefined {
        const actionId = typeof eventOrActionId === "string" ? eventOrActionId : eventOrActionId.action.id;
        const state = this.ensureState(actionId);
        const activeSlot = widget.slots.find(slot => slot.slotId === state.activeSlotId)
            ?? widget.slots[0];

        state.activeSlotId = activeSlot?.slotId;
        return activeSlot;
    }

    private reconcileActiveSlot(actionId: string): void {
        this.reconcileAndReadActiveSlot(actionId);
    }

    private rescheduleAutoRotate(actionId: string): void {
        const state = this.ensureState(actionId);
        const widget = requireResolvedStackedMetricWidget(this.resolveSettingsForAction(actionId));
        if (state.autoRotateTimer !== null) {
            this.timerScheduler.clear(state.autoRotateTimer);
            state.autoRotateTimer = null;
        }

        if (!widget.rotation.autoRotateEnabled || widget.slots.length <= 1) {
            return;
        }

        state.autoRotateTimer = this.timerScheduler.set(() => {
            const currentState = this.states.get(actionId);
            if (currentState === undefined) {
                return;
            }

            this.switchActiveSlot(actionId, 1);
        }, widget.rotation.intervalSeconds * 1000);
    }

    private rescheduleIndicatorHide(actionId: string): void {
        const state = this.ensureState(actionId);
        if (state.indicatorHideTimer !== null) {
            this.timerScheduler.clear(state.indicatorHideTimer);
            state.indicatorHideTimer = null;
        }

        state.indicatorHideTimer = this.timerScheduler.set(() => {
            const currentState = this.states.get(actionId);
            if (currentState === undefined) {
                return;
            }

            currentState.indicatorVisible = false;
            currentState.indicatorHideTimer = null;
            this.refreshMetricViewForAction(actionId);
        }, INDICATOR_VISIBLE_MILLISECONDS);
    }

    private disposeActionTimers(actionId: string): void {
        const state = this.states.get(actionId);
        if (state === undefined) {
            return;
        }

        if (state.autoRotateTimer !== null) {
            this.timerScheduler.clear(state.autoRotateTimer);
        }
        if (state.indicatorHideTimer !== null) {
            this.timerScheduler.clear(state.indicatorHideTimer);
        }
    }

    private ensureState(actionId: string): StackedMetricActionState {
        let state = this.states.get(actionId);
        if (state === undefined) {
            state = createStackedMetricActionState();
            this.states.set(actionId, state);
        }

        return state;
    }
}

function createStackedMetricActionState(): StackedMetricActionState {
    return {
        activeSlotId: undefined,
        autoRotateTimer: null,
        indicatorHideTimer: null,
        indicatorVisible: false,
    };
}

function modulo(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor;
}

function buildStackedMetricIndicator(
    widget: ResolvedStackedMetricWidget,
    activeSlot: ResolvedStackedMetricSlot,
): StackedMetricIndicator {
    // The slot should always be present after reconciliation. Keep the fallback
    // user-safe in case a settings update races with a render.
    return {
        currentIndex: Math.max(1, widget.slots.findIndex(slot => slot.slotId === activeSlot.slotId) + 1),
        totalCount: widget.slots.length,
    };
}
