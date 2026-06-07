import assert from "node:assert/strict";
import test from "node:test";
import {
    CatalogMetricCategory as StoredCatalogMetricCategory,
    CatalogMetricReadingKind as StoredCatalogMetricReadingKind,
    ColorMode as StoredColorMode,
    CpuMetricTarget_Kind as StoredCpuMetricKind,
    DiskMetricTarget_Kind as StoredDiskMetricKind,
    GpuMetricTarget_Kind as StoredGpuMetricKind,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    NetworkMetricTarget_Kind as StoredNetworkMetricKind,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TemperatureUnit as StoredTemperatureUnit,
    TextViewVariant as StoredTextViewVariant,
    type MetricSlot as StoredMetricSlot,
    type StackedMetricWidget as StoredStackedMetricWidget,
} from "../../generated/shometrics/v1/settings_pb";
import { MetricUnit } from "../../runtime/sources/metric-source";
import { readStoredWidgetSettings } from "./codec";
import { resolveQuickStartStoredWidgetSettings } from "./quick-start-widget-settings";
import { resolveStoredWidgetSettings } from "./resolver";
import { writeStoredWidgetSettingsPatch } from "./widget-settings-patch";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
} from "../../runtime/sources/source-ids";

test("widget patch fails before quick-start metric initialization", () => {
    assert.throws(
        () => writeStoredWidgetSettingsPatch(undefined, {
            network: {
                direction: "download",
            },
        }),
        /quick-start widget initialization/,
    );
});

test("widget patch fails when the patch domain does not match the current metric", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    assert.throws(
        () => writeStoredWidgetSettingsPatch(cpuSettings, {
            network: {
                direction: "download",
            },
        }),
        /non-network metric/,
    );
});

test("widget patch fails when a catalog patch targets a non-catalog metric", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    assert.throws(
        () => writeStoredWidgetSettingsPatch(cpuSettings, {
            catalog: {
                metricId: "source.sensor:/gpu/temperature",
            },
        }),
        /non-catalog metric/,
    );
});

test("widget patch updates catalog metric target", () => {
    const catalogSettings = resolveQuickStartStoredWidgetSettings(undefined, "catalog").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(catalogSettings, {
        catalog: {
            metricId: "source.sensor:/gpu/temperature",
            detectedLabel: "GPU Hot Spot",
            detectedUnit: MetricUnit.CELSIUS,
            detectedCategory: "gpu",
            detectedReadingKind: "temperature",
            customLabel: "Hot",
            customMaximumValue: 120,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "catalog");
    if (target?.case === "catalog") {
        assert.equal(target.value.metricId, "source.sensor:/gpu/temperature");
        assert.equal(target.value.detectedLabel, "GPU Hot Spot");
        assert.equal(target.value.detectedUnit, MetricUnit.CELSIUS);
        assert.equal(target.value.detectedCategory, StoredCatalogMetricCategory.GPU);
        assert.equal(target.value.detectedReadingKind, StoredCatalogMetricReadingKind.TEMPERATURE);
        assert.equal(target.value.customLabel, "Hot");
        assert.equal(target.value.customMaximumValue, 120);
    }
});

test("widget patch can clear catalog display hints and overrides", () => {
    const catalogSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "catalog").rawSettings,
        {
            catalog: {
                metricId: "source.sensor:/gpu/temperature",
                detectedLabel: "GPU Hot Spot",
                detectedUnit: MetricUnit.CELSIUS,
                detectedCategory: "gpu",
                detectedReadingKind: "temperature",
                customLabel: "Hot",
                customMaximumValue: 120,
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(catalogSettings, {
        catalog: {
            detectedLabel: undefined,
            detectedUnit: undefined,
            detectedCategory: undefined,
            detectedReadingKind: undefined,
            customLabel: undefined,
            customMaximumValue: undefined,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "catalog");
    if (target?.case === "catalog") {
        assert.equal(target.value.metricId, "source.sensor:/gpu/temperature");
        assert.equal(target.value.detectedLabel, undefined);
        assert.equal(target.value.detectedUnit, undefined);
        assert.equal(target.value.detectedCategory, undefined);
        assert.equal(target.value.detectedReadingKind, undefined);
        assert.equal(target.value.customLabel, undefined);
        assert.equal(target.value.customMaximumValue, undefined);
    }
});

test("widget patch updates GPU reading within the GPU action domain", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        gpu: {
            kind: "power",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "gpu");
    if (target?.case === "gpu") {
        assert.equal(target.value.kind, StoredGpuMetricKind.POWER);
    }
});

test("widget patch writes black-white color mode", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                flat: {
                    paint: {
                        colorMode: "black-white",
                    },
                },
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.flat?.paint?.colorMode, StoredColorMode.BLACK_WHITE);
});

test("widget patch switches network traffic to ping and writes target host", () => {
    const networkSettings = resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(networkSettings, {
        network: {
            kind: "ping",
            pingTargetHost: "https://Example.COM/path?q=1",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "network");
    if (target?.case === "network") {
        assert.equal(target.value.kind, StoredNetworkMetricKind.PING);
        assert.equal(target.value.ping?.targetHost, "example.com");
        assert.equal(target.value.traffic, undefined);
    }
});

test("widget patch switches network ping to traffic and writes traffic settings", () => {
    const pingSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            network: {
                kind: "ping",
                pingTargetHost: "example.com",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(pingSettings, {
        network: {
            kind: "traffic",
            direction: "download",
            interfaceId: "Ethernet",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "network");
    if (target?.case === "network") {
        assert.equal(target.value.kind, StoredNetworkMetricKind.TRAFFIC);
        assert.equal(target.value.traffic?.direction, StoredNetworkDirection.DOWNLOAD);
        assert.equal(target.value.traffic?.interfaceId, "Ethernet");
        assert.equal(target.value.ping, undefined);
    }
});

test("widget patch keeps network display overrides traffic-only", () => {
    const networkSettings = resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings;

    const pingSettings = writeStoredWidgetSettingsPatch(networkSettings, {
        network: {
            kind: "ping",
            pingTargetHost: "example.com",
        },
    });
    const trafficSettings = writeStoredWidgetSettingsPatch(networkSettings, {
        network: {
            unitBase: "bit",
        },
    });

    const pingOverrides = readSingleMetricSlot(pingSettings)?.overrides;
    const trafficOverrides = readSingleMetricSlot(trafficSettings)?.overrides;

    assert.equal(pingOverrides?.network, undefined);
    assert.equal(trafficOverrides?.network?.unitBase, StoredNetworkUnitBase.BIT);
});

test("widget patch does not write traffic display overrides while stored network target is ping", () => {
    const pingSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            network: {
                kind: "ping",
                pingTargetHost: "example.com",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(pingSettings, {
        network: {
            unitBase: "bit",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "network");
    if (target?.case === "network") {
        assert.equal(target.value.kind, StoredNetworkMetricKind.PING);
        assert.equal(target.value.ping?.targetHost, "example.com");
    }
    assert.equal(readSingleMetricSlot(nextSettings)?.overrides?.network, undefined);
});

test("widget patch updates CPU reading within the CPU action domain", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        cpu: {
            kind: "temperature",
            temperatureUnit: "fahrenheit",
            maximumTemperatureCelsius: 95,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "cpu");
    if (target?.case === "cpu") {
        assert.equal(target.value.kind, StoredCpuMetricKind.TEMPERATURE);
        assert.equal(target.value.temperatureUnit, StoredTemperatureUnit.FAHRENHEIT);
        assert.equal(target.value.maximumTemperatureCelsius, 95);
    }
});

test("widget patch writes sparse CPU target changes without resolved defaults", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        cpu: {
            kind: "temperature",
        },
    });

    assert.deepEqual(nextSettings, {
        singleMetric: {
            slot: {
                metric: {
                    cpu: {
                        kind: "KIND_TEMPERATURE",
                    },
                },
            },
        },
    });
});

test("widget patch preserves disk volume id when switching to throughput", () => {
    const diskSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            disk: {
                volumeId: "E:\\",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(diskSettings, {
        disk: {
            kind: "throughput",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "disk");
    if (target?.case === "disk") {
        assert.equal(target.value.kind, StoredDiskMetricKind.THROUGHPUT);
        assert.equal(target.value.volumeId, "E:\\");
    }
});

test("widget patch writes optional CPU power maximum", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        cpu: {
            kind: "power",
            maximumPowerWatts: 180,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "cpu");
    if (target?.case === "cpu") {
        assert.equal(target.value.kind, StoredCpuMetricKind.POWER);
        assert.equal(target.value.maximumPowerWatts, 180);
    }
});

test("widget patch replaces metric source policy with helper preference and fallback", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
            fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        },
    });

    const sourcePolicy = readSingleMetricSlot(nextSettings)?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID]);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch replaces metric source policy with node preference and fallback", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
            fallbackSourceProfileIds: [BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        },
    });

    const sourcePolicy = readSingleMetricSlot(nextSettings)?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, [BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID]);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch clears source policy fallback state when returning to auto", () => {
    const gpuSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings,
        {
            source: {
                primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
                fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
                failureMode: "useFallback",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: undefined,
            fallbackSourceProfileIds: [],
            failureMode: "showUnavailable",
        },
    });

    const sourcePolicy = readSingleMetricSlot(nextSettings)?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, undefined);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, []);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.SHOW_UNAVAILABLE);
});

test("widget patch writes terminal theme", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.selectedTheme, StoredMetricTheme.TERMINAL);
});

test("widget patch writes pixel window theme", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "pixel-window",
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.selectedTheme, StoredMetricTheme.PIXEL_WINDOW);
});

test("widget patch writes text view variant", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            view: {
                selectedView: "text",
                textVariant: "title-card",
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.view?.textVariant, StoredTextViewVariant.TITLE_CARD);
});

test("widget patch writes terminal variant", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
                terminal: {
                    variant: "vintage",
                },
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.terminal?.variant, StoredTerminalThemeVariant.VINTAGE);
});

test("widget patch writes terminal palette", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
                terminal: {
                    paint: {
                        preset: "amber",
                    },
                },
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.terminal?.paint?.preset, StoredTerminalPalettePreset.AMBER);
});

test("widget patch writes transparent surface settings for every theme", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                flat: {
                    transparentSurface: {
                        enabled: true,
                        backgroundOpacityPercent: 10,
                        textOutlinePercent: 20,
                        shapeOutlinePercent: 30,
                    },
                },
                cupertinoGlass: {
                    transparentSurface: {
                        enabled: true,
                        backgroundOpacityPercent: 40,
                        textOutlinePercent: 50,
                        shapeOutlinePercent: 60,
                    },
                },
                colorFilled: {
                    transparentSurface: {
                        enabled: true,
                        backgroundOpacityPercent: 70,
                        textOutlinePercent: 80,
                        shapeOutlinePercent: 90,
                    },
                },
                terminal: {
                    transparentSurface: {
                        enabled: true,
                        backgroundOpacityPercent: 15,
                        textOutlinePercent: 25,
                        shapeOutlinePercent: 35,
                    },
                },
                pixelWindow: {
                    transparentSurface: {
                        enabled: true,
                        backgroundOpacityPercent: 45,
                        textOutlinePercent: 55,
                        shapeOutlinePercent: 65,
                    },
                },
            },
        },
    });

    const theme = readSingleMetricSlot(nextSettings)?.overrides?.appearance?.theme;

    assert.equal(theme?.flat?.transparentSurface?.enabled, true);
    assert.equal(theme?.flat?.transparentSurface?.backgroundOpacityPercent, 10);
    assert.equal(theme?.flat?.transparentSurface?.textOutlinePercent, 20);
    assert.equal(theme?.flat?.transparentSurface?.shapeOutlinePercent, 30);
    assert.equal(theme?.cupertinoGlass?.transparentSurface?.enabled, true);
    assert.equal(theme?.cupertinoGlass?.transparentSurface?.backgroundOpacityPercent, 40);
    assert.equal(theme?.cupertinoGlass?.transparentSurface?.textOutlinePercent, 50);
    assert.equal(theme?.cupertinoGlass?.transparentSurface?.shapeOutlinePercent, 60);
    assert.equal(theme?.colorFilled?.transparentSurface?.enabled, true);
    assert.equal(theme?.colorFilled?.transparentSurface?.backgroundOpacityPercent, 70);
    assert.equal(theme?.colorFilled?.transparentSurface?.textOutlinePercent, 80);
    assert.equal(theme?.colorFilled?.transparentSurface?.shapeOutlinePercent, 90);
    assert.equal(theme?.terminal?.transparentSurface?.enabled, true);
    assert.equal(theme?.terminal?.transparentSurface?.backgroundOpacityPercent, 15);
    assert.equal(theme?.terminal?.transparentSurface?.textOutlinePercent, 25);
    assert.equal(theme?.terminal?.transparentSurface?.shapeOutlinePercent, 35);
    assert.equal(theme?.pixelWindow?.transparentSurface?.enabled, true);
    assert.equal(theme?.pixelWindow?.transparentSurface?.backgroundOpacityPercent, 45);
    assert.equal(theme?.pixelWindow?.transparentSurface?.textOutlinePercent, 55);
    assert.equal(theme?.pixelWindow?.transparentSurface?.shapeOutlinePercent, 65);
});

test("widget patch adds dense metric slots with storage-owned ids", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            addSlot: {
                customLabel: "RAM",
                customMaximumValue: 100,
            },
        },
    }, {
        createSlotId: () => "slot-3",
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots.length, 3);
    assert.equal(widget.value.slots[2]?.slotId, "slot-3");
    assert.equal(widget.value.slots[2]?.customLabel, "RAM");
    assert.equal(widget.value.slots[2]?.customMaximumValue, 100);
});

test("widget patch generates a unique dense metric slot id after a collision", () => {
    const generatedSlotIds = ["slot-1", "slot-2", "slot-3"];
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            addSlot: {},
        },
    }, {
        createSlotId: () => generatedSlotIds.shift() ?? "unexpected-slot",
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots[2]?.slotId, "slot-3");
});

test("widget patch updates dense metric slot label and maximum by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                customLabel: "GPU",
                customMaximumValue: 90,
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots[1]?.customLabel, "GPU");
    assert.equal(widget.value.slots[1]?.customMaximumValue, 90);
});

test("widget patch updates dense metric slot target by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: {
                    domain: "network",
                    kind: "traffic",
                    direction: "download",
                },
                customLabel: undefined,
                customMaximumValue: undefined,
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.equal(widget.value.slots[0]?.slot?.metric?.target.case, "cpu");
    assert.equal(widget.value.slots[1]?.slot?.metric?.target.case, "network");
    assert.equal(widget.value.slots[1]?.customLabel, undefined);
    assert.equal(widget.value.slots[1]?.customMaximumValue, undefined);
});

test("widget patch writes dense disk usage volume by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: {
                    domain: "disk",
                    kind: "usage",
                    volumeId: "E:\\",
                },
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    const target = widget.value.slots[1]?.slot?.metric?.target;
    assert.equal(target?.case, "disk");
    if (target?.case === "disk") {
        assert.equal(target.value.kind, StoredDiskMetricKind.USAGE);
        assert.equal(target.value.volumeId, "E:\\");
    }
});

test("widget patch moves dense metric slots by stable slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
                { slotId: "slot-3", slot: { metric: { memory: {} } } },
            ],
        },
    }, {
        dense: {
            moveSlot: {
                slotId: "slot-3",
                direction: "up",
            },
        },
    });
    const widget = readStoredWidgetSettings(nextSettings).settings.widget;

    assert.equal(widget.case, "denseMultiMetric");
    assert.deepEqual(widget.value.slots.map((slot) => slot.slotId), ["slot-1", "slot-3", "slot-2"]);
});

test("widget patch rejects removing dense metric slots below the minimum", () => {
    assert.throws(() => writeStoredWidgetSettingsPatch({
        denseMultiMetric: {
            slots: [
                { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                { slotId: "slot-2", slot: { metric: { gpu: {} } } },
            ],
        },
    }, {
        dense: {
            removeSlotId: "slot-2",
        },
    }), /minimum of 2/);
});

test("widget patch updates stacked metric rotation settings", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            rotation: {
                autoRotateEnabled: false,
                intervalSeconds: 5,
            },
        },
    });
    const widget = readStackedMetricWidget(nextSettings);

    assert.equal(widget.rotation?.autoRotateEnabled, false);
    assert.equal(widget.rotation?.intervalSeconds, 5);
});

test("widget patch rejects stacked metric rotation intervals outside the supported range", () => {
    assert.throws(() => writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            rotation: {
                intervalSeconds: 6,
            },
        },
    }), /1 to 5 seconds/);
});

test("widget patch adds stacked metric slots with storage-owned ids", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            addSlot: {},
        },
    }, {
        createSlotId: () => "slot-3",
    });
    const widget = readStackedMetricWidget(nextSettings);

    assert.equal(widget.slots.length, 3);
    assert.equal(widget.slots[2]?.slotId, "slot-3");
    assert.equal(widget.slots[2]?.item.case, "singleMetric");
    assert.equal(widget.slots[2]?.item.value.slot?.metric?.target.case, "cpu");
    assert.equal(widget.slots[2]?.item.value.slot?.metric?.target.value.kind, StoredCpuMetricKind.USAGE);

    const resolvedSettings = resolveStoredWidgetSettings({
        storedWidgetSettings: readStoredWidgetSettings(nextSettings).settings,
    });
    assert.equal(resolvedSettings.widget.widgetKind, "stackedMetric");
    assert.equal(resolvedSettings.widget.slots[2]?.widget.slot.metric.target.domain, "cpu");
});

test("widget patch moves stacked metric slots by stable slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
                { slotId: "slot-3", singleMetric: { slot: { metric: { network: {} } } } },
            ],
        },
    }, {
        stacked: {
            moveSlot: {
                slotId: "slot-3",
                direction: "up",
            },
        },
    });
    const widget = readStackedMetricWidget(nextSettings);

    assert.deepEqual(widget.slots.map((slot) => slot.slotId), ["slot-1", "slot-3", "slot-2"]);
});

test("widget patch updates a stacked single metric item by slot id", () => {
    const nextSettings = writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                singleMetric: {
                    source: {
                        primarySourceProfileId: "remote",
                        fallbackSourceProfileIds: ["local"],
                        failureMode: "useFallback",
                    },
                },
            },
        },
    });
    const widget = readStackedMetricWidget(nextSettings);
    const firstSlot = widget.slots[0];

    assert.equal(firstSlot?.item.case, "singleMetric");
    assert.equal(firstSlot.item.value.slot?.metric?.sourcePolicy?.primarySourceProfileId, "remote");
    assert.deepEqual(firstSlot.item.value.slot?.metric?.sourcePolicy?.fallbackSourceProfileIds, ["local"]);
    assert.equal(firstSlot.item.value.slot?.metric?.sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch rejects removing stacked metric slots below the minimum", () => {
    assert.throws(() => writeStoredWidgetSettingsPatch({
        stackedMetric: {
            slots: [
                { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
            ],
        },
    }, {
        stacked: {
            removeSlotId: "slot-2",
        },
    }), /minimum of 2/);
});

function readSingleMetricSlot(rawSettings: unknown): StoredMetricSlot | undefined {
    const widget = readStoredWidgetSettings(rawSettings).settings.widget;
    if (widget.case !== "singleMetric") {
        assert.fail(`Expected singleMetric widget, received ${String(widget.case)}`);
    }

    return widget.value.slot;
}

function readStackedMetricWidget(rawSettings: unknown): StoredStackedMetricWidget {
    const widget = readStoredWidgetSettings(rawSettings).settings.widget;
    if (widget.case !== "stackedMetric") {
        assert.fail(`Expected stackedMetric widget, received ${String(widget.case)}`);
    }

    return widget.value;
}
