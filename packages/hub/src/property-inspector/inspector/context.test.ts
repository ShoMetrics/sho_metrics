import assert from "node:assert/strict";
import test from "node:test";
import { buildVisibilityContext } from "../testing/test-context";

test("Property Inspector context reads resolved disk polling defaults without persisting them", () => {
    const context = buildVisibilityContext({
        actionKind: "disk",
        settings: {
            metric: {
                diskMetricKind: "usage",
            },
        },
    });

    assert.equal(context.resolved.local.pollingFrequencySeconds, 60);
    assert.equal(context.settings.local, undefined);
});

test("Property Inspector context uses resolver platform rules for scenario visibility", () => {
    const context = buildVisibilityContext({
        actionKind: "disk",
        isWindows: true,
        settings: {
            appearanceOverrides: {
                graphicType: "linear",
            },
            metric: {
                diskMetricKind: "throughput",
            },
        },
    });

    assert.equal(context.resolved.metric.diskMetricKind, "usage");
});
