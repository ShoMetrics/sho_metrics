import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionKind } from "../inspector/settings-types";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import type { WidgetRuntimeCachePatch } from "../../runtime/widget-runtime-cache";
import { MetricUnit } from "../../runtime/sources/metric-source";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
} from "../../runtime/sources/source-client";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import type { PropertyInspectorRuntimeCacheStatus } from "../inspector/types";
import {
    buildCatalogMetricCustomLabelPatch,
    buildCatalogMetricScaleModePatch,
    buildCatalogMetricSelectionPatch,
    buildCatalogMetricUseDetectedLabelPatch,
} from "./CatalogMetricWidgetSettings";
import { WidgetSettingsTab } from "./WidgetSettingsTab";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import type { ResolvedCatalogMetricTarget } from "../../settings/resolved-settings";
import type { PropertyInspectorPlatform } from "../inspector/platform";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
    NODE_SYSTEM_SOURCE_ID,
    WINDOWS_HELPER_SOURCE_ID,
} from "../../runtime/sources/source-ids";

test("disk usage bar view settings render label controls without usage-mode controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "bar" },
            },
            disk: {
                kind: "usage",
            },
        }),
    });

    assert.match(markup, /Volume:/);
    assert.match(markup, /Custom Label:/);
    assert.match(markup, /Detected Label/);
    assert.doesNotMatch(markup, /Usage Display:/);
});

test("disk usage circle view settings render usage display controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "circle" },
            },
            disk: {
                kind: "usage",
            },
        }),
    });

    assert.match(markup, /Usage Display:/);
    assert.doesNotMatch(markup, /Custom Label:/);
    assertTextOrder(markup, "Disk Metric:", "View:");
    assertTextOrder(markup, "View:", "Theme:");
    assertTextOrder(markup, "Theme:", "Usage Display:");
});

test("disk usage settings preserve selected unavailable volume", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            disk: {
                kind: "usage",
                volumeId: "E:\\",
            },
        }),
    });

    assert.match(markup, /E: \(Unavailable\)/);
});

test("windows disk throughput settings show aggregate controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        isWindows: true,
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "bar" },
            },
            disk: {
                kind: "throughput",
            },
        }),
    });

    assert.match(markup, /Disk Metric:/);
    assert.match(markup, /Direction:/);
    assert.match(markup, /Volume:/);
    assert.match(markup, /Volume:<\/label>[\s\S]*data-disabled="true"[\s\S]*All disks/);
    assert.match(markup, /All disks/);
    assert.match(markup, /Showing aggregate disk read\/write/);
    assert.match(markup, /Read Max/);
    assert.match(markup, /Write Max/);
    assertTextOrder(markup, "Disk Metric:", "View:");
    assertTextOrder(markup, "View:", "Theme:");
    assertTextOrder(markup, "Theme:", "Scale:");
});

test("network dual-channel settings render channel colors instead of usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Color - Upload/);
    assert.match(markup, /Color - Download/);
    assertTextOrder(markup, "Color - Upload", "Color - Download");
});

test("network black-white dual-channel settings hide channel colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { flat: { paint: { colorMode: "black-white" } } },
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Color Mode:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("network settings render from empty quick-start settings", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
    });

    assert.match(markup, /Network Metric/);
    assert.match(markup, /Network Interface/);
    assert.match(markup, /Color - Upload/);
    assert.match(markup, /Color - Download/);
    assertTextOrder(markup, "Color - Upload", "Color - Download");
});

test("network single-channel settings render standard usage colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            network: {
                direction: "download",
            },
        }),
    });

    assert.match(markup, /Solid Color:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("network ping settings render ping target and hide traffic controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            network: {
                kind: "ping",
                pingTargetHost: "8.8.8.8",
            },
        }),
    });

    assert.match(markup, /Network Metric:/);
    assert.match(markup, /Ping Target:/);
    assert.match(markup, /Solid Color:/);
    assert.match(markup, /Polling Frequency:/);
    assert.doesNotMatch(markup, /Direction:/);
    assert.doesNotMatch(markup, /Network Interface:/);
    assert.doesNotMatch(markup, /Scale:/);
    assert.doesNotMatch(markup, /Upload Max/);
    assert.doesNotMatch(markup, /Download Max/);
    assert.doesNotMatch(markup, /Traffic Mode:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("network traffic settings render traffic controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            network: {
                kind: "traffic",
                direction: "download",
            },
        }),
    });

    assert.match(markup, /Network Metric:/);
    assert.match(markup, /Direction:/);
    assert.match(markup, /Network Interface:/);
    assert.match(markup, /Scale:/);
    assert.match(markup, /Unit:/);
    assert.doesNotMatch(markup, /Ping Target:/);
});

test("color filled theme renders color mix without range controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: {
                    selectedTheme: "color-filled",
                    colorFilled: {
                        paint: { colorMode: "multi-color" },
                    },
                },
            },
            network: {
                direction: "download",
            },
        }),
    });

    assert.match(markup, /Color Filled/);
    assert.match(markup, /Color Mix/);
    assert.match(markup, /Left Color:/);
    assert.match(markup, /Right Color:/);
    assert.match(markup, /Bottom Color:/);
    assert.doesNotMatch(markup, /Low Ends At:/);
    assert.doesNotMatch(markup, /High Starts At:/);
});

test("terminal theme renders palette controls without metric color controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { selectedTheme: "terminal" },
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Terminal/);
    assert.match(markup, /Theme Variant:/);
    assert.match(markup, /Clean/);
    assert.match(markup, /custom-select-preview/);
    assert.match(markup, /Phosphor:/);
    assert.match(markup, /Green/);
    assert.doesNotMatch(markup, /Color Mode:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
});

test("pixel window theme hides ordinary metric color controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                theme: { selectedTheme: "pixel-window" },
            },
            network: {
                direction: "both",
            },
        }),
    });

    assert.match(markup, /Pixel Window/);
    assert.doesNotMatch(markup, /Theme Variant:/);
    assert.doesNotMatch(markup, /Color Mode:/);
    assert.doesNotMatch(markup, /Color - Download/);
    assert.doesNotMatch(markup, /Color - Upload/);
    assert.doesNotMatch(markup, /Phosphor:/);
});

test("network mirrored trend disables grid controls in the panel", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                view: { selectedView: "line" },
            },
            network: {
                direction: "both",
                trafficDisplayMode: "mirrored",
            },
        }),
    });

    assert.match(markup, /Traffic Mode:/);
    assert.match(markup, /Grid Line Visibility:/);
    assert.match(markup, /Grid Line Type:/);
    assert.match(markup, /Grid line settings are not supported/);
});

test("line trend settings keep adaptive grid visibility explanation in the option label", () => {
    const markup = renderWidgetSettings({
        actionKind: "network",
        settings: buildWidgetSettings("network", {
            appearance: {
                view: { selectedView: "line" },
                line: { gridLineVisibility: "adaptive" },
            },
            network: {
                direction: "download",
            },
        }),
    });

    assert.match(markup, /Adaptive to Activity/);
    assert.doesNotMatch(markup, /grid line visibility adapts to chart activity/);
});

test("disk throughput bar view settings render read/write colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "bar" },
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            disk: {
                kind: "throughput",
                throughputDirection: "both",
            },
        }),
    });

    assert.match(markup, sectionHeadingPattern("Read"));
    assert.match(markup, sectionHeadingPattern("Write"));
});

test("disk throughput dual-channel settings render read/write colors", () => {
    const markup = renderWidgetSettings({
        actionKind: "disk",
        settings: buildWidgetSettings("disk", {
            appearance: {
                view: { selectedView: "circle" },
                theme: { flat: { paint: { colorMode: "solid" } } },
            },
            disk: {
                kind: "throughput",
                throughputDirection: "both",
            },
        }),
    });

    assert.match(markup, sectionHeadingPattern("Read"));
    assert.match(markup, sectionHeadingPattern("Write"));
});

test("GPU settings panel renders from the GPU domain action", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
    });

    assert.match(markup, /GPU Metric:/);
    assert.match(markup, /Polling Frequency/);
});

test("windows CPU settings panel renders helper-owned metric options", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
    });

    assert.match(markup, /CPU Metric:/);
    assert.match(markup, /Usage/);
    assert.doesNotMatch(markup, /Source: Helper only/);
});

test("windows CPU temperature settings render helper-only source text and temperature scale", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
        settings: buildWidgetSettings("cpu", {
            cpu: {
                kind: "temperature",
                temperatureUnit: "fahrenheit",
                maximumTemperatureCelsius: 95,
            },
        }),
    });

    assert.match(markup, /Source: Helper only/);
    assert.match(markup, /Unit:/);
    assert.match(markup, /Max Temp \(C\):/);
    assert.doesNotMatch(markup, /Max Power/);
    assert.doesNotMatch(markup, /Source:<\/label>/);
});

test("windows CPU helper-only settings guide missing helper install", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
        settings: buildWidgetSettings("cpu", {
            cpu: { kind: "temperature" },
        }),
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.temp",
                routing: {
                    preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                preferredSourceStatus: {
                    state: "unavailable",
                    reason: "helperNotInstalled",
                },
                outcome: undefined,
            },
        },
    });

    assert.match(markup, /Source: Helper only/);
    assert.match(markup, /Install ShoMetrics Helper to use this metric/);
});

test("windows CPU helper-only settings guide stopped helper recovery", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
        settings: buildWidgetSettings("cpu", {
            cpu: { kind: "power" },
        }),
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.power",
                routing: {
                    preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                preferredSourceStatus: {
                    state: "unavailable",
                    reason: "helperStopped",
                },
                outcome: undefined,
            },
        },
    });

    assert.match(markup, /Source: Helper only/);
    assert.match(markup, /Start ShoMetrics Helper from ShoMetrics Control Panel/);
});

test("windows CPU helper-only settings fall back to helper diagnostics guidance", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
        settings: buildWidgetSettings("cpu", {
            cpu: { kind: "temperature" },
        }),
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.temp",
                routing: {
                    preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                preferredSourceStatus: {
                    state: "unavailable",
                    reason: "sourceError",
                },
                outcome: undefined,
            },
        },
    });

    assert.match(markup, /Open ShoMetrics Control Panel for helper diagnostics/);
});

test("windows CPU power settings render helper-only source text and power scale", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: true,
        settings: buildWidgetSettings("cpu", {
            cpu: {
                kind: "power",
                maximumPowerWatts: 180,
            },
        }),
    });

    assert.match(markup, /Source: Helper only/);
    assert.match(markup, /Max Power \(W\):/);
    assert.doesNotMatch(markup, /Max Temp/);
});

test("non-windows CPU settings hide helper-owned metric options", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: false,
    });

    assert.match(markup, /CPU Metric:/);
    assert.match(markup, /Usage/);
    assert.doesNotMatch(markup, /Temperature/);
    assert.doesNotMatch(markup, /Power/);
    assert.doesNotMatch(markup, /Source: Helper only/);
});

test("non-windows CPU settings preserve unsupported current metric selection", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        isWindows: false,
        settings: buildWidgetSettings("cpu", {
            cpu: { kind: "temperature" },
        }),
    });

    assert.match(markup, /CPU Metric:/);
    assert.match(markup, /Current CPU metric is not supported on this platform/);
    assert.match(markup, /Temperature \(not supported\)/);
    assert.doesNotMatch(markup, /Max Temp/);
    assert.doesNotMatch(markup, /Source: Helper only/);
    assert.doesNotMatch(markup, /Install ShoMetrics Helper/);
});

test("windows GPU settings panel renders source preference controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
    });

    assert.match(markup, /Source:/);
    assert.match(markup, /Auto \(Recommended\)/);
});

test("windows GPU settings panel reflects helper source preference", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
        settings: buildWidgetSettings("gpu", {
            source: {
                primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
                fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
                failureMode: "useFallback",
            },
        }),
    });

    assert.match(markup, /Source:/);
    assert.match(markup, /Prefer Helper/);
});

test("windows GPU settings panel guides no-value GPU diagnostics without changing key policy", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "gpu.usage_percent",
                routing: {
                    preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                outcome: undefined,
            },
        },
    });

    assert.match(markup, /No GPU value is available from the current source/);
    assert.match(markup, /Intel and AMD GPU metrics usually require ShoMetrics Helper/);
    assert.match(markup, /open ShoMetrics Control Panel for diagnostics/);
});

test("GPU settings panel hides no-value helper guidance after a value is available", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "gpu.usage_percent",
                routing: {
                    preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                    selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                },
                outcome: {
                    kind: "value",
                    valueTimestampMilliseconds: Date.now(),
                    freshness: "fresh",
                },
            },
        },
    });

    assert.doesNotMatch(markup, /No GPU value is available/);
    assert.doesNotMatch(markup, /Intel and AMD GPU metrics usually require/);
});

test("non-windows GPU settings panel hides source preference controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: false,
    });

    assert.match(markup, /GPU Metric:/);
    assert.match(markup, /Usage/);
    assert.doesNotMatch(markup, /Temperature/);
    assert.doesNotMatch(markup, /VRAM/);
    assert.doesNotMatch(markup, /Power/);
    assert.doesNotMatch(markup, /Source:/);
    assert.doesNotMatch(markup, /nvidia-smi/);
});

test("unknown non-windows platform keeps conservative metric options", () => {
    const cpuMarkup = renderWidgetSettings({
        actionKind: "cpu",
        platform: "other",
    });
    const gpuMarkup = renderWidgetSettings({
        actionKind: "gpu",
        platform: "other",
    });

    assert.match(cpuMarkup, /CPU Metric:/);
    assert.match(cpuMarkup, /Usage/);
    assert.doesNotMatch(cpuMarkup, /Temperature/);
    assert.doesNotMatch(cpuMarkup, /Power/);
    assert.match(gpuMarkup, /GPU Metric:/);
    assert.match(gpuMarkup, /Usage/);
    assert.doesNotMatch(gpuMarkup, /Temperature/);
    assert.doesNotMatch(gpuMarkup, /VRAM/);
    assert.doesNotMatch(gpuMarkup, /Power/);
});

test("non-windows GPU settings preserve unsupported current metric selection", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: false,
        settings: buildWidgetSettings("gpu", {
            gpu: { kind: "temperature" },
        }),
    });

    assert.match(markup, /GPU Metric:/);
    assert.match(markup, /Current GPU metric is not supported on this platform/);
    assert.match(markup, /Temperature \(not supported\)/);
    assert.doesNotMatch(markup, /Max Temp/);
    assert.doesNotMatch(markup, /Install ShoMetrics Helper/);
});

test("non-windows GPU settings panel does not show Windows helper guidance", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: false,
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "gpu.usage_percent",
                routing: {
                    preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                outcome: undefined,
            },
        },
    });

    assert.doesNotMatch(markup, /Intel and AMD GPU metrics usually require ShoMetrics Helper/);
    assert.doesNotMatch(markup, /ShoMetrics Control Panel for diagnostics/);
});

test("GPU source preference control preserves custom source selections", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isWindows: true,
        settings: buildWidgetSettings("gpu", {
            source: {
                primarySourceProfileId: "source-profile:gpu-lab",
                fallbackSourceProfileIds: [],
                failureMode: "showUnavailable",
            },
        }),
    });

    assert.match(markup, /Custom Source/);
});

test("catalog metric settings show catalog load state without descriptor inference", () => {
    const pendingMarkup = renderWidgetSettings({
        actionKind: "catalog",
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "pending",
        },
    });
    const failedMarkup = renderWidgetSettings({
        actionKind: "catalog",
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "failed",
        },
    });

    assert.match(pendingMarkup, /Loading metrics/);
    assert.match(failedMarkup, /Metrics unavailable/);
});

test("non-windows catalog metric settings show unsupported platform guidance", () => {
    const markup = renderWidgetSettings({
        actionKind: "catalog",
        isWindows: false,
        runtimeCache: {
            availableCatalogMetricDescriptors: [
                buildMetricDescriptor({
                    metricId: "lhm.sensor:/cpu/0/temperature/package",
                    sourceSensorId: "cpu-package-temp",
                    hardwareId: "cpu0",
                    hardwareName: "CPU",
                    hardwareType: "cpu",
                    sensorName: "CPU Package",
                    sourceSensorType: "temperature",
                }),
            ],
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "ready",
        },
    });

    assert.match(markup, /This sensor is not supported on this platform/);
    assert.doesNotMatch(markup, /Type:/);
    assert.doesNotMatch(markup, /View:/);
    assert.doesNotMatch(markup, /Polling Frequency:/);
    assert.doesNotMatch(markup, /Source: Helper only/);
});

test("catalog metric settings explain helper setup failures", () => {
    const missingHelperMarkup = renderWidgetSettings({
        actionKind: "catalog",
        runtimeCache: {
            catalogMetricDescriptorSourceStatus: {
                state: "unavailable",
                reason: "helperNotInstalled",
            },
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "failed",
        },
    });
    const stoppedHelperMarkup = renderWidgetSettings({
        actionKind: "catalog",
        runtimeCache: {
            catalogMetricDescriptorSourceStatus: {
                state: "unavailable",
                reason: "helperStopped",
            },
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "failed",
        },
    });

    assert.match(missingHelperMarkup, /Install ShoMetrics Helper to use advanced sensors/);
    assert.match(stoppedHelperMarkup, /Start ShoMetrics Helper from ShoMetrics Control Panel/);
});

test("catalog metric settings explain helper protocol mismatch", () => {
    const markup = renderWidgetSettings({
        actionKind: "catalog",
        runtimeCache: {
            catalogMetricDescriptorSourceStatus: {
                state: "unavailable",
                reason: "protocolMismatch",
            },
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "failed",
        },
    });

    assert.match(markup, /Update ShoMetrics Helper and Hub to the latest version/);
});

test("catalog metric settings render the initial guided picker without writing a default", () => {
    const markup = renderWidgetSettings({
        actionKind: "catalog",
        runtimeCache: {
            availableCatalogMetricDescriptors: [
                buildMetricDescriptor({
                    metricId: "lhm.sensor:/cpu/0/temperature/package",
                    sourceSensorId: "cpu-package-temp",
                    hardwareId: "cpu0",
                    hardwareName: "Intel Core",
                    hardwareType: "Cpu",
                    sensorName: "CPU Package",
                    sourceSensorType: "Temperature",
                    unit: MetricUnit.CELSIUS,
                }),
            ],
            catalogMetricDescriptorLoadState: "ready",
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "ready",
        },
    });

    assert.match(markup, /Type:/);
    assert.match(markup, /Choose type/);
    assert.match(markup, /Source: Helper only/);
    assert.doesNotMatch(markup, /Hardware:/);
    assert.doesNotMatch(markup, /Reading:/);
    assert.doesNotMatch(markup, /Metric:/);
});

test("catalog metric settings hide single-option levels and show ambiguous metric choices", () => {
    const markup = renderWidgetSettings({
        actionKind: "catalog",
        settings: buildWidgetSettings("catalog", {
            catalog: {
                metricId: "lhm.sensor:/cpu/0/temperature/package",
                detectedLabel: "CPU Package",
                detectedUnit: MetricUnit.CELSIUS,
            },
        }),
        runtimeCache: {
            availableCatalogMetricDescriptors: [
                buildMetricDescriptor({
                    metricId: "lhm.sensor:/cpu/0/temperature/package",
                    sourceSensorId: "cpu-package-temp",
                    hardwareId: "cpu0",
                    hardwareName: "Intel Core",
                    hardwareType: "Cpu",
                    sensorName: "CPU Package",
                    sourceSensorType: "Temperature",
                    unit: MetricUnit.CELSIUS,
                }),
                buildMetricDescriptor({
                    metricId: "lhm.sensor:/cpu/0/temperature/core1",
                    sourceSensorId: "cpu-core1-temp",
                    hardwareId: "cpu0",
                    hardwareName: "Intel Core",
                    hardwareType: "Cpu",
                    sensorName: "Core 1",
                    sourceSensorType: "Temperature",
                    unit: MetricUnit.CELSIUS,
                }),
            ],
            catalogMetricDescriptorLoadState: "ready",
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "ready",
        },
    });

    assert.match(markup, /Metric:/);
    assert.match(markup, /CPU Package/);
    assert.doesNotMatch(markup, /Type:/);
    assert.doesNotMatch(markup, /Hardware:/);
    assert.doesNotMatch(markup, /Reading:/);
});

test("catalog metric settings render label and scale controls after theme", () => {
    const markup = renderWidgetSettings({
        actionKind: "catalog",
        settings: buildWidgetSettings("catalog", {
            appearance: {
                view: { selectedView: "line" },
            },
            catalog: {
                metricId: "lhm.sensor:/gpu/0/power/board",
                detectedLabel: "GPU Board Power",
                detectedUnit: MetricUnit.WATTS,
                detectedCategory: "gpu",
                detectedReadingKind: "power",
                customLabel: "Board",
                customMaximumValue: 450,
            },
        }),
        runtimeCache: {
            availableCatalogMetricDescriptors: [
                buildMetricDescriptor({
                    metricId: "lhm.sensor:/gpu/0/power/board",
                    sourceSensorId: "gpu-board-power",
                    hardwareId: "gpu0",
                    hardwareName: "NVIDIA GPU",
                    hardwareType: "GpuNvidia",
                    sensorName: "GPU Board Power",
                    sourceSensorType: "Power",
                    unit: MetricUnit.WATTS,
                }),
            ],
            catalogMetricDescriptorLoadState: "ready",
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "ready",
        },
    });

    assert.match(markup, /class="section-title"[^>]*>Label &amp; Scale</);
    assert.match(markup, /Label:/);
    assert.match(markup, /placeholder="GPU Board Power"/);
    assert.match(markup, /value="Board"/);
    assert.match(markup, /Use Detected/);
    assert.match(markup, /Scale:/);
    assert.match(markup, /Custom/);
    assert.match(markup, /Max \(W\):/);
    assert.match(markup, /value="450"/);
    assert.match(markup, /Custom label and scale reset when you choose a different metric/);
    assertTextOrder(markup, "Theme:", "Label &amp; Scale");
    assertTextOrder(markup, "Label &amp; Scale", "Trend Line Smoothing");
});

test("catalog metric settings show readable custom maximum input units", () => {
    const bytesMarkup = renderWidgetSettings({
        actionKind: "catalog",
        settings: buildWidgetSettings("catalog", {
            catalog: {
                metricId: "memory.total",
                detectedLabel: "Total Memory",
                detectedUnit: MetricUnit.BYTES,
                detectedCategory: "memory",
                detectedReadingKind: "data",
                customMaximumValue: 64 * 1024 ** 3,
            },
        }),
    });
    const hertzMarkup = renderWidgetSettings({
        actionKind: "catalog",
        settings: buildWidgetSettings("catalog", {
            catalog: {
                metricId: "lhm.sensor:/cpu/0/clock/core1",
                detectedLabel: "Core Clock",
                detectedUnit: MetricUnit.HERTZ,
                detectedCategory: "cpu",
                detectedReadingKind: "clock",
                customMaximumValue: 6_000_000_000,
            },
        }),
    });

    assert.match(bytesMarkup, /Max \(GB\):/);
    assert.match(bytesMarkup, /value="64"/);
    assert.match(hertzMarkup, /Max \(GHz\):/);
    assert.match(hertzMarkup, /value="6"/);
});

test("catalog metric selection patch clears custom overrides only when metric changes", () => {
    const target = buildResolvedCatalogTarget({
        metricId: "lhm.sensor:/cpu/0/temperature/package",
        customLabel: "Package",
        customMaximumValue: 100,
    });
    const descriptors = [
        buildMetricDescriptor({
            metricId: "lhm.sensor:/cpu/0/temperature/package",
            sourceSensorId: "cpu-package-temp",
            hardwareId: "cpu0",
            hardwareName: "Intel Core",
            hardwareType: "Cpu",
            sensorName: "CPU Package",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
        buildMetricDescriptor({
            metricId: "lhm.sensor:/cpu/0/temperature/core1",
            sourceSensorId: "cpu-core1-temp",
            hardwareId: "cpu0",
            hardwareName: "Intel Core",
            hardwareType: "Cpu",
            sensorName: "Core 1",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
    ];

    const sameMetricPatch = buildCatalogMetricSelectionPatch(target, descriptors, {
        metricId: "lhm.sensor:/cpu/0/temperature/package",
    });
    const changedMetricPatch = buildCatalogMetricSelectionPatch(target, descriptors, {
        metricId: "lhm.sensor:/cpu/0/temperature/core1",
    });

    assert.equal(Object.hasOwn(sameMetricPatch?.catalog ?? {}, "customLabel"), false);
    assert.equal(Object.hasOwn(sameMetricPatch?.catalog ?? {}, "customMaximumValue"), false);
    assert.equal(Object.hasOwn(changedMetricPatch?.catalog ?? {}, "customLabel"), true);
    assert.equal(Object.hasOwn(changedMetricPatch?.catalog ?? {}, "customMaximumValue"), true);
});

test("catalog metric label and scale patches keep independent overrides", () => {
    const target = buildResolvedCatalogTarget({
        metricId: "lhm.sensor:/gpu/0/power/board",
        detectedUnit: MetricUnit.WATTS,
        detectedCategory: "gpu",
        detectedReadingKind: "power",
        customLabel: "Board",
    });

    assert.deepEqual(buildCatalogMetricCustomLabelPatch("  Board  "), {
        catalog: { customLabel: "  Board  " },
    });
    assert.deepEqual(buildCatalogMetricCustomLabelPatch("   "), {
        catalog: { customLabel: undefined },
    });
    assert.deepEqual(buildCatalogMetricUseDetectedLabelPatch(), {
        catalog: { customLabel: undefined },
    });
    assert.deepEqual(buildCatalogMetricScaleModePatch(target, "auto"), {
        catalog: { customMaximumValue: undefined },
    });
    assert.deepEqual(buildCatalogMetricScaleModePatch(target, "custom"), {
        catalog: { customMaximumValue: 450 },
    });
    assert.equal(Object.hasOwn(buildCatalogMetricUseDetectedLabelPatch().catalog ?? {}, "customMaximumValue"), false);
    assert.equal(Object.hasOwn(buildCatalogMetricScaleModePatch(target, "custom").catalog ?? {}, "customLabel"), false);
});

test("dense multi metric settings render rows and hide single metric view controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "denseMultiMetric",
        settings: buildDenseWidgetSettings([
            { slotId: "slot-1", slot: { metric: { cpu: {} } }, customLabel: "CPU" },
            { slotId: "slot-2", slot: { metric: { gpu: {} } }, customLabel: "GPU" },
        ]),
    });

    assert.match(markup, /Metric 1:/);
    assert.match(markup, /Metric 2:/);
    assert.match(markup, /CPU Metric:/);
    assert.match(markup, /GPU Metric:/);
    assert.match(markup, /value="CPU"/);
    assert.match(markup, /value="GPU"/);
    assert.match(markup, /Add Metric/);
    assert.match(markup, /Reorder:/);
    assert.match(markup, /Show move buttons/);
    assert.match(markup, /Theme:/);
    assert.match(markup, /Color Mode:/);
    assert.match(markup, /Polling Frequency:/);
    assert.doesNotMatch(markup, /Move Up/);
    assert.doesNotMatch(markup, /Move Down/);
    assert.doesNotMatch(markup, /View:/);
    assert.doesNotMatch(markup, /Trend Line Smoothing/);
});

test("dense multi metric settings enforce row count controls", () => {
    const minMarkup = renderWidgetSettings({
        actionKind: "denseMultiMetric",
        settings: buildDenseWidgetSettings([
            { slotId: "slot-1", slot: { metric: { cpu: {} } } },
            { slotId: "slot-2", slot: { metric: { gpu: {} } } },
        ]),
    });
    const maxMarkup = renderWidgetSettings({
        actionKind: "denseMultiMetric",
        settings: buildDenseWidgetSettings([
            { slotId: "slot-1", slot: { metric: { cpu: {} } } },
            { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            { slotId: "slot-3", slot: { metric: { memory: {} } } },
            { slotId: "slot-4", slot: { metric: { disk: {} } } },
            { slotId: "slot-5", slot: { metric: { network: { traffic: { direction: "download" } } } } },
            { slotId: "slot-6", slot: { metric: { network: { traffic: { direction: "upload" } } } } },
        ]),
    });

    assert.match(minMarkup, /disabled=""[\s\S]*Remove/);
    assert.match(maxMarkup, /disabled=""[\s\S]*Add Metric/);
});

test("dense multi metric disk usage row renders disk volume picker", () => {
    const markup = renderWidgetSettings({
        actionKind: "denseMultiMetric",
        settings: buildDenseWidgetSettings([
            { slotId: "slot-1", slot: { metric: { disk: { volumeId: "E:\\" } } } },
            { slotId: "slot-2", slot: { metric: { gpu: {} } } },
        ]),
        runtimeCache: {
            availableDiskVolumes: [
                {
                    id: "E:\\",
                    fs: "NTFS",
                    mount: "E:\\",
                    sizeBytes: 500 * 1024 * 1024 * 1024,
                    usedBytes: 250 * 1024 * 1024 * 1024,
                    availableBytes: 250 * 1024 * 1024 * 1024,
                    storageKind: "ssd",
                    diskName: "Game Disk",
                    volumeLabel: "Games",
                },
            ],
        },
        runtimeCacheStatus: {
            diskVolumeOptionsStatus: "ready",
        },
    });

    assert.match(markup, /Metric Detail:/);
    assert.match(markup, /Volume:/);
    assert.match(markup, /E: \(500 GB, Games\)/);
});

test("dense multi metric catalog row renders descriptor label and readable maximum unit", () => {
    const markup = renderWidgetSettings({
        actionKind: "denseMultiMetric",
        settings: buildDenseWidgetSettings([
            {
                slotId: "slot-1",
                slot: {
                    metric: {
                        catalog: {
                            metricId: "lhm.sensor:/gpu/0/power/board",
                            detectedLabel: "GPU Board Power",
                            detectedUnit: MetricUnit.WATTS,
                            detectedCategory: "gpu",
                            detectedReadingKind: "power",
                        },
                    },
                },
                customMaximumValue: 450,
            },
            { slotId: "slot-2", slot: { metric: { memory: {} } } },
        ]),
        runtimeCache: {
            availableCatalogMetricDescriptors: [
                buildMetricDescriptor({
                    metricId: "lhm.sensor:/gpu/0/power/board",
                    sourceSensorId: "gpu-board-power",
                    hardwareId: "gpu0",
                    hardwareName: "NVIDIA GPU",
                    hardwareType: "GpuNvidia",
                    sensorName: "GPU Board Power",
                    sourceSensorType: "Power",
                    unit: MetricUnit.WATTS,
                }),
            ],
            catalogMetricDescriptorLoadState: "ready",
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "ready",
        },
    });

    assert.match(markup, new RegExp(["Advanced", "Sensor"].join(" ")));
    assert.match(markup, /placeholder="GPU Board Power"/);
    assert.match(markup, /Max \(W\):/);
    assert.match(markup, /value="450"/);
});

test("stacked metric settings render stack, rotation, selected slot editor, and one polling control", () => {
    const markup = renderWidgetSettings({
        actionKind: "stackedMetric",
        settings: buildStackedWidgetSettings(),
    });

    assert.match(markup, sectionTitlePattern("Stack"));
    assert.match(markup, sectionTitlePattern("Rotation"));
    assert.match(markup, sectionTitlePattern("Selected Slot"));
    assert.match(markup, /Slot 1:/);
    assert.match(markup, /Slot 2:/);
    assert.match(markup, /CPU Metric:/);
    assert.match(markup, /Auto Rotate:/);
    assert.match(markup, /Interval \(s\):/);
    assert.match(markup, /Add Slot/);
    assert.match(markup, /Reorder:/);
    assert.match(markup, /Show move buttons/);
    assert.doesNotMatch(markup, /Move Up/);
    assert.doesNotMatch(markup, /Move Down/);
    assert.equal(countTextOccurrences(markup, "Polling Frequency:"), 1);
});

test("stacked metric settings enforce slot count controls", () => {
    const minMarkup = renderWidgetSettings({
        actionKind: "stackedMetric",
        settings: buildStackedWidgetSettings(),
    });
    const maxMarkup = renderWidgetSettings({
        actionKind: "stackedMetric",
        settings: buildStackedWidgetSettings({
            stacked: { addSlot: {} },
        }),
    });

    assert.match(minMarkup, /disabled=""[\s\S]*Remove/);
    assert.match(maxMarkup, /disabled=""[\s\S]*Add Slot/);
});

test("stacked metric selected slot editor reuses catalog picker runtime cache", () => {
    const markup = renderWidgetSettings({
        actionKind: "stackedMetric",
        settings: buildStackedWidgetSettings({
            stacked: {
                updateSlot: {
                    slotId: "slot-1",
                    metricDomain: "catalog",
                    singleMetric: {
                        catalog: {
                            metricId: "lhm.sensor:/gpu/0/power/board",
                            detectedLabel: "GPU Board Power",
                            detectedUnit: MetricUnit.WATTS,
                            detectedCategory: "gpu",
                            detectedReadingKind: "power",
                        },
                    },
                },
            },
        }),
        runtimeCache: {
            availableCatalogMetricDescriptors: [
                buildMetricDescriptor({
                    metricId: "lhm.sensor:/gpu/0/power/board",
                    sourceSensorId: "gpu-board-power",
                    hardwareId: "gpu0",
                    hardwareName: "NVIDIA GPU",
                    hardwareType: "GpuNvidia",
                    sensorName: "GPU Board Power",
                    sourceSensorType: "Power",
                    unit: MetricUnit.WATTS,
                }),
            ],
            catalogMetricDescriptorLoadState: "ready",
        },
        runtimeCacheStatus: {
            catalogMetricDescriptorStatus: "ready",
        },
    });

    assert.match(markup, new RegExp(["Advanced", "Sensor"].join(" ")));
    assert.match(markup, /GPU Board Power/);
    assert.match(markup, /Label &amp; Scale/);
    assert.equal(countTextOccurrences(markup, "Polling Frequency:"), 1);
});

test("widget advanced controls render current metric source attribution", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.usage_percent",
                routing: {
                    preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                    selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                },
                outcome: {
                    kind: "value",
                    valueTimestampMilliseconds: Date.now(),
                    freshness: "fresh",
                },
            },
        },
    });

    assert.match(markup, /Current source: Built-in/);
    assert.match(markup, /Preferred source: Built-in/);
    assert.match(markup, /Last value age:/);
});

test("widget advanced controls report fallback source attribution", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "gpu.temp",
                routing: {
                    preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                    selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                },
                outcome: {
                    kind: "value",
                    valueTimestampMilliseconds: Date.now(),
                    freshness: "fresh",
                },
            },
        },
    });

    assert.match(markup, /Current source: Built-in GPU/);
    assert.match(markup, /Preferred source: Helper/);
    assert.match(markup, /Using fallback; preferred source has no fresh data/);
});

test("widget advanced controls report helper source status", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.temp",
                routing: {
                    preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                preferredSourceStatus: {
                    state: "unavailable",
                    reason: "pipeMissing",
                },
                outcome: undefined,
            },
        },
    });

    assert.match(markup, /Current source: No fresh source/);
    assert.match(markup, /Preferred source: Helper/);
    assert.match(markup, /Helper status: Required/);
});

test("widget advanced controls tolerate old attribution payloads without routing", () => {
    const runtimeCache = {
        displayedMetricReadAttribution: {
            metricKey: "cpu.temp",
            outcome: undefined,
        },
    } as WidgetRuntimeCachePatch;

    const markup = renderWidgetSettings({
        actionKind: "cpu",
        runtimeCache,
    });

    assert.match(markup, /Current source: No fresh source/);
    assert.match(markup, /Last value age: none/);
});

test("widget advanced controls report sensor identity and metric state", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.temp",
                routing: {
                    preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                    selectedSourceId: WINDOWS_HELPER_SOURCE_ID,
                },
                outcome: {
                    kind: "value",
                    valueTimestampMilliseconds: Date.now(),
                    freshness: "retained",
                    retainedAgeMilliseconds: 1500,
                    rawSensorIdentity: {
                        sourceSensorId: "lhm.sensor:/intelcpu/0/temperature/26",
                        sensorName: "CPU Package",
                    },
                },
            },
        },
    });

    assert.match(markup, /Sensor: CPU Package \(lhm\.sensor:\/intelcpu\/0\/temperature\/26\)/);
    assert.match(markup, /Metric: retained 1s/);
});

test("widget advanced controls report unavailable metric state", () => {
    const markup = renderWidgetSettings({
        actionKind: "cpu",
        runtimeCache: {
            displayedMetricReadAttribution: {
                metricKey: "cpu.temp",
                routing: {
                    preferredSourceId: WINDOWS_HELPER_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                outcome: {
                    kind: "unavailable",
                    reason: "invalidValue",
                    lastValueTimestampMilliseconds: undefined,
                    rawSensorIdentity: {
                        sensorName: "CPU Package",
                    },
                },
            },
        },
    });

    assert.match(markup, /Last value age: none/);
    assert.match(markup, /Sensor: CPU Package/);
    assert.match(markup, /Metric: invalid value/);
});

test("domain action does not render a mismatched stored target panel", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        settings: buildWidgetSettings("cpu", {}),
    });

    assert.match(markup, /Stored metric settings do not match this action/);
    assert.doesNotMatch(markup, /GPU Metric:/);
});

test("widget settings waits for action kind before rendering recovery UI", () => {
    const markup = renderWidgetSettings({
        actionKind: "unknown",
    });

    assert.equal(markup, "");
});

test("widget settings renders widget controls before global settings load", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: false,
        isGlobalThemeOverrideEnabled: false,
        isGlobalPaintOverrideEnabled: false,
    });

    assert.match(markup, /GPU Metric:/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings renders mismatch recovery before global settings load", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: false,
        isGlobalThemeOverrideEnabled: false,
        isGlobalPaintOverrideEnabled: false,
        settings: buildWidgetSettings("cpu", {}),
    });

    assert.match(markup, /Stored metric settings do not match this action/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings renders normally after global settings load without override", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: false,
        isGlobalThemeOverrideEnabled: false,
        isGlobalPaintOverrideEnabled: false,
    });

    assert.match(markup, /GPU Metric:/);
    assert.doesNotMatch(markup, /Some settings are disabled/);
});

test("widget settings keep warnings first and reset in advanced controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        isGlobalViewOverrideEnabled: true,
    });

    assertTextOrder(markup, "Some settings are disabled", "GPU Metric:");
    assertTextOrder(markup, "GPU Metric:", "View:");
    assertTextOrder(markup, "Polling Frequency", "Advanced");
    assertTextOrder(markup, "Advanced", "Color Compensation");
    assertTextOrder(markup, "Color Compensation", "Reset Widget Settings");
    assertTextOrder(markup, "Advanced", "Reset Widget Settings");
    assertTextOrder(markup, "Reset Widget Settings", "DEBUG");
    assertTextOrder(markup, "DEBUG", "Show debug");
});

test("widget view controls keep view before theme order", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        settings: buildWidgetSettings("gpu", {
            appearance: {
                view: { selectedView: "circle" },
                theme: { selectedTheme: "terminal" },
            },
        }),
    });

    assertTextOrder(markup, "View:", "View Variant:");
    assertTextOrder(markup, "View Variant:", "Theme:");
    assertTextOrder(markup, "Theme:", "Theme Variant:");
    assert.match(markup, sectionTitlePattern("View"));
    assert.match(markup, sectionTitlePattern("Theme"));
    assert.doesNotMatch(markup, sectionTitlePattern("Appearance"));
    assert.match(markup, /Theme Variant:/);
});

test("widget text view renders text variant controls", () => {
    const markup = renderWidgetSettings({
        actionKind: "gpu",
        settings: buildWidgetSettings("gpu", {
            appearance: {
                view: { selectedView: "text" },
            },
        }),
    });

    assertTextOrder(markup, "View:", "View Variant:");
    assertTextOrder(markup, "View Variant:", "Theme:");
    assert.match(markup, /Centered/);
    assert.doesNotMatch(markup, /Full Ring/);
    assert.match(markup, /custom-select-preview/);
});

function renderWidgetSettings(options: {
    actionKind: ActionKind;
    platform?: PropertyInspectorPlatform;
    isWindows?: boolean;
    isGlobalViewOverrideEnabled?: boolean;
    isGlobalThemeOverrideEnabled?: boolean;
    isGlobalTransparentSurfaceOverrideEnabled?: boolean;
    isGlobalPaintOverrideEnabled?: boolean;
    settings?: InspectorTestSettings;
    runtimeCache?: WidgetRuntimeCachePatch;
    runtimeCacheStatus?: Partial<PropertyInspectorRuntimeCacheStatus>;
}): string {
    return renderToStaticMarkup(createElement(WidgetSettingsTab, {
        context: buildVisibilityContext({
            actionKind: options.actionKind,
            platform: options.platform,
            isWindows: options.isWindows ?? (options.platform === undefined || options.platform === "win32"),
            settings: options.settings,
            runtimeCache: options.runtimeCache,
            runtimeCacheStatus: options.runtimeCacheStatus,
        }),
        isGlobalViewOverrideEnabled: options.isGlobalViewOverrideEnabled ?? false,
        isGlobalThemeOverrideEnabled: options.isGlobalThemeOverrideEnabled ?? false,
        isGlobalTransparentSurfaceOverrideEnabled: options.isGlobalTransparentSurfaceOverrideEnabled ?? false,
        isGlobalPaintOverrideEnabled: options.isGlobalPaintOverrideEnabled ?? false,
        colorCompensationProfile: DEFAULT_COLOR_COMPENSATION_PROFILE,
        onSettingsPatch: () => undefined,
        onResetWidgetSettings: () => undefined,
        onOpenColorCompensation: () => undefined,
    }));
}

function assertTextOrder(markup: string, earlierText: string, laterText: string): void {
    const earlierIndex = markup.indexOf(earlierText);
    const laterIndex = markup.indexOf(laterText);

    assert.notEqual(earlierIndex, -1, earlierText);
    assert.notEqual(laterIndex, -1, laterText);
    assert.equal(earlierIndex < laterIndex, true, `${earlierText} should appear before ${laterText}`);
}

function sectionHeadingPattern(text: string): RegExp {
    return new RegExp(`class="section-heading"[^>]*>${text}<`);
}

function buildMetricDescriptor(overrides: MetricDescriptorFixture): MetricDescriptor {
    return {
        metricId: overrides.metricId,
        valueKind: overrides.valueKind ?? MetricValueKind.SCALAR,
        unit: overrides.unit ?? MetricUnit.UNSPECIFIED,
        metricIdKind: overrides.metricIdKind ?? MetricIdKind.SOURCE_SENSOR,
        pollingGroupId: overrides.pollingGroupId ?? "polling-group",
        rawSensorIdentity: {
            sourceSensorId: overrides.sourceSensorId,
            hardwareId: overrides.hardwareId,
            hardwareName: overrides.hardwareName,
            hardwareType: overrides.hardwareType,
            sensorName: overrides.sensorName,
            sourceSensorType: overrides.sourceSensorType,
        },
    };
}

function buildResolvedCatalogTarget(
    overrides: Partial<ResolvedCatalogMetricTarget>,
): ResolvedCatalogMetricTarget {
    return {
        domain: "catalog",
        metricId: "",
        detectedLabel: undefined,
        detectedUnit: MetricUnit.UNSPECIFIED,
        detectedCategory: "unspecified",
        detectedReadingKind: "unspecified",
        customLabel: undefined,
        customMaximumValue: undefined,
        ...overrides,
    };
}

interface MetricDescriptorFixture {
    readonly metricId: string;
    readonly valueKind?: MetricValueKind;
    readonly unit?: MetricUnit;
    readonly metricIdKind?: MetricIdKind;
    readonly pollingGroupId?: string;
    readonly sourceSensorId: string;
    readonly hardwareId: string;
    readonly hardwareName: string;
    readonly hardwareType: string;
    readonly sensorName: string;
    readonly sourceSensorType: string;
}

function sectionTitlePattern(text: string): RegExp {
    return new RegExp(`class="section-title"[^>]*>${text}<`);
}

function countTextOccurrences(value: string, text: string): number {
    return value.split(text).length - 1;
}

function buildWidgetSettings(
    actionKind: ActionKind,
    patch: StoredWidgetSettingsPatch,
): InspectorTestSettings {
    return writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, actionKind).rawSettings,
        patch,
    );
}

function buildDenseWidgetSettings(slots: readonly unknown[]): InspectorTestSettings {
    return {
        denseMultiMetric: {
            slots,
        },
    };
}

function buildStackedWidgetSettings(patch?: StoredWidgetSettingsPatch): InspectorTestSettings {
    const slotIds = ["slot-1", "slot-2", "slot-3"];
    const createSlotId = (): string => slotIds.shift() ?? "unexpected-slot";
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
        createSlotId,
    }).rawSettings;

    return patch === undefined
        ? quickStartSettings
        : writeStoredWidgetSettingsPatch(quickStartSettings, patch, { createSlotId });
}
