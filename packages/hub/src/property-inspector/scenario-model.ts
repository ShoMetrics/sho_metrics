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

export interface ScenarioFieldGroup {
    name: string;
    fieldList: readonly FieldSchema[];
    include?: (context: VisibilityContext) => boolean;
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

export function resolveGraphicScenario(options: {
    graphicType: GraphicType;
    circularScenario: InspectorScenario;
    linearScenario: InspectorScenario;
    sparklineScenario: InspectorScenario;
}): InspectorScenario {
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
    linearScope: InspectorScope;
    sparklineScope: InspectorScope;
}): InspectorScope {
    if (options.graphicType === "linear") {
        return options.linearScope;
    }

    if (options.graphicType === "dashed-line") {
        return options.sparklineScope;
    }

    return options.circularScope;
}
