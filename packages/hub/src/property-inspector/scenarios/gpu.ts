import {
    baseFieldGroup,
    circleStyleFieldGroup,
    colorFieldGroupList,
    maximumGpuPowerFieldGroup,
    maximumTemperatureFieldGroup,
    temperatureUnitFieldGroup,
    colorSettingsFieldGroup,
    sparklineAppearanceFieldGroup,
    sparklineGridLineFieldGroup,
    updateFieldGroup,
} from "../scenario-field-groups";
import {
    defaultSettingsNormalizer,
    defineScenario,
    resolveGraphicScope,
    type InspectorScenario,
} from "../scenario-model";
import type { GraphicType } from "../settings";
import { inspectorScope } from "../scopes";

export function resolveGpuTempScenario(graphicType: GraphicType): InspectorScenario {
    return defineScenario({
        scope: resolveGraphicScope({
            graphicType,
            circularScope: inspectorScope.gpuTempCircularScope,
            textScope: inspectorScope.gpuTempTextScope,
            linearScope: inspectorScope.gpuTempLinearScope,
            sparklineScope: inspectorScope.gpuTempSparklineScope,
        }),
        settingsNormalizer: defaultSettingsNormalizer,
        fieldGroupList: [
            baseFieldGroup,
            ...(graphicType === "circular" ? [circleStyleFieldGroup] : []),
            ...(graphicType === "dashed-line" ? [sparklineAppearanceFieldGroup, sparklineGridLineFieldGroup] : []),
            temperatureUnitFieldGroup,
            maximumTemperatureFieldGroup,
            colorSettingsFieldGroup,
            ...colorFieldGroupList,
            updateFieldGroup,
        ],
    });
}

export function resolveGpuPowerScenario(graphicType: GraphicType): InspectorScenario {
    return defineScenario({
        scope: resolveGraphicScope({
            graphicType,
            circularScope: inspectorScope.gpuPowerCircularScope,
            textScope: inspectorScope.gpuPowerTextScope,
            linearScope: inspectorScope.gpuPowerLinearScope,
            sparklineScope: inspectorScope.gpuPowerSparklineScope,
        }),
        settingsNormalizer: defaultSettingsNormalizer,
        fieldGroupList: [
            baseFieldGroup,
            ...(graphicType === "circular" ? [circleStyleFieldGroup] : []),
            ...(graphicType === "dashed-line" ? [sparklineAppearanceFieldGroup, sparklineGridLineFieldGroup] : []),
            maximumGpuPowerFieldGroup,
            colorSettingsFieldGroup,
            ...colorFieldGroupList,
            updateFieldGroup,
        ],
    });
}
