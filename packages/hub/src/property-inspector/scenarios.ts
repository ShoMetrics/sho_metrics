import { inspectorFieldCatalog } from "./fields";
import { inspectorScope, type InspectorScope } from "./scopes";
import type { ActionKind, GraphicType } from "./settings";
import type { FieldSchema, VisibilityContext } from "./schema";

interface InspectorScenario {
    scope: InspectorScope;
    fields: readonly FieldSchema[];
}

const baseFieldList = [
    inspectorFieldCatalog.pollingFrequencyField,
    inspectorFieldCatalog.graphicTypeField,
] as const;

const circularFieldList = [
    inspectorFieldCatalog.circularCenterContentField,
] as const;

const solidColorFieldList = [
    inspectorFieldCatalog.solidColorField,
] as const;

const thresholdColorFieldList = [
    inspectorFieldCatalog.dynamicUsageColorsHeadingField,
    inspectorFieldCatalog.dynamicUsageColorsNoteField,
    inspectorFieldCatalog.lowThresholdField,
    inspectorFieldCatalog.highThresholdField,
    inspectorFieldCatalog.lowUsageColorField,
    inspectorFieldCatalog.mediumUsageColorField,
    inspectorFieldCatalog.highUsageColorField,
] as const;

const visualStyleFieldList = [
    inspectorFieldCatalog.graphicStyleField,
    inspectorFieldCatalog.colorModeField,
] as const;

const diskUsageCircularScenario = defineScenario({
    scope: inspectorScope.diskUsageCircularScope,
    fields: [
        ...baseFieldList,
        ...circularFieldList,
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskVolumeField,
        inspectorFieldCatalog.diskUsageDisplayModeField,
        ...visualStyleFieldList,
    ],
});

const diskUsageLinearScenario = defineScenario({
    scope: inspectorScope.diskUsageLinearScope,
    fields: [
        ...baseFieldList,
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskVolumeField,
        inspectorFieldCatalog.diskLinearLabelField,
        inspectorFieldCatalog.diskVolumeLabelField,
        ...visualStyleFieldList,
    ],
});

const diskUsageSparklineScenario = defineScenario({
    scope: inspectorScope.diskUsageSparklineScope,
    fields: [
        ...baseFieldList,
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskVolumeField,
        ...visualStyleFieldList,
    ],
});

const diskThroughputCircularScenario = defineScenario({
    scope: inspectorScope.diskThroughputCircularScope,
    fields: [
        ...baseFieldList,
        ...circularFieldList,
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskThroughputDirectionField,
        inspectorFieldCatalog.maximumDiskThroughputField,
        ...visualStyleFieldList,
    ],
});

const diskThroughputLinearScenario = defineScenario({
    scope: inspectorScope.diskThroughputLinearScope,
    fields: [
        ...baseFieldList,
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskThroughputDirectionField,
        inspectorFieldCatalog.maximumDiskThroughputField,
        ...visualStyleFieldList,
    ],
});

const diskThroughputSparklineScenario = defineScenario({
    scope: inspectorScope.diskThroughputSparklineScope,
    fields: [
        ...baseFieldList,
        inspectorFieldCatalog.diskMetricKindField,
        inspectorFieldCatalog.diskThroughputDirectionField,
        inspectorFieldCatalog.maximumDiskThroughputField,
        ...visualStyleFieldList,
    ],
});

const netSpeedCircularScenario = defineScenario({
    scope: inspectorScope.netSpeedCircularScope,
    fields: [
        ...baseFieldList,
        ...circularFieldList,
        inspectorFieldCatalog.networkDirectionField,
        inspectorFieldCatalog.networkCircleNoteField,
        inspectorFieldCatalog.networkInterfaceField,
        inspectorFieldCatalog.maximumNetworkSpeedField,
        inspectorFieldCatalog.networkUnitBaseField,
        inspectorFieldCatalog.downloadIconColorField,
        inspectorFieldCatalog.uploadIconColorField,
        ...visualStyleFieldList,
    ],
});

const netSpeedLinearScenario = defineScenario({
    scope: inspectorScope.netSpeedLinearScope,
    fields: [
        ...baseFieldList,
        inspectorFieldCatalog.networkDirectionField,
        ...visualStyleFieldList,
    ],
});

const netSpeedSparklineScenario = defineScenario({
    scope: inspectorScope.netSpeedSparklineScope,
    fields: [
        ...baseFieldList,
        inspectorFieldCatalog.networkDirectionField,
        ...visualStyleFieldList,
    ],
});

export function resolveInspectorFieldList(context: VisibilityContext): readonly FieldSchema[] {
    const scenario = resolveInspectorScenario(context);
    const colorFieldList = context.settings.colorMode === "solid"
        ? solidColorFieldList
        : thresholdColorFieldList;

    return [
        ...scenario.fields,
        ...colorFieldList,
    ].filter(field => isFieldAllowedInScenario(field, scenario, context));
}

function resolveInspectorScenario(context: VisibilityContext): InspectorScenario {
    if (context.actionKind === "disk") {
        return resolveDiskScenario(context);
    }

    if (context.actionKind === "net-speed") {
        return resolveGraphicScenario({
            actionKind: context.actionKind,
            graphicType: context.settings.graphicType,
            circularScenario: netSpeedCircularScenario,
            linearScenario: netSpeedLinearScenario,
            sparklineScenario: netSpeedSparklineScenario,
        });
    }

    if (context.actionKind === "gpu-temp") {
        return resolveGpuTempScenario(context.settings.graphicType);
    }

    if (context.actionKind === "gpu-power") {
        return resolveGpuPowerScenario(context.settings.graphicType);
    }

    return resolveDefaultScenario(context.actionKind, context.settings.graphicType);
}

function resolveDiskScenario(context: VisibilityContext): InspectorScenario {
    if (context.settings.diskMetricKind === "throughput") {
        return resolveGraphicScenario({
            actionKind: "disk",
            graphicType: context.settings.graphicType,
            circularScenario: diskThroughputCircularScenario,
            linearScenario: diskThroughputLinearScenario,
            sparklineScenario: diskThroughputSparklineScenario,
        });
    }

    return resolveGraphicScenario({
        actionKind: "disk",
        graphicType: context.settings.graphicType,
        circularScenario: diskUsageCircularScenario,
        linearScenario: diskUsageLinearScenario,
        sparklineScenario: diskUsageSparklineScenario,
    });
}

function resolveGpuTempScenario(graphicType: GraphicType): InspectorScenario {
    const scope = resolveScope({
        actionKind: "gpu-temp",
        graphicType,
        circularScope: inspectorScope.gpuTempCircularScope,
        linearScope: inspectorScope.gpuTempLinearScope,
        sparklineScope: inspectorScope.gpuTempSparklineScope,
    });
    const scenario = defineScenario({
        scope,
        fields: [
            ...baseFieldList,
            ...(graphicType === "circular" ? circularFieldList : []),
            inspectorFieldCatalog.temperatureUnitField,
            ...(graphicType === "dashed-line" ? [] : [inspectorFieldCatalog.maximumTemperatureField]),
            ...visualStyleFieldList,
        ],
    });

    return scenario;
}

function resolveGpuPowerScenario(graphicType: GraphicType): InspectorScenario {
    const scope = resolveScope({
        actionKind: "gpu-power",
        graphicType,
        circularScope: inspectorScope.gpuPowerCircularScope,
        linearScope: inspectorScope.gpuPowerLinearScope,
        sparklineScope: inspectorScope.gpuPowerSparklineScope,
    });
    const scenario = defineScenario({
        scope,
        fields: [
            ...baseFieldList,
            ...(graphicType === "circular" ? circularFieldList : []),
            ...(graphicType === "dashed-line" ? [] : [inspectorFieldCatalog.maximumGpuPowerField]),
            ...visualStyleFieldList,
        ],
    });

    return scenario;
}

function resolveDefaultScenario(actionKind: ActionKind, graphicType: GraphicType): InspectorScenario {
    const scope = resolveDefaultScope(actionKind, graphicType);

    return defineScenario({
        scope,
        fields: [
            ...baseFieldList,
            ...(graphicType === "circular" ? circularFieldList : []),
            ...visualStyleFieldList,
        ],
    });
}

function resolveGraphicScenario(options: {
    actionKind: ActionKind;
    graphicType: GraphicType;
    circularScenario: InspectorScenario;
    linearScenario: InspectorScenario;
    sparklineScenario: InspectorScenario;
}): InspectorScenario {
    void options.actionKind;

    if (options.graphicType === "linear") {
        return options.linearScenario;
    }

    if (options.graphicType === "dashed-line") {
        return options.sparklineScenario;
    }

    return options.circularScenario;
}

function resolveDefaultScope(actionKind: ActionKind, graphicType: GraphicType): InspectorScope {
    if (actionKind === "cpu-usage") {
        return resolveScope({
            actionKind,
            graphicType,
            circularScope: inspectorScope.cpuUsageCircularScope,
            linearScope: inspectorScope.cpuUsageLinearScope,
            sparklineScope: inspectorScope.cpuUsageSparklineScope,
        });
    }

    if (actionKind === "ram") {
        return resolveScope({
            actionKind,
            graphicType,
            circularScope: inspectorScope.ramCircularScope,
            linearScope: inspectorScope.ramLinearScope,
            sparklineScope: inspectorScope.ramSparklineScope,
        });
    }

    if (actionKind === "gpu-usage") {
        return resolveScope({
            actionKind,
            graphicType,
            circularScope: inspectorScope.gpuUsageCircularScope,
            linearScope: inspectorScope.gpuUsageLinearScope,
            sparklineScope: inspectorScope.gpuUsageSparklineScope,
        });
    }

    if (actionKind === "gpu-vram") {
        return resolveScope({
            actionKind,
            graphicType,
            circularScope: inspectorScope.gpuVramCircularScope,
            linearScope: inspectorScope.gpuVramLinearScope,
            sparklineScope: inspectorScope.gpuVramSparklineScope,
        });
    }

    return inspectorScope.unknownScope;
}

function resolveScope(options: {
    actionKind: ActionKind;
    graphicType: GraphicType;
    circularScope: InspectorScope;
    linearScope: InspectorScope;
    sparklineScope: InspectorScope;
}): InspectorScope {
    void options.actionKind;

    if (options.graphicType === "linear") {
        return options.linearScope;
    }

    if (options.graphicType === "dashed-line") {
        return options.sparklineScope;
    }

    return options.circularScope;
}

function isFieldAllowedInScenario(
    field: FieldSchema,
    scenario: InspectorScenario,
    context: VisibilityContext,
): boolean {
    if (field.excludeWindows === true && context.isWindows) {
        return false;
    }

    if (field.allowedScopes.includes(scenario.scope)) {
        return true;
    }

    if (isDevelopmentEnvironment()) {
        throw new Error(`Field "${field.id}" is not allowed in scope "${scenario.scope}".`);
    }

    return false;
}

function defineScenario(scenario: InspectorScenario): InspectorScenario {
    return scenario;
}

function isDevelopmentEnvironment(): boolean {
    return typeof process !== "undefined"
        && typeof process.env === "object"
        && process.env.NODE_ENV === "development";
}
