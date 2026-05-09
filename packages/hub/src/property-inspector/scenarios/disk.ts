import {
    baseFieldGroup,
    circleStyleFieldGroup,
    colorFieldGroupList,
    diskReadChannelColorHeadingFieldGroup,
    diskReadDynamicChannelColorFieldGroup,
    diskReadSolidChannelColorFieldGroup,
    diskThroughputMetricFieldGroup,
    diskThroughputScaleFieldGroup,
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
    defineScenario,
    resolveGraphicScenario,
    type InspectorScenario,
} from "../scenario-model";
import type { VisibilityContext } from "../schema";
import { inspectorScope } from "../scopes";

const diskUsageCircularScenario = defineScenario({
    scope: inspectorScope.diskUsageCircularScope,
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
    fieldGroupList: [
        baseFieldGroup,
        circleStyleFieldGroup,
        diskThroughputMetricFieldGroup,
        diskThroughputScaleFieldGroup,
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
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputMetricFieldGroup,
        diskThroughputScaleFieldGroup,
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
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputMetricFieldGroup,
        diskThroughputScaleFieldGroup,
        colorSettingsFieldGroup,
        ...colorFieldGroupList,
        updateFieldGroup,
    ],
});

const diskThroughputSparklineScenario = defineScenario({
    scope: inspectorScope.diskThroughputSparklineScope,
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputMetricFieldGroup,
        diskThroughputScaleFieldGroup,
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
    if (context.resolved.metric.diskMetricKind === "throughput") {
        return resolveGraphicScenario({
            graphicType: context.resolved.appearance.graphicType,
            circularScenario: diskThroughputCircularScenario,
            textScenario: diskThroughputTextScenario,
            linearScenario: diskThroughputLinearScenario,
            sparklineScenario: diskThroughputSparklineScenario,
        });
    }

    return resolveGraphicScenario({
        graphicType: context.resolved.appearance.graphicType,
        circularScenario: diskUsageCircularScenario,
        textScenario: diskUsageTextScenario,
        linearScenario: diskUsageLinearScenario,
        sparklineScenario: diskUsageSparklineScenario,
    });
}
