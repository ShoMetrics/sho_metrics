import {
    baseFieldGroup,
    circularCenterFieldGroup,
    colorFieldGroupList,
    colorSettingsFieldGroup,
    sparklineAppearanceFieldGroup,
    sparklineGridLineFieldGroup,
} from "../scenario-field-groups";
import {
    defaultSettingsNormalizer,
    defineScenario,
    resolveGraphicScope,
    type InspectorScenario,
} from "../scenario-model";
import { inspectorScope, type InspectorScope } from "../scopes";
import type { ActionKind, GraphicType } from "../settings";

export function resolveDefaultScenario(actionKind: ActionKind, graphicType: GraphicType): InspectorScenario {
    return defineScenario({
        scope: resolveDefaultScope(actionKind, graphicType),
        settingsNormalizer: defaultSettingsNormalizer,
        fieldGroupList: [
            baseFieldGroup,
            ...(graphicType === "circular" ? [circularCenterFieldGroup] : []),
            ...(graphicType === "dashed-line" ? [sparklineAppearanceFieldGroup, sparklineGridLineFieldGroup] : []),
            colorSettingsFieldGroup,
            ...colorFieldGroupList,
        ],
    });
}

function resolveDefaultScope(actionKind: ActionKind, graphicType: GraphicType): InspectorScope {
    if (actionKind === "cpu-usage") {
        return resolveGraphicScope({
            graphicType,
            circularScope: inspectorScope.cpuUsageCircularScope,
            linearScope: inspectorScope.cpuUsageLinearScope,
            sparklineScope: inspectorScope.cpuUsageSparklineScope,
        });
    }

    if (actionKind === "ram") {
        return resolveGraphicScope({
            graphicType,
            circularScope: inspectorScope.ramCircularScope,
            linearScope: inspectorScope.ramLinearScope,
            sparklineScope: inspectorScope.ramSparklineScope,
        });
    }

    if (actionKind === "gpu-usage") {
        return resolveGraphicScope({
            graphicType,
            circularScope: inspectorScope.gpuUsageCircularScope,
            linearScope: inspectorScope.gpuUsageLinearScope,
            sparklineScope: inspectorScope.gpuUsageSparklineScope,
        });
    }

    if (actionKind === "gpu-vram") {
        return resolveGraphicScope({
            graphicType,
            circularScope: inspectorScope.gpuVramCircularScope,
            linearScope: inspectorScope.gpuVramLinearScope,
            sparklineScope: inspectorScope.gpuVramSparklineScope,
        });
    }

    return inspectorScope.unknownScope;
}
