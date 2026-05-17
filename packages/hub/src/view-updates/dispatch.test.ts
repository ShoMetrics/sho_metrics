import assert from "node:assert/strict";
import test from "node:test";
import type { WillAppearEvent } from "@elgato/streamdeck";
import {
    dispatchMetricViewImage,
    type TouchStripMetricLayoutState,
} from "./dispatch";
import type { TouchStripMetricLayout } from "../view-rendering/metric-view-frame";

test("dispatch sends key images through setImage", async () => {
    const action = new FakeKeyAction();
    const result = await dispatchMetricViewImage({
        event: buildEvent(action),
        pngDataUrl: "data:image/png;base64,key",
        touchStripMetricLayout: null,
        touchStripMetricLayoutState: buildTouchStripMetricLayoutState(),
        isActionActive: () => true,
    });

    assert.equal(result.status, "rendered");
    assert.deepEqual(action.calls, ["setImage:data:image/png;base64,key"]);
});

test("dispatch applies touch strip layout before dial feedback", async () => {
    const action = new FakeDialAction();
    const result = await dispatchMetricViewImage({
        event: buildEvent(action),
        pngDataUrl: "data:image/png;base64,dial",
        touchStripMetricLayout: buildTouchStripMetricLayout(),
        touchStripMetricLayoutState: buildTouchStripMetricLayoutState(),
        isActionActive: () => true,
    });

    assert.equal(result.status, "rendered");
    assert.deepEqual(action.calls, [
        "setFeedbackLayout:layouts/single-metric-touchstrip-wide.json",
        "setFeedback:data:image/png;base64,dial",
    ]);
});

test("dispatch does not send dial feedback after the action becomes inactive", async () => {
    let isActive = true;
    const action = new FakeDialAction(() => {
        isActive = false;
    });
    const result = await dispatchMetricViewImage({
        event: buildEvent(action),
        pngDataUrl: "data:image/png;base64,dial",
        touchStripMetricLayout: buildTouchStripMetricLayout(),
        touchStripMetricLayoutState: buildTouchStripMetricLayoutState(),
        isActionActive: () => isActive,
    });

    assert.equal(result.status, "inactive");
    assert.deepEqual(action.calls, ["setFeedbackLayout:layouts/single-metric-touchstrip-wide.json"]);
});

class FakeKeyAction {
    readonly id = "key-action";
    readonly calls: string[] = [];

    isKey(): boolean {
        return true;
    }

    isDial(): boolean {
        return false;
    }

    setImage(pngDataUrl: string): Promise<void> {
        this.calls.push(`setImage:${pngDataUrl}`);
        return Promise.resolve();
    }
}

class FakeDialAction {
    readonly id = "dial-action";
    readonly calls: string[] = [];

    constructor(private readonly onSetFeedbackLayout?: () => void) {}

    isKey(): boolean {
        return false;
    }

    isDial(): boolean {
        return true;
    }

    setFeedbackLayout(layoutPath: string): Promise<void> {
        this.calls.push(`setFeedbackLayout:${layoutPath}`);
        this.onSetFeedbackLayout?.();
        return Promise.resolve();
    }

    setFeedback(feedback: { metricImage: string }): Promise<void> {
        this.calls.push(`setFeedback:${feedback.metricImage}`);
        return Promise.resolve();
    }
}

function buildEvent(action: object): WillAppearEvent {
    return { action } as unknown as WillAppearEvent;
}

function buildTouchStripMetricLayout(): TouchStripMetricLayout {
    return {
        kind: "wide",
        layoutPath: "layouts/single-metric-touchstrip-wide.json",
        renderSize: { width: 200, height: 100 },
        pngSize: { width: 200, height: 100 },
    };
}

function buildTouchStripMetricLayoutState(): TouchStripMetricLayoutState {
    return {
        layoutPromise: null,
        layoutPath: null,
    };
}
