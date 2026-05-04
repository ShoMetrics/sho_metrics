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
            assertFieldOrder(inspectorFieldIdList, "color-settings-heading", "color-mode");
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
