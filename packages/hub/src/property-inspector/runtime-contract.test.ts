import assert from "node:assert/strict";
import test from "node:test";
import { resolveInspectorFieldList } from "./scenarios";
import type { ActionKind, GraphicType } from "./settings";
import type { VisibilityContext } from "./schema";
import { buildVisibilityContext, type InspectorTestSettings } from "./test-context";

test("network speed scenarios expose settings used by the runtime display path", () => {
    const testCases: ReadonlyArray<{
        name: string;
        graphicType: GraphicType;
        settings?: InspectorTestSettings;
        requiredFieldIds: readonly string[];
    }> = [
        {
            name: "circular",
            graphicType: "circular",
            settings: { networkDirection: "download" },
            requiredFieldIds: ["network-interface", "network-scale-mode", "maximum-download-speed", "network-unit-base"],
        },
        {
            name: "text",
            graphicType: "text",
            settings: { networkDirection: "both" },
            requiredFieldIds: [
                "network-interface",
                "network-scale-mode",
                "maximum-download-speed",
                "maximum-upload-speed",
                "network-unit-base",
            ],
        },
        {
            name: "linear",
            graphicType: "linear",
            settings: { networkDirection: "both" },
            requiredFieldIds: [
                "network-interface",
                "network-scale-mode",
                "maximum-download-speed",
                "maximum-upload-speed",
                "network-unit-base",
            ],
        },
        {
            name: "single-direction sparkline",
            graphicType: "dashed-line",
            settings: { networkDirection: "download" },
            requiredFieldIds: ["network-interface", "network-scale-mode", "maximum-download-speed", "network-unit-base"],
        },
        {
            name: "dual sparkline",
            graphicType: "dashed-line",
            settings: { networkDirection: "both" },
            requiredFieldIds: [
                "network-interface",
                "network-scale-mode",
                "maximum-download-speed",
                "maximum-upload-speed",
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
    settings: InspectorTestSettings;
}): VisibilityContext {
    return buildVisibilityContext({
        actionKind: options.actionKind,
        settings: options.settings,
    });
}

function resolveInspectorFieldIdList(context: VisibilityContext): readonly string[] {
    return resolveInspectorFieldList(context).map(field => field.id);
}
