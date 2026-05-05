import assert from "node:assert/strict";
import test from "node:test";
import { resolveInspectorFieldList } from "./scenarios";
import {
    basePropertyInspectorSettings,
    type ActionKind,
    type GraphicType,
    type PropertyInspectorSettings,
} from "./settings";
import type { VisibilityContext } from "./schema";

test("disk usage linear exposes only linear disk title fields", () => {
    const inspectorFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            graphicType: "linear",
            diskMetricKind: "usage",
        },
    }));

    assertFieldPresent(inspectorFieldIdList, "disk-linear-label");
    assertFieldPresent(inspectorFieldIdList, "disk-linear-label-heading");
    assertFieldPresent(inspectorFieldIdList, "disk-volume-label");
    assertFieldAbsent(inspectorFieldIdList, "disk-usage-display-mode");
});

test("disk usage circular exposes circular-only usage display", () => {
    const inspectorFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            graphicType: "circular",
            diskMetricKind: "usage",
        },
    }));

    assertFieldPresent(inspectorFieldIdList, "disk-usage-display-mode");
    assertFieldAbsent(inspectorFieldIdList, "disk-linear-label");
    assertFieldAbsent(inspectorFieldIdList, "disk-volume-label");
});

test("network direction note is limited to circular scope", () => {
    const linearFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "net-speed",
        settings: {
            graphicType: "linear",
        },
    }));
    const circularFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "net-speed",
        settings: {
            graphicType: "circular",
        },
    }));

    assertFieldAbsent(linearFieldIdList, "network-circle-note");
    assertFieldPresent(circularFieldIdList, "network-circle-note");
});

test("network sparkline exposes dual-stream network controls", () => {
    const sparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "net-speed",
        settings: {
            graphicType: "dashed-line",
        },
    }));

    assertFieldPresent(sparklineFieldIdList, "network-direction");
    assertFieldPresent(sparklineFieldIdList, "network-interface");
    assertFieldPresent(sparklineFieldIdList, "maximum-network-speed");
    assertFieldPresent(sparklineFieldIdList, "network-unit-base");
    assertFieldPresent(sparklineFieldIdList, "network-traffic-display-mode");
    assertFieldPresent(sparklineFieldIdList, "download-color-mode");
    assertFieldPresent(sparklineFieldIdList, "download-solid-color");
    assertFieldPresent(sparklineFieldIdList, "upload-color-mode");
    assertFieldPresent(sparklineFieldIdList, "upload-solid-color");
    assertFieldAbsent(sparklineFieldIdList, "color-mode");
    assertFieldAbsent(sparklineFieldIdList, "solid-color");
    assertFieldAbsent(sparklineFieldIdList, "network-circle-note");
});

test("network single-stream sparkline uses standard color settings", () => {
    const sparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "net-speed",
        settings: {
            graphicType: "dashed-line",
            networkDirection: "download",
            colorMode: "solid",
        },
    }));

    assertFieldPresent(sparklineFieldIdList, "color-mode");
    assertFieldPresent(sparklineFieldIdList, "solid-color");
    assertFieldAbsent(sparklineFieldIdList, "download-color-mode");
    assertFieldAbsent(sparklineFieldIdList, "upload-color-mode");
});

test("network dual linear exposes download before upload channel colors", () => {
    const fieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "net-speed",
        settings: {
            graphicType: "linear",
            networkDirection: "both",
        },
    }));

    assertFieldPresent(fieldIdList, "download-color-mode");
    assertFieldPresent(fieldIdList, "upload-color-mode");
    assertFieldAbsent(fieldIdList, "color-mode");
    assertFieldOrder(fieldIdList, "download-color-heading", "upload-color-heading");
});

test("network traffic display mode is hidden when sparkline shows a single direction", () => {
    const sparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "net-speed",
        settings: {
            graphicType: "dashed-line",
            networkDirection: "download",
        },
    }));

    assertFieldAbsent(sparklineFieldIdList, "network-traffic-display-mode");
});

test("network mirrored traffic disables grid controls and explains the limitation", () => {
    const context = buildContext({
        actionKind: "net-speed",
        settings: {
            graphicType: "dashed-line",
            networkDirection: "both",
            networkTrafficDisplayMode: "mirrored",
        },
    });
    const sparklineFieldList = resolveInspectorFieldList(context);
    const sparklineFieldIdList = sparklineFieldList.map(field => field.id);
    const gridLineVisibilityField = sparklineFieldList.find(field => field.id === "grid-line-visibility");
    const gridLineTypeField = sparklineFieldList.find(field => field.id === "grid-line-type");

    assertFieldPresent(sparklineFieldIdList, "line-smoothing");
    assertFieldPresent(sparklineFieldIdList, "visual-guides-heading");
    assertFieldPresent(sparklineFieldIdList, "mirrored-grid-line-note");
    assertFieldPresent(sparklineFieldIdList, "grid-line-visibility");
    assert.equal(gridLineVisibilityField?.disabled, true);
    assert.equal(gridLineVisibilityField?.defaultValue, "none");
    assert.equal(gridLineTypeField?.disabled, true);
    assertFieldAbsent(sparklineFieldIdList, "adaptive-grid-line-note");
    assertFieldPresent(sparklineFieldIdList, "grid-line-type");
});

test("disk usage sparkline does not expose throughput direction controls", () => {
    const sparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            graphicType: "dashed-line",
            diskMetricKind: "usage",
        },
    }));

    assertFieldAbsent(sparklineFieldIdList, "disk-throughput-direction");
});

test("disk throughput dual sparkline exposes read and write channel colors", () => {
    const fieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            graphicType: "dashed-line",
            diskMetricKind: "throughput",
            diskThroughputDirection: "both",
        },
    }));

    assertFieldPresent(fieldIdList, "disk-read-color-mode");
    assertFieldPresent(fieldIdList, "disk-read-solid-color");
    assertFieldPresent(fieldIdList, "disk-write-color-mode");
    assertFieldPresent(fieldIdList, "disk-write-solid-color");
    assertFieldAbsent(fieldIdList, "color-mode");
    assertFieldAbsent(fieldIdList, "solid-color");
});

test("color mode selects the matching color section", () => {
    const solidFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            colorMode: "solid",
            graphicType: "linear",
            diskMetricKind: "usage",
        },
    }));
    const thresholdFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            colorMode: "threshold",
            graphicType: "linear",
            diskMetricKind: "usage",
        },
    }));

    assertFieldPresent(solidFieldIdList, "solid-color");
    assertFieldPresent(solidFieldIdList, "color-settings-heading");
    assertFieldPresent(thresholdFieldIdList, "color-settings-heading");
    assertFieldPresent(thresholdFieldIdList, "dynamic-usage-colors-note");
    assertFieldAbsent(thresholdFieldIdList, "solid-color");
});

test("line smoothing slider is exposed only by sparkline scenarios", () => {
    const scenarioList: ReadonlyArray<{
        actionKind: ActionKind;
        settings?: Partial<PropertyInspectorSettings>;
    }> = [
        { actionKind: "cpu-usage" },
        { actionKind: "net-speed" },
        { actionKind: "ram" },
        { actionKind: "disk", settings: { diskMetricKind: "usage" } },
        { actionKind: "disk", settings: { diskMetricKind: "throughput" } },
        { actionKind: "gpu-usage" },
        { actionKind: "gpu-temp" },
        { actionKind: "gpu-vram" },
        { actionKind: "gpu-power" },
    ];

    for (const scenario of scenarioList) {
        const linearFieldIdList = resolveInspectorFieldIdList(buildContext({
            actionKind: scenario.actionKind,
            settings: {
                ...scenario.settings,
                graphicType: "linear",
            },
        }));
        const sparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
            actionKind: scenario.actionKind,
            settings: {
                ...scenario.settings,
                graphicType: "dashed-line",
                networkTrafficDisplayMode: "overlay",
            },
        }));

        assertFieldAbsent(linearFieldIdList, "line-smoothing");
        assertFieldAbsent(linearFieldIdList, "visual-guides-heading");
        assertFieldAbsent(linearFieldIdList, "grid-line-visibility");
        assertFieldAbsent(linearFieldIdList, "adaptive-grid-line-note");
        assertFieldAbsent(linearFieldIdList, "grid-line-type");
        assertFieldPresent(sparklineFieldIdList, "line-smoothing");
        assertFieldPresent(sparklineFieldIdList, "visual-guides-heading");
        assertFieldPresent(sparklineFieldIdList, "grid-line-visibility");
        assertFieldPresent(sparklineFieldIdList, "adaptive-grid-line-note");
        assertFieldPresent(sparklineFieldIdList, "grid-line-type");
    }
});

test("sparkline max controls follow graph-specific scale semantics", () => {
    const gpuTemperatureSparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "gpu-temp",
        settings: { graphicType: "dashed-line" },
    }));
    const gpuPowerSparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "gpu-power",
        settings: { graphicType: "dashed-line" },
    }));
    const diskThroughputSparklineFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            graphicType: "dashed-line",
            diskMetricKind: "throughput",
        },
    }));

    assertFieldPresent(gpuTemperatureSparklineFieldIdList, "maximum-temperature");
    assertFieldPresent(gpuPowerSparklineFieldIdList, "maximum-gpu-power");
    assertFieldAbsent(diskThroughputSparklineFieldIdList, "maximum-disk-throughput");
});

test("shared visual fields keep a consistent order across widgets", () => {
    const actionKindList: readonly ActionKind[] = [
        "cpu-usage",
        "net-speed",
        "ram",
        "disk",
        "gpu-usage",
        "gpu-temp",
        "gpu-vram",
        "gpu-power",
    ];
    const graphicTypeList: readonly GraphicType[] = ["circular", "linear", "dashed-line"];

    for (const actionKind of actionKindList) {
        for (const graphicType of graphicTypeList) {
            const inspectorFieldIdList = resolveInspectorFieldIdList(buildContext({
                actionKind,
                settings: { graphicType },
            }));

            assertFieldOrder(inspectorFieldIdList, "graphic-type", "graphic-style");
            assertFieldOrder(inspectorFieldIdList, "graphic-style", "color-settings-heading");

            if (inspectorFieldIdList.includes("color-mode")) {
                assertFieldOrder(inspectorFieldIdList, "color-settings-heading", "color-mode");
            }
        }
    }
});

test("windows hides disk throughput-only controls", () => {
    const inspectorFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        isWindows: true,
        settings: {
            graphicType: "linear",
            diskMetricKind: "throughput",
        },
    }));

    assertFieldAbsent(inspectorFieldIdList, "disk-throughput-direction");
    assertFieldAbsent(inspectorFieldIdList, "maximum-disk-throughput");
});

function buildContext(options: {
    actionKind: ActionKind;
    isWindows?: boolean;
    settings: Partial<PropertyInspectorSettings> & { graphicType?: GraphicType };
}): VisibilityContext {
    return {
        actionKind: options.actionKind,
        isWindows: options.isWindows ?? false,
        settings: {
            ...basePropertyInspectorSettings,
            ...options.settings,
        },
    };
}

function resolveInspectorFieldIdList(context: VisibilityContext): readonly string[] {
    return resolveInspectorFieldList(context).map(field => field.id);
}

function assertFieldPresent(inspectorFieldIdList: readonly string[], fieldId: string): void {
    assert.ok(
        inspectorFieldIdList.includes(fieldId),
        `Expected field "${fieldId}" in [${inspectorFieldIdList.join(", ")}].`,
    );
}

function assertFieldAbsent(inspectorFieldIdList: readonly string[], fieldId: string): void {
    assert.ok(
        !inspectorFieldIdList.includes(fieldId),
        `Expected field "${fieldId}" to be absent from [${inspectorFieldIdList.join(", ")}].`,
    );
}

function assertFieldOrder(inspectorFieldIdList: readonly string[], earlierFieldId: string, laterFieldId: string): void {
    const earlierIndex = inspectorFieldIdList.indexOf(earlierFieldId);
    const laterIndex = inspectorFieldIdList.indexOf(laterFieldId);

    assert.ok(
        earlierIndex >= 0,
        `Expected field "${earlierFieldId}" in [${inspectorFieldIdList.join(", ")}].`,
    );
    assert.ok(
        laterIndex >= 0,
        `Expected field "${laterFieldId}" in [${inspectorFieldIdList.join(", ")}].`,
    );
    assert.ok(
        earlierIndex < laterIndex,
        `Expected field "${earlierFieldId}" before "${laterFieldId}" in [${inspectorFieldIdList.join(", ")}].`,
    );
}
