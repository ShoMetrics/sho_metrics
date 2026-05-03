import {
    baseFieldGroup,
    circularCenterFieldGroup,
    colorFieldGroupList,
    diskThroughputFieldGroup,
    diskUsageBaseFieldGroup,
    diskUsageCircularFieldGroup,
    diskUsageLinearLabelFieldGroup,
    visualStyleFieldGroup,
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
        visualStyleFieldGroup,
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
        visualStyleFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskUsageSparklineScenario = defineScenario({
    scope: inspectorScope.diskUsageSparklineScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskUsageBaseFieldGroup,
        visualStyleFieldGroup,
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
        visualStyleFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskThroughputLinearScenario = defineScenario({
    scope: inspectorScope.diskThroughputLinearScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputFieldGroup,
        visualStyleFieldGroup,
        ...colorFieldGroupList,
    ],
});

const diskThroughputSparklineScenario = defineScenario({
    scope: inspectorScope.diskThroughputSparklineScope,
    settingsNormalizer: defaultSettingsNormalizer,
    fieldGroupList: [
        baseFieldGroup,
        diskThroughputFieldGroup,
        visualStyleFieldGroup,
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
