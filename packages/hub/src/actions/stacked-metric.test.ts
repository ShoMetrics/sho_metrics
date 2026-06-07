import assert from "node:assert/strict";
import test from "node:test";
import type {
    DialRotateEvent,
    KeyDownEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import { StackedMetric, type StackedMetricTimerScheduler } from "./stacked-metric";
import type { MetricCollectionBinding } from "./metric-action";
import {
    CPU_MODEL_METRIC_KEY,
    CPU_USAGE_METRIC_KEY,
    RAM_TOTAL_METRIC_KEY,
    RAM_USED_METRIC_KEY,
} from "../runtime/metric-keys";

test("stacked metric subscribes all slots and schedules default auto rotate", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-subscribe-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));

        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-1");
        assert.equal(action.bindings[0]?.refreshOptionsList.length, 1);
        assert.deepEqual(action.bindings[0]?.refreshOptionsList[0]?.readPlan.metrics.map(metric => metric.metricKey), [
            CPU_MODEL_METRIC_KEY,
            CPU_USAGE_METRIC_KEY,
            RAM_TOTAL_METRIC_KEY,
            RAM_USED_METRIC_KEY,
        ]);
        assert.equal(timers.scheduledTimers[0]?.delayMilliseconds, 3000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric key press switches to the next slot and resets timers", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-key-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));
        const firstAutoTimer = timers.scheduledTimers[0]?.handle;

        action.onKeyDown(buildKeyDownEvent(streamDeckAction));

        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
        assert.equal(action.indicatorVisible(streamDeckAction.id), true);
        assert.deepEqual(timers.clearedHandles, [firstAutoTimer]);
        assert.equal(timers.scheduledTimers.at(-2)?.delayMilliseconds, 1000);
        assert.equal(timers.scheduledTimers.at(-1)?.delayMilliseconds, 3000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric dial rotation moves by tick count", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-dial-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings({
            thirdSlot: true,
        })));

        action.onDialRotate(buildDialRotateEvent(streamDeckAction, 2));
        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-3");

        action.onDialRotate(buildDialRotateEvent(streamDeckAction, -1));
        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric auto rotate can be disabled", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-disabled-auto-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings({
            autoRotateEnabled: false,
        })));

        assert.equal(timers.scheduledTimers.length, 0);
        action.onKeyDown(buildKeyDownEvent(streamDeckAction));
        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
        assert.equal(timers.scheduledTimers.length, 1);
        assert.equal(timers.scheduledTimers[0]?.delayMilliseconds, 1000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric auto rotate timer switches and reschedules", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-auto-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));
        const autoTimer = timers.scheduledTimers[0];

        timers.run(autoTimer?.handle);

        assert.equal(action.activeSlotId(streamDeckAction.id), "slot-2");
        assert.equal(action.indicatorVisible(streamDeckAction.id), true);
        assert.equal(timers.scheduledTimers.at(-1)?.delayMilliseconds, 3000);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("stacked metric dispose clears auto and indicator timers", () => {
    const timers = new FakeTimerScheduler();
    const action = new TestStackedMetric(timers);
    const streamDeckAction = new FakeStreamDeckAction("stacked-dispose-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildStackedWidgetSettings()));
    action.onKeyDown(buildKeyDownEvent(streamDeckAction));
    const liveHandles = timers.scheduledTimers
        .map(timer => timer.handle)
        .filter(handle => !timers.clearedHandles.includes(handle));

    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    for (const handle of liveHandles) {
        assert.equal(timers.clearedHandles.includes(handle), true);
    }
});

class TestStackedMetric extends StackedMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];

    constructor(timerScheduler: StackedMetricTimerScheduler) {
        super(timerScheduler);
    }

    activeSlotId(actionId: string): string | undefined {
        return this.readActiveSlotIdForTest(actionId);
    }

    indicatorVisible(actionId: string): boolean {
        return this.isIndicatorVisibleForTest(actionId);
    }

    protected override onMetricsUpdate(event: WillAppearEvent): void {
        void event;
    }

    protected override createMetricCollectionBinding(): MetricCollectionBinding {
        const binding = new FakeMetricCollectionBinding();
        this.bindings.push(binding);
        return binding;
    }
}

class FakeMetricCollectionBinding implements MetricCollectionBinding {
    readonly refreshOptionsList: Parameters<MetricCollectionBinding["refresh"]>[0][] = [];
    disposeCallCount = 0;

    refresh(options: Parameters<MetricCollectionBinding["refresh"]>[0]): void {
        this.refreshOptionsList.push(options);
    }

    dispose(): void {
        this.disposeCallCount += 1;
    }
}

class FakeTimerScheduler implements StackedMetricTimerScheduler {
    readonly scheduledTimers: Array<{
        readonly handle: number;
        readonly delayMilliseconds: number;
        readonly callback: () => void;
    }> = [];
    readonly clearedHandles: number[] = [];
    private nextHandle = 1;

    set(callback: () => void, delayMilliseconds: number): number {
        const handle = this.nextHandle;
        this.nextHandle += 1;
        this.scheduledTimers.push({ handle, delayMilliseconds, callback });
        return handle;
    }

    clear(handle: unknown): void {
        if (typeof handle === "number") {
            this.clearedHandles.push(handle);
        }
    }

    run(handle: number | undefined): void {
        const timer = this.scheduledTimers.find(candidateTimer => candidateTimer.handle === handle);
        if (timer === undefined) {
            throw new Error(`Unknown fake timer handle: ${String(handle)}`);
        }

        timer.callback();
    }
}

class FakeStreamDeckAction {
    readonly writtenSettingsList: unknown[] = [];

    constructor(readonly id: string) {}

    setSettings(settings: unknown): Promise<void> {
        this.writtenSettingsList.push(settings);
        return Promise.resolve();
    }
}

function buildStackedWidgetSettings(options: {
    readonly autoRotateEnabled?: boolean | undefined;
    readonly thirdSlot?: boolean | undefined;
} = {}): unknown {
    return {
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
                ...(options.thirdSlot
                    ? [{ slotId: "slot-3", singleMetric: { slot: { metric: { gpu: {} } } } }]
                    : []),
            ],
            ...(options.autoRotateEnabled === undefined
                ? {}
                : { rotation: { autoRotateEnabled: options.autoRotateEnabled } }),
        },
    };
}

function buildWillAppearEvent(action: FakeStreamDeckAction, settings: unknown): WillAppearEvent {
    return {
        action,
        payload: { settings },
    } as unknown as WillAppearEvent;
}

function buildKeyDownEvent(action: FakeStreamDeckAction): KeyDownEvent {
    return { action } as unknown as KeyDownEvent;
}

function buildDialRotateEvent(action: FakeStreamDeckAction, ticks: number): DialRotateEvent {
    return {
        action,
        payload: { ticks },
    } as unknown as DialRotateEvent;
}

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}
