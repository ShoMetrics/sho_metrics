import {
    baseFieldGroup,
    circleStyleFieldGroup,
    colorFieldGroupList,
    diskReadChannelColorHeadingFieldGroup,
    diskReadDynamicChannelColorFieldGroup,
    diskReadSolidChannelColorFieldGroup,
    diskThroughputFieldGroup,
    diskUsageBaseFieldGroup,
    diskUsageCircularFieldGroup,
    diskUsageLinearLabelFieldGroup,
    diskThroughputChannelColorSettingsFieldGroup,
    diskThroughputChannelThresholdFieldGroup,
    diskWriteChannelColorHeadingFieldGroup,
    diskWriteDynamicChannelColorFieldGroup,
    diskWriteSolidChannelColorFieldGroup,
    colorSettingsFieldGroup,
    sparklineAppearanceFieldGroup,
    sparklineGridLineFieldGroup,
    updateFieldGroup,
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
        circleStyleFieldGroup,
        diskUsageBaseFieldGroup,
        diskUsageCircularFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
    ],
});

const diskUsageTextScenario = defineScenario({
    scope: inspectorScope.diskUsageTextScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskUsageBaseFieldGroup,
        diskUsageCircularFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
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
        updateFieldGroup,
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
        updateFieldGroup,
    ],
});

const diskThroughputCircularScenario = defineScenario({
    scope: inspectorScope.diskThroughputCircularScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        circleStyleFieldGroup,
        diskThroughputFieldGroup,
        diskThroughputChannelColorSettingsFieldGroup,
        diskThroughputChannelThresholdFieldGroup,
        diskReadChannelColorHeadingFieldGroup,
        diskReadSolidChannelColorFieldGroup,
        diskReadDynamicChannelColorFieldGroup,
        diskWriteChannelColorHeadingFieldGroup,
        diskWriteSolidChannelColorFieldGroup,
        diskWriteDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
    ],
});

const diskThroughputTextScenario = defineScenario({
    scope: inspectorScope.diskThroughputTextScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputFieldGroup,
        diskThroughputChannelColorSettingsFieldGroup,
        diskThroughputChannelThresholdFieldGroup,
        diskReadChannelColorHeadingFieldGroup,
        diskReadSolidChannelColorFieldGroup,
        diskReadDynamicChannelColorFieldGroup,
        diskWriteChannelColorHeadingFieldGroup,
        diskWriteSolidChannelColorFieldGroup,
        diskWriteDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
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
        updateFieldGroup,
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
        diskReadChannelColorHeadingFieldGroup,
        diskReadSolidChannelColorFieldGroup,
        diskReadDynamicChannelColorFieldGroup,
        diskWriteChannelColorHeadingFieldGroup,
        diskWriteSolidChannelColorFieldGroup,
        diskWriteDynamicChannelColorFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
    ],
});

export function resolveDiskScenario(context: VisibilityContext): InspectorScenario {
    if (context.settings.diskMetricKind === "throughput") {
        return resolveGraphicScenario({
            graphicType: context.settings.graphicType,
            circularScenario: diskThroughputCircularScenario,
            textScenario: diskThroughputTextScenario,
            linearScenario: diskThroughputLinearScenario,
            sparklineScenario: diskThroughputSparklineScenario,
        });
    }

    return resolveGraphicScenario({
        graphicType: context.settings.graphicType,
        circularScenario: diskUsageCircularScenario,
        textScenario: diskUsageTextScenario,
        linearScenario: diskUsageLinearScenario,
        sparklineScenario: diskUsageSparklineScenario,
    });
}
