import type { ResolvedAppearanceSettingsOverride } from "../../src/settings/appearance-overrides";
import type { TextMetricVariant } from "../../src/view-rendering/render-appearance";
import type { MetricRenderTarget } from "../../src/view-rendering/metric-view-frame";
import type { DualChannelWidgetData, WidgetData } from "../../src/view-rendering/widget-data";
import type { CircleVariant } from "../../src/widgets/primitives/progress-circle";
import type { DualChannelProgressCircleCenterContent } from "../../src/widgets/primitives/dual-channel-progress-circle";
import type { DualChannelSparklineMode } from "../../src/widgets/primitives/dual-channel-sparkline";
import { renderNetworkPingIconFragment } from "../../src/widgets/icons/catalog/network";
import {
    CPU_CENTER_ICON_FRAGMENT,
    CPU_USAGE_BAR_WIDGET_DATA,
    CPU_USAGE_NO_DATA_WIDGET_DATA,
    CPU_USAGE_WIDGET_DATA,
    NETWORK_DOWNLOAD_ICON_FRAGMENT,
    NETWORK_DUAL_CHANNEL_WIDGET_DATA,
    NETWORK_NO_DATA_WIDGET_DATA,
    NETWORK_UPLOAD_ICON_FRAGMENT,
    VISUAL_TEST_COLORS,
    type DualMetricVisualTestCase,
    type SingleMetricVisualTestCase,
} from "./widget-visual-test-support";

export type VisualMatrixViewCaseId =
    | "single-circle-full-ring"
    | "single-circle-minimal"
    | "single-circle-gauge"
    | "single-centered-text"
    | "single-title-card-text"
    | "single-progress-bar"
    | "single-progress-bar-ping"
    | "single-sparkline"
    | "dual-circle-full-ring"
    | "dual-circle-minimal"
    | "dual-circle-gauge"
    | "dual-centered-text"
    | "dual-title-card-text"
    | "dual-sparkline-overlay"
    | "dual-sparkline-mirrored"
    | "multi-channel-progress-bar";

export type VisualMatrixThemeCaseId =
    | "flat"
    | "cupertino-glass"
    | "color-filled"
    | "terminal-clean"
    | "terminal-vintage"
    | "pixel-window";

export type VisualMatrixSurfaceCaseId =
    | "keypad-square"
    | "touch-strip-wide"
    | "touch-strip-square";

export type VisualMatrixDataCaseId = "data" | "no-data";

export type VisualMatrixMetricKind = "single" | "dual";

export interface VisualMatrixAxisValues {
    readonly viewCase: VisualMatrixViewCaseId;
    readonly themeCase: VisualMatrixThemeCaseId;
    readonly surfaceCase: VisualMatrixSurfaceCaseId;
    readonly dataCase: VisualMatrixDataCaseId;
}

export type VisualMatrixCase =
    | (VisualMatrixAxisValues & {
        readonly metricKind: "single";
        readonly snapshotName: string;
        readonly testCase: SingleMetricVisualTestCase;
    })
    | (VisualMatrixAxisValues & {
        readonly metricKind: "dual";
        readonly snapshotName: string;
        readonly testCase: DualMetricVisualTestCase;
    });

interface SingleViewCaseDefinition {
    readonly viewCase: VisualMatrixViewCaseId;
    readonly metricKind: "single";
    readonly selectedView: SingleSelectedView;
    readonly circleVariant?: CircleVariant;
    readonly textVariant?: TextMetricVariant;
    readonly dataByState: Record<VisualMatrixDataCaseId, WidgetData>;
    readonly centerIcon?: string;
    readonly topIcon?: string;
}

interface DualViewCaseDefinition {
    readonly viewCase: VisualMatrixViewCaseId;
    readonly metricKind: "dual";
    readonly selectedView: DualSelectedView;
    readonly circleVariant?: CircleVariant;
    readonly textVariant?: TextMetricVariant;
    readonly centerContent?: DualChannelProgressCircleCenterContent;
    readonly chartMode?: DualChannelSparklineMode;
    readonly dataByState: Record<VisualMatrixDataCaseId, DualChannelWidgetData>;
}

interface ThemeCaseDefinition {
    readonly themeCase: VisualMatrixThemeCaseId;
    readonly appearanceTheme: NonNullable<ResolvedAppearanceSettingsOverride["theme"]>;
}

interface SurfaceCaseDefinition {
    readonly surfaceCase: VisualMatrixSurfaceCaseId;
    readonly renderTarget: MetricRenderTarget;
    readonly supportsViewCase: (viewCaseDefinition: ViewCaseDefinition) => boolean;
    readonly unsupportedReason?: string;
}

type ViewCaseDefinition = SingleViewCaseDefinition | DualViewCaseDefinition;
type SingleSelectedView = "circle" | "text" | "bar" | "line";
type DualSelectedView = "circle" | "text" | "line";

export const VISUAL_MATRIX_VIEW_CASES: readonly VisualMatrixViewCaseId[] = [
    "single-circle-full-ring",
    "single-circle-minimal",
    "single-circle-gauge",
    "single-centered-text",
    "single-title-card-text",
    "single-progress-bar",
    "single-progress-bar-ping",
    "single-sparkline",
    "dual-circle-full-ring",
    "dual-circle-minimal",
    "dual-circle-gauge",
    "dual-centered-text",
    "dual-title-card-text",
    "dual-sparkline-overlay",
    "dual-sparkline-mirrored",
    "multi-channel-progress-bar",
];

export const VISUAL_MATRIX_THEME_CASES: readonly VisualMatrixThemeCaseId[] = [
    "flat",
    "cupertino-glass",
    "color-filled",
    "terminal-clean",
    "terminal-vintage",
    "pixel-window",
];

export const VISUAL_MATRIX_SURFACE_CASES: readonly VisualMatrixSurfaceCaseId[] = [
    "keypad-square",
    "touch-strip-wide",
    "touch-strip-square",
];

export const VISUAL_MATRIX_DATA_CASES: readonly VisualMatrixDataCaseId[] = [
    "data",
    "no-data",
];

const SINGLE_NO_DATA_BAR_WIDGET_DATA: WidgetData = {
    ...CPU_USAGE_NO_DATA_WIDGET_DATA,
    barLabel: "CPU Load",
    barDisplayValue: "N/A",
    barUnit: "",
};

const SINGLE_PING_BAR_WIDGET_DATA: WidgetData = {
    current: 37,
    progress: 0.185,
    history: [22, 24, 31, 28, 35, 40, 37],
    unit: "ms",
    label: "PING",
    displayValue: "37",
    secondaryDisplayValue: "example.com",
    sampleTimestampMilliseconds: 1,
};

const SINGLE_PING_NO_DATA_BAR_WIDGET_DATA: WidgetData = {
    ...SINGLE_PING_BAR_WIDGET_DATA,
    current: 0,
    progress: 0,
    history: [],
    displayValue: "N/A",
    sampleTimestampMilliseconds: undefined,
};

const SINGLE_TITLE_CARD_DATA: WidgetData = {
    ...CPU_USAGE_WIDGET_DATA,
    current: 99,
    progress: 0.99,
    displayValue: "99",
};

const SINGLE_PERCENT_STRESS_WIDGET_DATA: WidgetData = {
    ...CPU_USAGE_WIDGET_DATA,
    current: 100,
    progress: 1,
    displayValue: "100",
};

const SINGLE_RATE_STRESS_WIDGET_DATA: WidgetData = {
    ...CPU_USAGE_WIDGET_DATA,
    current: 999,
    progress: 0.96,
    unit: "MB/s",
    label: "DISK",
    displayValue: "999",
};

const MULTI_CHANNEL_PROGRESS_BAR_DATA: WidgetData = {
    current: 0,
    progress: 0,
    history: [],
    unit: "",
    label: "Disk",
    barLabel: "DISK",
    sampleTimestampMilliseconds: 1,
    barChannels: [
        {
            label: "RD",
            displayValue: "999",
            unit: "KB/s",
            progress: 0.72,
            color: VISUAL_TEST_COLORS.networkDownload,
            iconFragment: NETWORK_DOWNLOAD_ICON_FRAGMENT,
        },
        {
            label: "WR",
            displayValue: "88",
            unit: "MB/s",
            progress: 0.48,
            color: VISUAL_TEST_COLORS.networkUpload,
            iconFragment: NETWORK_UPLOAD_ICON_FRAGMENT,
        },
    ],
};

const MULTI_CHANNEL_PROGRESS_BAR_NO_DATA: WidgetData = {
    ...MULTI_CHANNEL_PROGRESS_BAR_DATA,
    sampleTimestampMilliseconds: undefined,
    barChannels: [
        {
            label: "RD",
            displayValue: "N/A",
            unit: "",
            progress: 0,
            color: VISUAL_TEST_COLORS.networkDownload,
            iconFragment: NETWORK_DOWNLOAD_ICON_FRAGMENT,
        },
        {
            label: "WR",
            displayValue: "N/A",
            unit: "",
            progress: 0,
            color: VISUAL_TEST_COLORS.networkUpload,
            iconFragment: NETWORK_UPLOAD_ICON_FRAGMENT,
        },
    ],
};

const VIEW_CASE_DEFINITIONS: readonly ViewCaseDefinition[] = [
    {
        viewCase: "single-circle-full-ring",
        metricKind: "single",
        selectedView: "circle",
        circleVariant: "full-ring",
        dataByState: buildSingleDataStates(SINGLE_PERCENT_STRESS_WIDGET_DATA, CPU_USAGE_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "single-circle-minimal",
        metricKind: "single",
        selectedView: "circle",
        circleVariant: "minimal",
        dataByState: buildSingleDataStates(CPU_USAGE_WIDGET_DATA, CPU_USAGE_NO_DATA_WIDGET_DATA),
        centerIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        viewCase: "single-circle-gauge",
        metricKind: "single",
        selectedView: "circle",
        circleVariant: "gauge",
        dataByState: buildSingleDataStates(CPU_USAGE_WIDGET_DATA, CPU_USAGE_NO_DATA_WIDGET_DATA),
        centerIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        viewCase: "single-centered-text",
        metricKind: "single",
        selectedView: "text",
        textVariant: "centered",
        dataByState: buildSingleDataStates(SINGLE_RATE_STRESS_WIDGET_DATA, CPU_USAGE_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "single-title-card-text",
        metricKind: "single",
        selectedView: "text",
        textVariant: "title-card",
        dataByState: buildSingleDataStates(SINGLE_TITLE_CARD_DATA, CPU_USAGE_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "single-progress-bar",
        metricKind: "single",
        selectedView: "bar",
        dataByState: buildSingleDataStates(CPU_USAGE_BAR_WIDGET_DATA, SINGLE_NO_DATA_BAR_WIDGET_DATA),
        topIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        viewCase: "single-progress-bar-ping",
        metricKind: "single",
        selectedView: "bar",
        dataByState: buildSingleDataStates(SINGLE_PING_BAR_WIDGET_DATA, SINGLE_PING_NO_DATA_BAR_WIDGET_DATA),
        topIcon: renderNetworkPingIconFragment({ size: 58 }),
    },
    {
        viewCase: "single-sparkline",
        metricKind: "single",
        selectedView: "line",
        dataByState: buildSingleDataStates(CPU_USAGE_WIDGET_DATA, CPU_USAGE_NO_DATA_WIDGET_DATA),
        topIcon: CPU_CENTER_ICON_FRAGMENT,
    },
    {
        viewCase: "dual-circle-full-ring",
        metricKind: "dual",
        selectedView: "circle",
        circleVariant: "full-ring",
        centerContent: "value",
        dataByState: buildDualDataStates(NETWORK_DUAL_CHANNEL_WIDGET_DATA, NETWORK_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "dual-circle-minimal",
        metricKind: "dual",
        selectedView: "circle",
        circleVariant: "minimal",
        centerContent: "icon",
        dataByState: buildDualDataStates(NETWORK_DUAL_CHANNEL_WIDGET_DATA, NETWORK_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "dual-circle-gauge",
        metricKind: "dual",
        selectedView: "circle",
        circleVariant: "gauge",
        centerContent: "icon-value-unit",
        dataByState: buildDualDataStates(NETWORK_DUAL_CHANNEL_WIDGET_DATA, NETWORK_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "dual-centered-text",
        metricKind: "dual",
        selectedView: "text",
        textVariant: "centered",
        dataByState: buildDualDataStates(NETWORK_DUAL_CHANNEL_WIDGET_DATA, NETWORK_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "dual-title-card-text",
        metricKind: "dual",
        selectedView: "text",
        textVariant: "title-card",
        dataByState: buildDualDataStates(NETWORK_DUAL_CHANNEL_WIDGET_DATA, NETWORK_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "dual-sparkline-overlay",
        metricKind: "dual",
        selectedView: "line",
        chartMode: "overlay",
        dataByState: buildDualDataStates(NETWORK_DUAL_CHANNEL_WIDGET_DATA, NETWORK_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "dual-sparkline-mirrored",
        metricKind: "dual",
        selectedView: "line",
        chartMode: "mirrored",
        dataByState: buildDualDataStates(NETWORK_DUAL_CHANNEL_WIDGET_DATA, NETWORK_NO_DATA_WIDGET_DATA),
    },
    {
        viewCase: "multi-channel-progress-bar",
        metricKind: "single",
        selectedView: "bar",
        dataByState: buildSingleDataStates(MULTI_CHANNEL_PROGRESS_BAR_DATA, MULTI_CHANNEL_PROGRESS_BAR_NO_DATA),
        topIcon: CPU_CENTER_ICON_FRAGMENT,
    },
];

const THEME_CASE_DEFINITIONS: readonly ThemeCaseDefinition[] = [
    {
        themeCase: "flat",
        appearanceTheme: {
            selectedTheme: "flat",
            flat: {
                paint: {
                    colorMode: "multi-color",
                },
            },
        },
    },
    {
        themeCase: "cupertino-glass",
        appearanceTheme: {
            selectedTheme: "cupertino-glass",
            cupertinoGlass: {
                paint: {
                    colorMode: "multi-color",
                },
            },
        },
    },
    {
        themeCase: "color-filled",
        appearanceTheme: {
            selectedTheme: "color-filled",
        },
    },
    {
        themeCase: "terminal-clean",
        appearanceTheme: {
            selectedTheme: "terminal",
            terminal: {
                variant: "clean",
                paint: {
                    preset: "green",
                },
            },
        },
    },
    {
        themeCase: "terminal-vintage",
        appearanceTheme: {
            selectedTheme: "terminal",
            terminal: {
                variant: "vintage",
                paint: {
                    preset: "green",
                },
            },
        },
    },
    {
        themeCase: "pixel-window",
        appearanceTheme: {
            selectedTheme: "pixel-window",
        },
    },
];

const SURFACE_CASE_DEFINITIONS: readonly SurfaceCaseDefinition[] = [
    {
        surfaceCase: "keypad-square",
        renderTarget: "key",
        supportsViewCase: () => true,
    },
    {
        surfaceCase: "touch-strip-wide",
        renderTarget: "touch-strip",
        supportsViewCase: viewCaseDefinition => viewCaseDefinition.selectedView !== "circle",
        unsupportedReason: "Circle views use the production touch-strip-square layout from resolveTouchStripMetricLayout.",
    },
    {
        surfaceCase: "touch-strip-square",
        renderTarget: "touch-strip",
        supportsViewCase: viewCaseDefinition => viewCaseDefinition.selectedView === "circle",
        unsupportedReason: "Non-circle views use the production touch-strip-wide layout from resolveTouchStripMetricLayout.",
    },
];

export const WIDGET_VISUAL_MATRIX_CASES: readonly VisualMatrixCase[] = buildVisualMatrixCases();

export function getRequiredVisualMatrixSurfaceCases(
    viewCase: VisualMatrixViewCaseId,
): readonly VisualMatrixSurfaceCaseId[] {
    const viewCaseDefinition = VIEW_CASE_DEFINITIONS.find(definition => definition.viewCase === viewCase);

    if (!viewCaseDefinition) {
        throw new Error(`Unknown visual matrix view case: ${viewCase}`);
    }

    return SURFACE_CASE_DEFINITIONS
        .filter(surfaceCaseDefinition => surfaceCaseDefinition.supportsViewCase(viewCaseDefinition))
        .map(surfaceCaseDefinition => surfaceCaseDefinition.surfaceCase);
}

export function getVisualMatrixSurfaceExclusionReasons(
    viewCase: VisualMatrixViewCaseId,
): ReadonlyMap<VisualMatrixSurfaceCaseId, string> {
    const viewCaseDefinition = VIEW_CASE_DEFINITIONS.find(definition => definition.viewCase === viewCase);

    if (!viewCaseDefinition) {
        throw new Error(`Unknown visual matrix view case: ${viewCase}`);
    }

    const exclusionReasons = new Map<VisualMatrixSurfaceCaseId, string>();

    for (const surfaceCaseDefinition of SURFACE_CASE_DEFINITIONS) {
        if (surfaceCaseDefinition.supportsViewCase(viewCaseDefinition)) {
            continue;
        }

        if (!surfaceCaseDefinition.unsupportedReason) {
            throw new Error(
                `Missing visual matrix surface exclusion reason for ${viewCase}:${surfaceCaseDefinition.surfaceCase}`,
            );
        }

        exclusionReasons.set(surfaceCaseDefinition.surfaceCase, surfaceCaseDefinition.unsupportedReason);
    }

    return exclusionReasons;
}

function buildVisualMatrixCases(): readonly VisualMatrixCase[] {
    const matrixCases: VisualMatrixCase[] = [];

    for (const viewCaseDefinition of VIEW_CASE_DEFINITIONS) {
        for (const themeCaseDefinition of THEME_CASE_DEFINITIONS) {
            for (const surfaceCaseDefinition of SURFACE_CASE_DEFINITIONS) {
                if (!surfaceCaseDefinition.supportsViewCase(viewCaseDefinition)) {
                    continue;
                }

                for (const dataCase of VISUAL_MATRIX_DATA_CASES) {
                    const snapshotName = [
                        themeCaseDefinition.themeCase,
                        surfaceCaseDefinition.surfaceCase,
                        dataCase,
                        viewCaseDefinition.viewCase,
                    ].join("-");
                    const appearance = buildAppearanceOverride(viewCaseDefinition, themeCaseDefinition);

                    if (viewCaseDefinition.metricKind === "single") {
                        matrixCases.push({
                            viewCase: viewCaseDefinition.viewCase,
                            themeCase: themeCaseDefinition.themeCase,
                            surfaceCase: surfaceCaseDefinition.surfaceCase,
                            dataCase,
                            metricKind: "single",
                            snapshotName,
                            testCase: {
                                snapshotName,
                                appearance,
                                data: viewCaseDefinition.dataByState[dataCase],
                                renderTarget: surfaceCaseDefinition.renderTarget,
                                centerIcon: viewCaseDefinition.centerIcon,
                                topIcon: viewCaseDefinition.topIcon,
                            },
                        });

                        continue;
                    }

                    matrixCases.push({
                        viewCase: viewCaseDefinition.viewCase,
                        themeCase: themeCaseDefinition.themeCase,
                        surfaceCase: surfaceCaseDefinition.surfaceCase,
                        dataCase,
                        metricKind: "dual",
                        snapshotName,
                        testCase: {
                            snapshotName,
                            appearance,
                            data: viewCaseDefinition.dataByState[dataCase],
                            selectedView: viewCaseDefinition.selectedView,
                            renderTarget: surfaceCaseDefinition.renderTarget,
                            chartMode: viewCaseDefinition.chartMode,
                            centerContent: viewCaseDefinition.centerContent,
                            circleVariant: viewCaseDefinition.circleVariant,
                        },
                    });
                }
            }
        }
    }

    return matrixCases;
}

function buildAppearanceOverride(
    viewCaseDefinition: ViewCaseDefinition,
    themeCaseDefinition: ThemeCaseDefinition,
): ResolvedAppearanceSettingsOverride {
    return {
        view: {
            selectedView: viewCaseDefinition.selectedView,
            circleVariant: viewCaseDefinition.circleVariant,
            textVariant: viewCaseDefinition.textVariant,
        },
        theme: themeCaseDefinition.appearanceTheme,
    };
}

function buildSingleDataStates(data: WidgetData, noData: WidgetData): Record<VisualMatrixDataCaseId, WidgetData> {
    return {
        data,
        "no-data": noData,
    };
}

function buildDualDataStates(
    data: DualChannelWidgetData,
    noData: DualChannelWidgetData,
): Record<VisualMatrixDataCaseId, DualChannelWidgetData> {
    return {
        data,
        "no-data": noData,
    };
}
