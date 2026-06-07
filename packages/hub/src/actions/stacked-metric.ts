import {
    action,
    type DialRotateEvent,
    type DidReceiveSettingsEvent,
    type KeyDownEvent,
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

const INDICATOR_VISIBLE_MILLISECONDS = 1000;

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

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        const settings = this.resolveSettings(event);
        const widget = requireResolvedStackedMetricWidget(settings);
        const activeSlot = this.reconcileAndReadActiveSlot(event, widget);
        if (activeSlot === undefined) {
            return;
        }

        setMetricView(buildStackedSingleMetricViewOptions({
            event,
            widget: activeSlot.widget,
            preferences: settings.preferences,
            target: activeSlot.widget.slot.metric.target,
            metrics: this.getMetricReader(event),
            platform: this.currentPlatform(),
            currentTimestampMilliseconds: this.currentTimestampMilliseconds(),
            readCachedSourceStatus: sourceId => this.readCachedSourceStatus(sourceId),
        }));
    }

    protected isIndicatorVisibleForTest(actionId: string): boolean {
        return this.states.get(actionId)?.indicatorVisible ?? false;
    }

    protected readActiveSlotIdForTest(actionId: string): string | undefined {
        return this.states.get(actionId)?.activeSlotId;
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
