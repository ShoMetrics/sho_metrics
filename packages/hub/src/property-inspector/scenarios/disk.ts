import {
    baseFieldGroup,
    circularCenterFieldGroup,
    colorFieldGroupList,
    diskReadChannelColorModeFieldGroup,
    diskReadDynamicChannelColorFieldGroup,
    diskReadSolidChannelColorFieldGroup,
    diskThroughputFieldGroup,
    diskUsageBaseFieldGroup,
    diskUsageCircularFieldGroup,
    diskUsageLinearLabelFieldGroup,
    diskThroughputChannelColorSettingsFieldGroup,
    diskThroughputChannelThresholdFieldGroup,
    diskWriteChannelColorModeFieldGroup,
    diskWriteDynamicChannelColorFieldGroup,
    diskWriteSolidChannelColorFieldGroup,
    colorSettingsFieldGroup,
    sparklineAppearanceFieldGroup,
    sparklineGridLineFieldGroup,
} from "../scenario-field-groups";
import {
    defaultSettingsNormalizer,
    defineScenario,
    resolveGraphicScenario,
    type InspectorScenario,
} from "../scenario-model";
import type { VisibilityContext } from "../schema";
import { inspectorScope } from "../scopes";

const diskUsageCircularScenario = defineScenario({
    scope: inspectorScope.diskUsageCircularScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        circularCenterFieldGroup,
        diskUsageBaseFieldGroup,
        diskUsageCircularFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskUsageLinearScenario = defineScenario({
    scope: inspectorScope.diskUsageLinearScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskUsageBaseFieldGroup,
        diskUsageLinearLabelFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskUsageSparklineScenario = defineScenario({
    scope: inspectorScope.diskUsageSparklineScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskUsageBaseFieldGroup,
        sparklineAppearanceFieldGroup,
        sparklineGridLineFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskThroughputCircularScenario = defineScenario({
    scope: inspectorScope.diskThroughputCircularScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        circularCenterFieldGroup,
        diskThroughputFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskThroughputLinearScenario = defineScenario({
    scope: inspectorScope.diskThroughputLinearScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskThroughputSparklineScenario = defineScenario({
    scope: inspectorScope.diskThroughputSparklineScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputFieldGroup,
        sparklineAppearanceFieldGroup,
        sparklineGridLineFieldGroup,
        diskThroughputChannelColorSettingsFieldGroup,
        diskThroughputChannelThresholdFieldGroup,
        diskReadChannelColorModeFieldGroup,
        diskReadSolidChannelColorFieldGroup,
        diskReadDynamicChannelColorFieldGroup,
        diskWriteChannelColorModeFieldGroup,
        diskWriteSolidChannelColorFieldGroup,
        diskWriteDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
    ],
});

export function resolveDiskScenario(context: VisibilityContext): InspectorScenario {
    if (context.settings.diskMetricKind === "throughput") {
        return resolveGraphicScenario({
            graphicType: context.settings.graphicType,
            circularScenario: diskThroughputCircularScenario,
            linearScenario: diskThroughputLinearScenario,
            sparklineScenario: diskThroughputSparklineScenario,
        });
    }

    return resolveGraphicScenario({
        graphicType: context.settings.graphicType,
        circularScenario: diskUsageCircularScenario,
        linearScenario: diskUsageLinearScenario,
        sparklineScenario: diskUsageSparklineScenario,
    });
}
