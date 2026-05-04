import {
    baseFieldGroup,
    circularCenterFieldGroup,
    colorFieldGroupList,
    maximumGpuPowerFieldGroup,
    maximumTemperatureFieldGroup,
    temperatureUnitFieldGroup,
    colorSettingsFieldGroup,
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
            linearScope: inspectorScope.gpuTempLinearScope,
            sparklineScope: inspectorScope.gpuTempSparklineScope,
        }),
        settingsNormalizer: defaultSettingsNormalizer,
        fieldGroupList: [
            baseFieldGroup,
            ...(graphicType === "circular" ? [circularCenterFieldGroup] : []),
            temperatureUnitFieldGroup,
            ...(graphicType === "dashed-line" ? [] : [maximumTemperatureFieldGroup]),
            colorSettingsFieldGroup,
            ...colorFieldGroupList,
        ],
    });
}

export function resolveGpuPowerScenario(graphicType: GraphicType): InspectorScenario {
    return defineScenario({
        scope: resolveGraphicScope({
            graphicType,
            circularScope: inspectorScope.gpuPowerCircularScope,
            linearScope: inspectorScope.gpuPowerLinearScope,
            sparklineScope: inspectorScope.gpuPowerSparklineScope,
        }),
        settingsNormalizer: defaultSettingsNormalizer,
        fieldGroupList: [
            baseFieldGroup,
            ...(graphicType === "circular" ? [circularCenterFieldGroup] : []),
            ...(graphicType === "dashed-line" ? [] : [maximumGpuPowerFieldGroup]),
            colorSettingsFieldGroup,
            ...colorFieldGroupList,
        ],
    });
}
