import assert from "node:assert/strict";
import test from "node:test";
import { resolveInspectorFieldList } from "./scenarios";
import { buildVisibilityContext } from "./test-context";
import { readInspectorControlValue } from "./widget-setting-bindings";

test("PI context reads resolved disk polling defaults without persisting them", () => {
    const context = buildVisibilityContext({
        actionKind: "disk",
        settings: {
            diskMetricKind: "usage",
        },
    });

    assert.equal(context.resolved.local.pollingFrequencySeconds, 60);
    assert.equal(readInspectorControlValue(context, "pollingFrequencySeconds"), 60);
    assert.equal(context.settings.local, undefined);
});

test("PI context uses resolver platform rules for scenario visibility", () => {
    const context = buildVisibilityContext({
        actionKind: "disk",
        isWindows: true,
        settings: {
            graphicType: "linear",
            diskMetricKind: "throughput",
        },
    });
    const fieldIdList = resolveInspectorFieldList(context).map(field => field.id);

    assert.equal(context.resolved.metric.diskMetricKind, "usage");
    assert.ok(!fieldIdList.includes("disk-throughput-direction"));
    assert.ok(!fieldIdList.includes("maximum-disk-read-throughput"));
    assert.ok(!fieldIdList.includes("maximum-disk-write-throughput"));
});
