import assert from "node:assert/strict";
import test from "node:test";
import { resolveInspectorFieldList } from "../../src/property-inspector/scenarios";
import {
    basePropertyInspectorSettings,
    type ActionKind,
    type GraphicType,
    type PropertyInspectorSettings,
} from "../../src/property-inspector/settings";
import type { VisibilityContext } from "../../src/property-inspector/schema";

test("disk usage linear exposes only linear disk title fields", () => {
    const inspectorFieldIdList = resolveInspectorFieldIdList(buildContext({
        actionKind: "disk",
        settings: {
            graphicType: "linear",
            diskMetricKind: "usage",
        },
    }));

    assertFieldPresent(inspectorFieldIdList, "disk-linear-label");
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
    assertFieldAbsent(solidFieldIdList, "dynamic-usage-colors");
    assertFieldPresent(thresholdFieldIdList, "dynamic-usage-colors");
    assertFieldAbsent(thresholdFieldIdList, "solid-color");
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
