import {
    baseFieldGroup,
    circleStyleFieldGroup,
    colorFieldGroupList,
    downloadChannelColorModeFieldGroup,
    downloadDynamicChannelColorFieldGroup,
    downloadSolidChannelColorFieldGroup,
    networkCircularFieldGroup,
    networkDirectionFieldGroup,
    networkEndpointFieldGroup,
    networkChannelColorSettingsFieldGroup,
    networkChannelThresholdFieldGroup,
    networkTrafficDisplayModeFieldGroup,
    colorSettingsFieldGroup,
    mirroredGridLineNoteFieldGroup,
    sparklineAppearanceFieldGroup,
    sparklineGridLineFieldGroup,
    uploadChannelColorModeFieldGroup,
    uploadDynamicChannelColorFieldGroup,
    uploadSolidChannelColorFieldGroup,
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
        circleStyleFieldGroup,
        networkDirectionFieldGroup,
        networkCircularFieldGroup,
        networkEndpointFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const netSpeedTextScenario = defineScenario({
    scope: inspectorScope.netSpeedTextScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        networkDirectionFieldGroup,
        networkEndpointFieldGroup,
        networkChannelColorSettingsFieldGroup,
        networkChannelThresholdFieldGroup,
        downloadChannelColorModeFieldGroup,
        downloadSolidChannelColorFieldGroup,
        downloadDynamicChannelColorFieldGroup,
        uploadChannelColorModeFieldGroup,
        uploadSolidChannelColorFieldGroup,
        uploadDynamicChannelColorFieldGroup,
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
        networkEndpointFieldGroup,
        networkChannelColorSettingsFieldGroup,
        networkChannelThresholdFieldGroup,
        downloadChannelColorModeFieldGroup,
        downloadSolidChannelColorFieldGroup,
        downloadDynamicChannelColorFieldGroup,
        uploadChannelColorModeFieldGroup,
        uploadSolidChannelColorFieldGroup,
        uploadDynamicChannelColorFieldGroup,
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
        networkEndpointFieldGroup,
        networkTrafficDisplayModeFieldGroup,
        sparklineAppearanceFieldGroup,
        sparklineGridLineFieldGroup,
        mirroredGridLineNoteFieldGroup,
        networkChannelColorSettingsFieldGroup,
        networkChannelThresholdFieldGroup,
        downloadChannelColorModeFieldGroup,
        downloadSolidChannelColorFieldGroup,
        downloadDynamicChannelColorFieldGroup,
        uploadChannelColorModeFieldGroup,
        uploadSolidChannelColorFieldGroup,
        uploadDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

export function resolveNetSpeedScenario(context: VisibilityContext): InspectorScenario {
    return resolveGraphicScenario({
        graphicType: context.settings.graphicType,
        circularScenario: netSpeedCircularScenario,
        textScenario: netSpeedTextScenario,
        linearScenario: netSpeedLinearScenario,
        sparklineScenario: netSpeedSparklineScenario,
    });
}
