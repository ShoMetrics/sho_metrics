import type { FieldSchema, VisibilityContext } from "./schema";
import type { InspectorScope } from "./scopes";
import type {
    ActionKind,
    GraphicType,
    NormalizeSettingsContext,
    PropertyInspectorSettings,
    SettingValue,
} from "./settings";

export type InspectorSettingsNormalizer = (
    rawSettings: Record<string, SettingValue>,
    context: NormalizeSettingsContext,
    normalizedSettings: PropertyInspectorSettings,
) => PropertyInspectorSettings;

export interface PropertyInspectorState {
    actionKind: ActionKind;
    isWindows: boolean;
    settings: PropertyInspectorSettings;
}

export type ScenarioSectionId =
    | "general"
    | "content"
    | "source"
    | "appearance"
    | "visual-guides"
    | "color"
    | "update";

export interface ScenarioFieldGroup {
    name: string;
    sectionId?: ScenarioSectionId;
    fieldList: readonly FieldSchema[];
    include?: (context: VisibilityContext) => boolean;
}

export interface ScenarioSection {
    id: ScenarioSectionId;
    fieldGroupList: readonly ScenarioFieldGroup[];
}

export interface InspectorScenario {
    scope: InspectorScope;
    fieldGroupList: readonly ScenarioFieldGroup[];
    settingsNormalizer: InspectorSettingsNormalizer;
}

export const defaultSettingsNormalizer: InspectorSettingsNormalizer = (
    _rawSettings,
    _context,
    normalizedSettings,
) => normalizedSettings;

export function defineScenario(scenario: InspectorScenario): InspectorScenario {
    return scenario;
}

export function defineFieldGroup(fieldGroup: ScenarioFieldGroup): ScenarioFieldGroup {
    return fieldGroup;
}

export function resolveScenarioFieldList(
    scenario: InspectorScenario,
    context: VisibilityContext,
): readonly FieldSchema[] {
    return scenario.fieldGroupList.flatMap((fieldGroup) => {
        if (fieldGroup.include && !fieldGroup.include(context)) {
            return [];
        }

        return fieldGroup.fieldList;
    });
}

export function resolveScenarioSectionList(
    scenario: InspectorScenario,
    context: VisibilityContext,
): readonly ScenarioSection[] {
    const sectionMap = new Map<ScenarioSectionId, ScenarioFieldGroup[]>();

    for (const fieldGroup of scenario.fieldGroupList) {
        if (fieldGroup.include && !fieldGroup.include(context)) {
            continue;
        }

        const sectionId = fieldGroup.sectionId ?? resolveDefaultSectionId(fieldGroup.name);
        const sectionFieldGroupList = sectionMap.get(sectionId) ?? [];
        sectionFieldGroupList.push(fieldGroup);
        sectionMap.set(sectionId, sectionFieldGroupList);
    }

    return Array.from(sectionMap.entries()).map(([id, fieldGroupList]) => ({
        id,
        fieldGroupList,
    }));
}

export function resolveGraphicScenario(options: {
    graphicType: GraphicType;
    circularScenario: InspectorScenario;
    textScenario: InspectorScenario;
    linearScenario: InspectorScenario;
    sparklineScenario: InspectorScenario;
}): InspectorScenario {
    if (options.graphicType === "text") {
        return options.textScenario;
    }

    if (options.graphicType === "linear") {
        return options.linearScenario;
    }

    if (options.graphicType === "dashed-line") {
        return options.sparklineScenario;
    }

    return options.circularScenario;
}

export function resolveGraphicScope(options: {
    graphicType: GraphicType;
    circularScope: InspectorScope;
    textScope: InspectorScope;
    linearScope: InspectorScope;
    sparklineScope: InspectorScope;
}): InspectorScope {
    if (options.graphicType === "text") {
        return options.textScope;
    }

    if (options.graphicType === "linear") {
        return options.linearScope;
    }

    if (options.graphicType === "dashed-line") {
        return options.sparklineScope;
    }

    return options.circularScope;
}

function resolveDefaultSectionId(fieldGroupName: string): ScenarioSectionId {
    if (
        fieldGroupName.includes("Color")
        || fieldGroupName.includes("color")
        || fieldGroupName.includes("Threshold")
        || fieldGroupName.includes("threshold")
        || fieldGroupName === "solidColor"
        || fieldGroupName === "thresholdColor"
    ) {
        return "color";
    }

    if (
        fieldGroupName.includes("GridLine")
        || fieldGroupName.includes("gridLine")
        || fieldGroupName === "sparklineAppearance"
    ) {
        return "visual-guides";
    }

    if (
        fieldGroupName.includes("Center")
        || fieldGroupName.includes("Circle")
        || fieldGroupName.includes("circle")
        || fieldGroupName.includes("Label")
        || fieldGroupName.includes("Unit")
        || fieldGroupName === "networkCircular"
    ) {
        return "content";
    }

    if (
        fieldGroupName.includes("Endpoint")
        || fieldGroupName.includes("Volume")
        || fieldGroupName.includes("Throughput")
        || fieldGroupName.includes("Usage")
        || fieldGroupName === "networkDirection"
        || fieldGroupName === "diskUsageBase"
    ) {
        return "source";
    }

    return fieldGroupName === "base" ? "general" : "appearance";
}
