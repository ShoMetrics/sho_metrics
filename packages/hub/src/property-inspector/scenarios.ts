import {
    resolveScenarioFieldList,
    resolveScenarioSectionList,
    type InspectorScenario,
    type ScenarioSectionId,
} from "./scenario-model";
import type { FieldSchema, VisibilityContext } from "./schema";
import { resolveDefaultScenario } from "./scenarios/default";
import { resolveDiskScenario } from "./scenarios/disk";
import { resolveGpuPowerScenario, resolveGpuTempScenario } from "./scenarios/gpu";
import { resolveNetSpeedScenario } from "./scenarios/net-speed";

export function resolveInspectorFieldList(context: VisibilityContext): readonly FieldSchema[] {
    const scenario = resolveInspectorScenario(context);

    return resolveScenarioFieldList(scenario, context)
        .filter(field => isFieldAllowedInScenario(field, scenario, context));
}

export interface InspectorSectionView {
    id: ScenarioSectionId;
    label: string;
    fieldList: readonly FieldSchema[];
}

export function resolveInspectorSectionList(context: VisibilityContext): readonly InspectorSectionView[] {
    const scenario = resolveInspectorScenario(context);

    return resolveScenarioSectionList(scenario, context)
        .map(section => ({
            id: section.id,
            label: resolveSectionLabel(section.id),
            fieldList: section.fieldGroupList.flatMap(fieldGroup => fieldGroup.fieldList)
                .filter(field => isFieldAllowedInScenario(field, scenario, context)),
        }))
        .filter(section => section.fieldList.length > 0);
}

function resolveInspectorScenario(context: VisibilityContext): InspectorScenario {
    if (context.actionKind === "disk") {
        return resolveDiskScenario(context);
    }

    if (context.actionKind === "net-speed") {
        return resolveNetSpeedScenario(context);
    }

    if (context.actionKind === "gpu-temp") {
        return resolveGpuTempScenario(context.resolved.appearance.graphicType);
    }

    if (context.actionKind === "gpu-power") {
        return resolveGpuPowerScenario(context.resolved.appearance.graphicType);
    }

    return resolveDefaultScenario(context.actionKind, context.resolved.appearance.graphicType);
}

function isFieldAllowedInScenario(
    field: FieldSchema,
    scenario: InspectorScenario,
    context: VisibilityContext,
): boolean {
    if (field.excludeWindows === true && context.isWindows) {
        return false;
    }

    if (field.allowedScopes.includes(scenario.scope)) {
        return true;
    }

    if (isDevelopmentEnvironment()) {
        throw new Error(`Field "${field.id}" is not allowed in scope "${scenario.scope}".`);
    }

    return false;
}

function isDevelopmentEnvironment(): boolean {
    return typeof process !== "undefined"
        && typeof process.env === "object"
        && process.env.NODE_ENV === "development";
}

function resolveSectionLabel(sectionId: ScenarioSectionId): string {
    switch (sectionId) {
        case "metric":
            return "Metric";
        case "layout":
            return "Layout";
        case "scale":
            return "Scale & Units";
        case "trend":
            return "Trend";
        case "labels":
            return "Labels";
        case "colors":
            return "Colors";
        case "update":
            return "Update";
    }
}
