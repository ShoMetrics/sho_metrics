import {
    baseFieldGroup,
    circleStyleFieldGroup,
    colorFieldGroupList,
    downloadChannelColorHeadingFieldGroup,
    downloadDynamicChannelColorFieldGroup,
    downloadSolidChannelColorFieldGroup,
    networkCircularFieldGroup,
    networkDirectionFieldGroup,
    networkInterfaceFieldGroup,
    networkScaleFieldGroup,
    networkChannelColorSettingsFieldGroup,
    networkChannelThresholdFieldGroup,
    networkTrafficDisplayModeFieldGroup,
    colorSettingsFieldGroup,
    mirroredGridLineNoteFieldGroup,
    sparklineAppearanceFieldGroup,
    sparklineGridLineFieldGroup,
    updateFieldGroup,
    uploadChannelColorHeadingFieldGroup,
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
        networkInterfaceFieldGroup,
        networkScaleFieldGroup,
        networkChannelColorSettingsFieldGroup,
        networkChannelThresholdFieldGroup,
        downloadChannelColorHeadingFieldGroup,
        downloadSolidChannelColorFieldGroup,
        downloadDynamicChannelColorFieldGroup,
        uploadChannelColorHeadingFieldGroup,
        uploadSolidChannelColorFieldGroup,
        uploadDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
    ],
});

const netSpeedTextScenario = defineScenario({
    scope: inspectorScope.netSpeedTextScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        networkDirectionFieldGroup,
        networkInterfaceFieldGroup,
        networkScaleFieldGroup,
        networkChannelColorSettingsFieldGroup,
        networkChannelThresholdFieldGroup,
        downloadChannelColorHeadingFieldGroup,
        downloadSolidChannelColorFieldGroup,
        downloadDynamicChannelColorFieldGroup,
        uploadChannelColorHeadingFieldGroup,
        uploadSolidChannelColorFieldGroup,
        uploadDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
    ],
});

const netSpeedLinearScenario = defineScenario({
    scope: inspectorScope.netSpeedLinearScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        networkDirectionFieldGroup,
        networkInterfaceFieldGroup,
        networkScaleFieldGroup,
        networkChannelColorSettingsFieldGroup,
        networkChannelThresholdFieldGroup,
        downloadChannelColorHeadingFieldGroup,
        downloadSolidChannelColorFieldGroup,
        downloadDynamicChannelColorFieldGroup,
        uploadChannelColorHeadingFieldGroup,
        uploadSolidChannelColorFieldGroup,
        uploadDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
    ],
});

const netSpeedSparklineScenario = defineScenario({
    scope: inspectorScope.netSpeedSparklineScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        networkDirectionFieldGroup,
        networkInterfaceFieldGroup,
        networkScaleFieldGroup,
        networkTrafficDisplayModeFieldGroup,
        sparklineAppearanceFieldGroup,
        sparklineGridLineFieldGroup,
        mirroredGridLineNoteFieldGroup,
        networkChannelColorSettingsFieldGroup,
        networkChannelThresholdFieldGroup,
        downloadChannelColorHeadingFieldGroup,
        downloadSolidChannelColorFieldGroup,
        downloadDynamicChannelColorFieldGroup,
        uploadChannelColorHeadingFieldGroup,
        uploadSolidChannelColorFieldGroup,
        uploadDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
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
