import assert from "node:assert/strict";
import test from "node:test";
import { resolveInspectorFieldList } from "./scenarios";
import { basePropertyInspectorSettings, type ActionKind, type GraphicType, type PropertyInspectorSettings } from "./settings";
import type { VisibilityContext } from "./schema";

test("network speed scenarios expose settings used by the runtime display path", () => {
    const testCases: ReadonlyArray<{
        name: string;
        graphicType: GraphicType;
        settings?: Partial<PropertyInspectorSettings>;
        requiredFieldIds: readonly string[];
    }> = [
        {
            name: "circular",
            graphicType: "circular",
            settings: { networkDirection: "download" },
            requiredFieldIds: ["network-interface", "maximum-network-speed", "network-unit-base"],
        },
        {
            name: "text",
            graphicType: "text",
            settings: { networkDirection: "both" },
            requiredFieldIds: ["network-interface", "maximum-network-speed", "network-unit-base"],
        },
        {
            name: "linear",
            graphicType: "linear",
            settings: { networkDirection: "both" },
            requiredFieldIds: ["network-interface", "maximum-network-speed", "network-unit-base"],
        },
        {
            name: "single-direction sparkline",
            graphicType: "dashed-line",
            settings: { networkDirection: "download" },
            requiredFieldIds: ["network-interface", "maximum-network-speed", "network-unit-base"],
        },
        {
            name: "dual sparkline",
            graphicType: "dashed-line",
            settings: { networkDirection: "both" },
            requiredFieldIds: [
                "network-interface",
                "maximum-network-speed",
                "network-unit-base",
                "network-traffic-display-mode",
            ],
        },
    ];

    for (const testCase of testCases) {
        const fieldIdList = resolveInspectorFieldIdList(buildContext({
            actionKind: "net-speed",
            settings: {
                ...testCase.settings,
                graphicType: testCase.graphicType,
            },
        }));

        for (const fieldId of testCase.requiredFieldIds) {
            assert.ok(
                fieldIdList.includes(fieldId),
                `${testCase.name} should expose "${fieldId}". Fields: [${fieldIdList.join(", ")}].`,
            );
        }
    }
});

function buildContext(options: {
    actionKind: ActionKind;
    settings: Partial<PropertyInspectorSettings>;
}): VisibilityContext {
    return {
        actionKind: options.actionKind,
        isWindows: false,
        settings: {
            ...basePropertyInspectorSettings,
            ...options.settings,
        },
    };
}

function resolveInspectorFieldIdList(context: VisibilityContext): readonly string[] {
    return resolveInspectorFieldList(context).map(field => field.id);
}
