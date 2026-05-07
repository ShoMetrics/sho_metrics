import assert from "node:assert/strict";
import test from "node:test";
import { resolveScenarioSectionList, type ScenarioSectionId } from "./scenario-model";
import { resolveDiskScenario } from "./scenarios/disk";
import { resolveNetSpeedScenario } from "./scenarios/net-speed";
import { basePropertyInspectorSettings, type PropertyInspectorSettings } from "./settings";
import type { VisibilityContext } from "./schema";

test("network mirrored sparkline resolves stable UI sections in scenario order", () => {
    const context = buildContext({
        settings: {
            graphicType: "dashed-line",
            networkDirection: "both",
            networkTrafficDisplayMode: "mirrored",
        },
    });

    assert.deepEqual(resolveSectionIdList(resolveScenarioSectionList(resolveNetSpeedScenario(context), context)), [
        "general",
        "source",
        "appearance",
        "visual-guides",
        "color",
        "update",
    ]);
});

test("network single-direction sparkline omits traffic display section when group is excluded", () => {
    const context = buildContext({
        settings: {
            graphicType: "dashed-line",
            networkDirection: "download",
        },
    });

    assert.deepEqual(resolveSectionIdList(resolveScenarioSectionList(resolveNetSpeedScenario(context), context)), [
        "general",
        "source",
        "visual-guides",
        "color",
        "update",
    ]);
});

test("disk usage linear separates source label and color sections", () => {
    const context = buildContext({
        actionKind: "disk",
        settings: {
            graphicType: "linear",
            diskMetricKind: "usage",
            colorMode: "threshold",
        },
    });
    const sectionList = resolveScenarioSectionList(resolveDiskScenario(context), context);

    assert.deepEqual(resolveSectionIdList(sectionList), [
        "general",
        "source",
        "content",
        "color",
        "update",
    ]);
    assert.deepEqual(sectionList.map(section => section.fieldGroupList.map(fieldGroup => fieldGroup.name)), [
        ["base"],
        ["diskUsageBase"],
        ["diskUsageLinearLabel"],
        ["colorSettings", "thresholdColor"],
        ["update"],
    ]);
});

function resolveSectionIdList(sectionList: ReturnType<typeof resolveScenarioSectionList>): readonly ScenarioSectionId[] {
    return sectionList.map(section => section.id);
}

function buildContext(options: {
    actionKind?: VisibilityContext["actionKind"];
    settings?: Partial<PropertyInspectorSettings>;
}): VisibilityContext {
    return {
        actionKind: options.actionKind ?? "net-speed",
        isWindows: false,
        settings: {
            ...basePropertyInspectorSettings,
            ...options.settings,
        },
    };
}
