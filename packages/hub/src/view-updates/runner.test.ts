import assert from "node:assert/strict";
import test from "node:test";
import { Target, type WillAppearEvent } from "@elgato/streamdeck";
import type { ResolvedAppearanceSettingsOverride } from "../settings/appearance-overrides";
import { buildDefaultAppearanceSettings } from "../settings/default-appearance-settings";
import type { WidgetData } from "../view-rendering/widget-data";
import type { ProgressCircleStatusIcon } from "../widgets/primitives/progress-circle";
import { DEFAULT_COLOR_COMPENSATION_PROFILE, type ColorCompensationProfile } from "../color-compensation/types";
import { updateCommittedColorCompensationProfileFromStoredSettings } from "../color-compensation/runtime-store";
import { writeStoredColorCompensationProfile } from "../settings/storage/color-compensation-settings";
import { readStoredGlobalSettings } from "../settings/storage/codec";
import * as rasterizer from "../view-rendering/rasterizer";
import { CUSTOM_HTTP_METRIC_KEY_PREFIX } from "../runtime/sources/custom-http/custom-http-metric-key";
import type { MetricViewPerformanceRenderContext } from "./performance-stats";
import {
    clearMetricViewState,
    MetricViewUpdateRunner,
    setMetricView,
    type MetricViewOptions,
} from "./runner";

type RecordMetricViewPerformanceSample =
    typeof import("./view-update-observability")["recordMetricViewPerformanceSample"];
type RasterizeSvgToPngDataUrl = typeof rasterizer.rasterizeSvgToPngDataUrl;

interface RasterizerRecorder {
    readonly svgList: string[];
    restore(): void;
}

test("repeated updates for one action render only the latest pending options", async () => {
    const firstAction = new FakeKeyAction("latest-action");
    const latestAction = new FakeKeyAction("latest-action");

    try {
        setMetricView(buildMetricViewOptions(firstAction, {
            widgetData: buildWidgetData({ current: 1, displayValue: "1" }),
        }));
        setMetricView(buildMetricViewOptions(latestAction, {
            widgetData: buildWidgetData({ current: 2, displayValue: "2" }),
        }));

        await waitForImageCall(latestAction);

        assert.deepEqual(firstAction.calls, []);
        assert.equal(latestAction.imageDataUrlList.length, 1);
    } finally {
        clearMetricViewState("latest-action");
    }
});

test("clearing queued state before the drain prevents dispatch", async () => {
    const action = new FakeKeyAction("cleared-action");

    setMetricView(buildMetricViewOptions(action));
    clearMetricViewState(action.id);

    await waitForScheduledWork();

    assert.deepEqual(action.calls, []);
});

test("updates submitted during an in-flight render are rendered after the first dispatch settles", async () => {
    const firstDispatch = createDeferred<void>();
    const firstAction = new FakeKeyAction("in-flight-action", firstDispatch.promise);
    const pendingAction = new FakeKeyAction("in-flight-action");

    try {
        setMetricView(buildMetricViewOptions(firstAction, {
            widgetData: buildWidgetData({ current: 1, displayValue: "1" }),
        }));
        await waitForImageCall(firstAction);

        setMetricView(buildMetricViewOptions(pendingAction, {
            widgetData: buildWidgetData({ current: 2, displayValue: "2" }),
        }));
        await waitForScheduledWork();

        assert.equal(pendingAction.imageDataUrlList.length, 0);

        firstDispatch.resolve();
        await waitForImageCall(pendingAction);

        assert.equal(firstAction.imageDataUrlList.length, 1);
        assert.equal(pendingAction.imageDataUrlList.length, 1);
    } finally {
        firstDispatch.resolve();
        clearMetricViewState("in-flight-action");
    }
});

test("a pending settings-change update reason is not overwritten by a metric tick", async () => {
    const action = new FakeKeyAction("settings-priority-action");
    const updateReasons = await recordMetricViewUpdateReasons(async () => {
        setMetricView(buildMetricViewOptions(action, {
            appearanceOverride: { view: { selectedView: "circle" } },
        }));
        setMetricView(buildMetricViewOptions(action, {
            appearanceOverride: { view: { selectedView: "bar" } },
        }));
        setMetricView(buildMetricViewOptions(action, {
            appearanceOverride: { view: { selectedView: "bar" } },
            widgetData: buildWidgetData({ current: 3, displayValue: "3" }),
        }));

        await waitForImageCall(action);
    });

    try {
        assert.deepEqual(updateReasons, ["settings-change"]);
    } finally {
        clearMetricViewState(action.id);
    }
});

test("custom HTTP metric keys are reported as the custom render family", async () => {
    const action = new FakeKeyAction("custom-http-family-action");
    const renderContexts = await recordMetricViewPerformanceRenderContexts(async () => {
        setMetricView(buildMetricViewOptions(action, {
            metricKey: `${CUSTOM_HTTP_METRIC_KEY_PREFIX}api-example-com:action-1:single`,
        }));

        await waitForImageCall(action);
    });

    try {
        assert.equal(renderContexts.length, 1);
        assert.equal(renderContexts[0]?.metricFamily, "custom");
    } finally {
        clearMetricViewState(action.id);
    }
});

test("separate runner instances do not share action state", async () => {
    const firstRunner = new MetricViewUpdateRunner();
    const secondRunner = new MetricViewUpdateRunner();
    const firstAction = new FakeKeyAction("shared-instance-action");
    const secondAction = new FakeKeyAction("shared-instance-action");

    try {
        firstRunner.setMetricView(buildMetricViewOptions(firstAction, {
            widgetData: buildWidgetData({ current: 1, displayValue: "1" }),
        }));
        secondRunner.setMetricView(buildMetricViewOptions(secondAction, {
            widgetData: buildWidgetData({ current: 2, displayValue: "2" }),
        }));

        await waitForImageCall(firstAction);
        await waitForImageCall(secondAction);

        assert.equal(firstAction.imageDataUrlList.length, 1);
        assert.equal(secondAction.imageDataUrlList.length, 1);
    } finally {
        firstRunner.clearMetricViewState(firstAction.id);
        secondRunner.clearMetricViewState(secondAction.id);
    }
});

test("identity color compensation profile rasterizes one image", async () => {
    const runner = new MetricViewUpdateRunner();
    const action = new FakeKeyAction("identity-compensation-action");
    const rasterizerRecorder = installRasterizerRecorder();

    try {
        updateCommittedColorCompensationProfile(DEFAULT_COLOR_COMPENSATION_PROFILE);
        runner.setMetricView(buildMetricViewOptions(action));

        await waitForImageCall(action);

        assert.equal(rasterizerRecorder.svgList.length, 1);
        assert.equal(rasterizerRecorder.svgList[0].includes("runtime-color-compensation"), false);
        assert.deepEqual(action.imageTargetList, [undefined]);
    } finally {
        runner.clearMetricViewState(action.id);
        rasterizerRecorder.restore();
        updateCommittedColorCompensationProfile(DEFAULT_COLOR_COMPENSATION_PROFILE);
    }
});

test("effective color compensation profile keeps software image unadjusted", async () => {
    const runner = new MetricViewUpdateRunner();
    const action = new FakeKeyAction("effective-compensation-action");
    const rasterizerRecorder = installRasterizerRecorder();

    try {
        updateCommittedColorCompensationProfile({
            brightnessAdjustment: 2,
            shadowAdjustment: 1,
            gammaAdjustment: -1,
            saturationAdjustment: 3,
        });
        runner.setMetricView(buildMetricViewOptions(action));

        await waitForImageCallCount(action, 2);

        assert.equal(rasterizerRecorder.svgList.length, 2);
        assert.equal(rasterizerRecorder.svgList[0].includes("runtime-color-compensation"), false);
        assert.equal(rasterizerRecorder.svgList[1].includes("runtime-color-compensation"), true);
        assert.deepEqual(action.imageTargetList, [Target.Software, Target.Hardware]);
    } finally {
        runner.clearMetricViewState(action.id);
        rasterizerRecorder.restore();
        updateCommittedColorCompensationProfile(DEFAULT_COLOR_COMPENSATION_PROFILE);
    }
});

class FakeKeyAction {
    readonly calls: string[] = [];
    readonly imageDataUrlList: string[] = [];
    readonly imageTargetList: Array<Target | undefined> = [];
    readonly device = { id: "device-1" };

    constructor(
        readonly id: string,
        private readonly setImagePromise: Promise<void> = Promise.resolve(),
    ) {}

    isKey(): boolean {
        return true;
    }

    isDial(): boolean {
        return false;
    }

    setTitle(title: string): Promise<void> {
        this.calls.push(`setTitle:${title}`);
        return Promise.resolve();
    }

    setImage(pngDataUrl: string, options?: { readonly target?: Target }): Promise<void> {
        this.calls.push("setImage");
        this.imageDataUrlList.push(pngDataUrl);
        this.imageTargetList.push(options?.target);
        return this.setImagePromise;
    }
}

function buildMetricViewOptions(action: FakeKeyAction, options: {
    metricKey?: string | undefined;
    widgetData?: WidgetData | undefined;
    appearanceOverride?: ResolvedAppearanceSettingsOverride | undefined;
} = {}): MetricViewOptions {
    return {
        event: buildEvent(action),
        metricKey: options.metricKey ?? "cpu.usage_percent",
        metricRenderKind: "singleMetric",
        centerIconFragment: "<path />",
        statusIcon: buildStatusIcon(),
        widgetData: options.widgetData ?? buildWidgetData(),
        resolvedSettings: buildDefaultAppearanceSettings(options.appearanceOverride),
    };
}

function buildEvent(action: FakeKeyAction): WillAppearEvent {
    return { action } as unknown as WillAppearEvent;
}

function buildWidgetData(options: Partial<WidgetData> = {}): WidgetData {
    return {
        current: options.current ?? 42,
        progress: options.progress ?? 0.42,
        history: options.history ?? [40, 42],
        unit: options.unit ?? "%",
        label: options.label ?? "CPU",
        displayValue: options.displayValue,
        sampleTimestampMilliseconds: options.sampleTimestampMilliseconds ?? 1000,
    };
}

function buildStatusIcon(): ProgressCircleStatusIcon {
    return {
        fragment: "<path />",
        viewBox: {
            x: 0,
            y: 0,
            width: 24,
            height: 24,
        },
    };
}

async function recordMetricViewUpdateReasons(run: () => Promise<void>): Promise<string[]> {
    const observability = await import("./view-update-observability");
    const originalRecordMetricViewPerformanceSample = observability.recordMetricViewPerformanceSample;
    const updateReasons: string[] = [];
    const replacement: RecordMetricViewPerformanceSample = (options) => {
        updateReasons.push(options.updateReason);
        originalRecordMetricViewPerformanceSample(options);
    };

    // The unit-test build emits CommonJS, so runner calls this export through
    // the module object. If tests move to native ESM, this hook should fail by
    // leaving updateReasons empty.
    Object.defineProperty(observability, "recordMetricViewPerformanceSample", {
        configurable: true,
        value: replacement,
    });

    try {
        await run();
        return updateReasons;
    } finally {
        Object.defineProperty(observability, "recordMetricViewPerformanceSample", {
            configurable: true,
            value: originalRecordMetricViewPerformanceSample,
        });
    }
}

async function recordMetricViewPerformanceRenderContexts(
    run: () => Promise<void>,
): Promise<MetricViewPerformanceRenderContext[]> {
    const observability = await import("./view-update-observability");
    const originalRecordMetricViewPerformanceSample = observability.recordMetricViewPerformanceSample;
    const renderContexts: MetricViewPerformanceRenderContext[] = [];
    const replacement: RecordMetricViewPerformanceSample = (options) => {
        renderContexts.push(options.renderContext);
        originalRecordMetricViewPerformanceSample(options);
    };

    Object.defineProperty(observability, "recordMetricViewPerformanceSample", {
        configurable: true,
        value: replacement,
    });

    try {
        await run();
        return renderContexts;
    } finally {
        Object.defineProperty(observability, "recordMetricViewPerformanceSample", {
            configurable: true,
            value: originalRecordMetricViewPerformanceSample,
        });
    }
}

async function waitForImageCall(action: FakeKeyAction): Promise<void> {
    await waitForImageCallCount(action, 1);
}

async function waitForImageCallCount(action: FakeKeyAction, imageCallCount: number): Promise<void> {
    await waitFor(() => action.imageDataUrlList.length >= imageCallCount);
}

async function waitForScheduledWork(): Promise<void> {
    await new Promise<void>(resolve => {
        setImmediate(resolve);
    });
    await new Promise<void>(resolve => {
        setImmediate(resolve);
    });
}

async function waitFor(predicate: () => boolean): Promise<void> {
    const startTimestampMilliseconds = Date.now();

    while (!predicate()) {
        if (Date.now() - startTimestampMilliseconds > 1000) {
            throw new Error("Timed out waiting for runner test condition.");
        }

        await new Promise<void>(resolve => {
            setTimeout(resolve, 5);
        });
    }
}

function createDeferred<T>(): {
    readonly promise: Promise<T>;
    readonly resolve: (value: T | PromiseLike<T>) => void;
} {
    let resolveDeferred: (value: T | PromiseLike<T>) => void = () => undefined;
    const promise = new Promise<T>(resolve => {
        resolveDeferred = resolve;
    });

    return {
        promise,
        resolve: resolveDeferred,
    };
}

function installRasterizerRecorder(): RasterizerRecorder {
    const originalRasterizeSvgToPngDataUrl = rasterizer.rasterizeSvgToPngDataUrl;
    const svgList: string[] = [];
    const replacement: RasterizeSvgToPngDataUrl = (svg, renderSize) => {
        void renderSize;
        svgList.push(svg);
        return `data:image/png;base64,test-render-${svgList.length}`;
    };

    Object.defineProperty(rasterizer, "rasterizeSvgToPngDataUrl", {
        configurable: true,
        value: replacement,
    });

    return {
        svgList,
        restore: () => {
            Object.defineProperty(rasterizer, "rasterizeSvgToPngDataUrl", {
                configurable: true,
                value: originalRasterizeSvgToPngDataUrl,
            });
        },
    };
}

function updateCommittedColorCompensationProfile(profile: ColorCompensationProfile): void {
    updateCommittedColorCompensationProfileFromStoredSettings(
        readStoredGlobalSettings(writeStoredColorCompensationProfile(undefined, profile)).settings,
    );
}
