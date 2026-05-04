import {
    baseFieldGroup,
    circularCenterFieldGroup,
    colorFieldGroupList,
    networkCircularFieldGroup,
    networkDirectionFieldGroup,
    colorSettingsFieldGroup,
} from "../scenario-field-groups";
import {
    defaultSettingsNormalizer,
    defineScenario,
    resolveGraphicScenario,
    type InspectorScenario,
} from "../scenario-model";
import type { VisibilityContext } from "../schema";
import { inspectorScope } from "../scopes";

const netSpeedCircularScenario = defineScenario({
    scope: inspectorScope.netSpeedCircularScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        circularCenterFieldGroup,
        networkDirectionFieldGroup,
        networkCircularFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const netSpeedLinearScenario = defineScenario({
    scope: inspectorScope.netSpeedLinearScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        networkDirectionFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const netSpeedSparklineScenario = defineScenario({
    scope: inspectorScope.netSpeedSparklineScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        networkDirectionFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

export function resolveNetSpeedScenario(context: VisibilityContext): InspectorScenario {
    return resolveGraphicScenario({
        graphicType: context.settings.graphicType,
        circularScenario: netSpeedCircularScenario,
        linearScenario: netSpeedLinearScenario,
        sparklineScenario: netSpeedSparklineScenario,
    });
}
