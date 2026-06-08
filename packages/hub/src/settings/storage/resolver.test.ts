import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { create } from "@bufbuild/protobuf";

import {
    readStoredGlobalSettings,
    readStoredWidgetSettings,
} from "./codec";
import {
    resolveStoredGlobalSettings,
    resolveStoredWidgetSettings,
} from "./resolver";
import { MetricUnit } from "../../runtime/sources/metric-source";
import {
    DenseMultiMetricWidgetSchema,
    SingleMetricWidgetSchema,
    StackedMetricSlotSchema,
    StackedMetricWidgetSchema,
    StoredWidgetSettingsSchema,
} from "../../generated/shometrics/v1/settings_pb.js";
import type {
    ResolvedSingleMetricWidget,
    ResolvedWidgetSettings,
} from "../resolved-settings";

describe("stored settings proto resolver", () => {
    it("resolves empty stored settings to a complete single CPU widget", () => {
        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings(undefined).settings,
        });

        assert.equal(settings.widget.widgetKind, "singleMetric");
        assert.equal(settings.widget.slot.metric.target.domain, "cpu");
        assert.equal(settings.preferences.pollingFrequencySeconds, 1);
        assert.equal(settings.widget.slot.appearance.view.selectedView, "circle");
        assert.equal(settings.widget.slot.appearance.view.textVariant, "centered");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "multi-color");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.solid.colors.usageColor, "#3b82f6");
        assert.equal(settings.widget.slot.appearance.theme.colorFilled.paint.colorMode, "solid");
        assert.equal(settings.widget.slot.appearance.theme.colorFilled.paint.solid.color, "#3b82f6");
        assert.equal(settings.widget.slot.appearance.theme.terminal.variant, "clean");
        assert.equal(settings.widget.slot.appearance.theme.terminal.paint.preset, "green");
        assert.deepEqual(settings.widget.slot.appearance.theme.flat.transparentSurface, {
            enabled: false,
            backgroundOpacityPercent: 50,
            textOutlinePercent: 70,
            shapeOutlinePercent: 30,
        });
        assert.deepEqual(settings.widget.slot.appearance.theme.pixelWindow.transparentSurface, {
            enabled: false,
            backgroundOpacityPercent: 50,
            textOutlinePercent: 70,
            shapeOutlinePercent: 30,
        });
    });

    it("resolves transparent surface settings for every theme", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
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
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });
        const theme = settings.widget.slot.appearance.theme;

        assert.deepEqual(theme.flat.transparentSurface, {
            enabled: true,
            backgroundOpacityPercent: 10,
            textOutlinePercent: 20,
            shapeOutlinePercent: 30,
        });
        assert.deepEqual(theme.cupertinoGlass.transparentSurface, {
            enabled: true,
            backgroundOpacityPercent: 40,
            textOutlinePercent: 50,
            shapeOutlinePercent: 60,
        });
        assert.deepEqual(theme.colorFilled.transparentSurface, {
            enabled: true,
            backgroundOpacityPercent: 70,
            textOutlinePercent: 80,
            shapeOutlinePercent: 90,
        });
        assert.deepEqual(theme.terminal.transparentSurface, {
            enabled: true,
            backgroundOpacityPercent: 15,
            textOutlinePercent: 25,
            shapeOutlinePercent: 35,
        });
        assert.deepEqual(theme.pixelWindow.transparentSurface, {
            enabled: true,
            backgroundOpacityPercent: 45,
            textOutlinePercent: 55,
            shapeOutlinePercent: 65,
        });
    });

    it("resolves title-card as a text view-owned variant", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            view: {
                                selectedView: "METRIC_VIEW_TEXT",
                                textVariant: "TEXT_VIEW_VARIANT_TITLE_CARD",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.view.selectedView, "text");
        assert.equal(settings.widget.slot.appearance.view.textVariant, "title-card");
    });

    it("resolves Windows CPU temperature settings", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        cpu: {
                            kind: "KIND_TEMPERATURE",
                            maximumTemperatureCelsius: 95,
                            temperatureUnit: "TEMPERATURE_UNIT_FAHRENHEIT",
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            runtime: {
                isWindows: true,
            },
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "cpu");
        if (target.domain === "cpu") {
            assert.deepEqual(target.reading, {
                kind: "temperature",
                maximumCelsius: 95,
                unit: "fahrenheit",
            });
        }
    });

    it("resolves Windows CPU power settings", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        cpu: {
                            kind: "KIND_POWER",
                            maximumPowerWatts: 180,
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            runtime: {
                isWindows: true,
            },
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "cpu");
        if (target.domain === "cpu") {
            assert.deepEqual(target.reading, {
                kind: "power",
                maximumWatts: 180,
            });
        }
    });

    it("uses CPU temperature and power defaults", () => {
        const temperatureSettings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                singleMetric: {
                    slot: {
                        metric: {
                            cpu: {
                                kind: "KIND_TEMPERATURE",
                            },
                        },
                    },
                },
            }).settings,
            runtime: {
                isWindows: true,
            },
        });
        const powerSettings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                singleMetric: {
                    slot: {
                        metric: {
                            cpu: {
                                kind: "KIND_POWER",
                            },
                        },
                    },
                },
            }).settings,
            runtime: {
                isWindows: true,
            },
        });
        const temperatureTarget = temperatureSettings.widget.slot.metric.target;
        const powerTarget = powerSettings.widget.slot.metric.target;

        assert.equal(temperatureTarget.domain, "cpu");
        assert.equal(powerTarget.domain, "cpu");
        if (temperatureTarget.domain === "cpu" && powerTarget.domain === "cpu") {
            assert.deepEqual(temperatureTarget.reading, {
                kind: "temperature",
                maximumCelsius: 100,
                unit: "celsius",
            });
            assert.deepEqual(powerTarget.reading, {
                kind: "power",
                maximumWatts: 150,
            });
        }
    });

    it("preserves unsupported non-Windows CPU helper readings", () => {
        const temperatureSettings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                singleMetric: {
                    slot: {
                        metric: {
                            cpu: {
                                kind: "KIND_TEMPERATURE",
                            },
                        },
                    },
                },
            }).settings,
            runtime: {
                isWindows: false,
            },
        });
        const powerSettings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                singleMetric: {
                    slot: {
                        metric: {
                            cpu: {
                                kind: "KIND_POWER",
                            },
                        },
                    },
                },
            }).settings,
            runtime: {
                isWindows: false,
            },
        });
        const temperatureTarget = temperatureSettings.widget.slot.metric.target;
        const powerTarget = powerSettings.widget.slot.metric.target;

        assert.equal(temperatureTarget.domain, "cpu");
        assert.equal(powerTarget.domain, "cpu");
        if (temperatureTarget.domain === "cpu" && powerTarget.domain === "cpu") {
            assert.deepEqual(temperatureTarget.reading, {
                kind: "temperature",
                maximumCelsius: 100,
                unit: "celsius",
            });
            assert.deepEqual(powerTarget.reading, {
                kind: "power",
                maximumWatts: 150,
            });
        }
    });

    it("defaults network metric paint to solid without changing other metric defaults", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        network: {},
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.metric.target.domain, "network");
        assert.equal(settings.widget.slot.metric.target.reading.kind, "traffic");
        if (settings.widget.slot.metric.target.reading.kind === "traffic") {
            assert.equal(settings.widget.slot.metric.target.reading.direction, "both");
            assert.equal(settings.widget.slot.metric.target.reading.trafficDisplayMode, "mirrored");
        }
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "solid");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.solid.colors.downloadColor, "#2563EB");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.solid.colors.uploadColor, "#F97316");
    });

    it("preserves an explicit network multi-color paint selection", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        network: {},
                    },
                    overrides: {
                        appearance: {
                            theme: {
                                flat: {
                                    paint: {
                                        colorMode: "COLOR_MODE_MULTI_COLOR",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.metric.target.domain, "network");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "multi-color");
    });

    it("defaults text view metric paint to black-white", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            view: {
                                selectedView: "METRIC_VIEW_TEXT",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.view.selectedView, "text");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "black-white");
    });

    it("keeps terminal text view paint on the theme-owned default", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            view: {
                                selectedView: "METRIC_VIEW_TEXT",
                            },
                            theme: {
                                selectedTheme: "METRIC_THEME_TERMINAL",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.view.selectedView, "text");
        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "terminal");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "multi-color");
    });

    it("preserves an explicit text view metric paint selection", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            view: {
                                selectedView: "METRIC_VIEW_TEXT",
                            },
                            theme: {
                                flat: {
                                    paint: {
                                        colorMode: "COLOR_MODE_SOLID",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.view.selectedView, "text");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "solid");
    });

    it("cascades global defaults widget overrides and runtime maxima", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            defaults: {
                network: {
                    unitBase: "UNIT_BASE_BIT",
                    maximumDownloadSpeedMegabitsPerSecond: 250,
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        network: {
                            kind: "KIND_TRAFFIC",
                            traffic: {
                                direction: "DIRECTION_DOWNLOAD",
                                trafficDisplayMode: "TRAFFIC_DISPLAY_MODE_OVERLAY",
                            },
                        },
                    },
                    overrides: {
                        appearance: {
                            theme: {
                                flat: {
                                    paint: {
                                        solid: {
                                            colors: {
                                                usageColor: "#222222",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        network: {
                            maximumUploadSpeedMegabitsPerSecond: 50,
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
            runtime: {
                runtimeMaximumDownloadSpeedMegabitsPerSecond: 800,
            },
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(settings.widget.slot.appearance.theme.flat.paint.solid.colors.usageColor, "#222222");
        assert.equal(target.domain, "network");
        assert.equal(target.reading.kind, "traffic");
        assert.equal(target.reading.direction, "download");
        assert.equal(target.reading.trafficDisplayMode, "overlay");
        assert.equal(target.reading.display.unitBase, "bit");
        assert.equal(target.reading.display.maximumDownloadSpeedMegabitsPerSecond, 800);
        assert.equal(target.reading.display.maximumUploadSpeedMegabitsPerSecond, 50);
    });

    it("resolves ping network targets with normalized host input", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        network: {
                            kind: "KIND_PING",
                            ping: {
                                targetHost: "https://Example.COM/path?q=1",
                            },
                        },
                    },
                    overrides: {
                        network: {
                            maximumUploadSpeedMegabitsPerSecond: 50,
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "network");
        assert.equal(target.reading.kind, "ping");
        if (target.reading.kind === "ping") {
            assert.equal(target.reading.targetHost, "example.com");
        }
    });

    it("defaults invalid ping target hosts to the public DNS target", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        network: {
                            kind: "KIND_PING",
                            ping: {
                                targetHost: "bad host",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "network");
        assert.equal(target.reading.kind, "ping");
        if (target.reading.kind === "ping") {
            assert.equal(target.reading.targetHost, "8.8.8.8");
        }
    });

    it("applies global override without changing non-appearance settings", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                view: {
                    view: {
                        selectedView: "METRIC_VIEW_BAR",
                        circleVariant: "CIRCLE_VIEW_VARIANT_GAUGE",
                    },
                },
                theme: {
                    theme: {
                        selectedTheme: "METRIC_THEME_CUPERTINO_GLASS",
                    },
                },
                paint: {
                    metric: {
                        colorMode: "COLOR_MODE_SOLID",
                        solid: {
                            color: "#111111",
                        },
                    },
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 15,
            },
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            view: {
                                selectedView: "METRIC_VIEW_LINE",
                            },
                            theme: {
                                flat: {
                                    paint: {
                                        solid: {
                                            colors: {
                                                usageColor: "#222222",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });

        assert.equal(settings.preferences.pollingFrequencySeconds, 15);
        assert.equal(settings.widget.slot.appearance.view.selectedView, "bar");
        assert.equal(settings.widget.slot.appearance.view.circleVariant, "gauge");
        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "cupertino-glass");
        assert.equal(settings.widget.slot.appearance.theme.cupertinoGlass.paint.colorMode, "solid");
        assert.equal(settings.widget.slot.appearance.theme.cupertinoGlass.paint.solid.colors.usageColor, "#111111");
    });

    it("resolves black-white as a user-facing color mode", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                flat: {
                                    paint: {
                                        colorMode: "COLOR_MODE_BLACK_WHITE",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "black-white");
    });

    it("resolves terminal as a user-facing theme", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_TERMINAL",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "terminal");
        assert.equal(settings.widget.slot.appearance.theme.terminal.variant, "clean");
        assert.equal(settings.widget.slot.appearance.theme.terminal.paint.preset, "green");
    });

    it("resolves terminal vintage as a theme-owned variant", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_TERMINAL",
                                terminal: {
                                    variant: "TERMINAL_THEME_VARIANT_VINTAGE",
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "terminal");
        assert.equal(settings.widget.slot.appearance.theme.terminal.variant, "vintage");
    });

    it("resolves terminal palette as theme-owned paint", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_TERMINAL",
                                terminal: {
                                    paint: {
                                        preset: "TERMINAL_PALETTE_PRESET_AMBER",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "terminal");
        assert.equal(settings.widget.slot.appearance.theme.terminal.paint.preset, "amber");
    });

    it("resolves pixel window as a selectable theme", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_PIXEL_WINDOW",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "pixel-window");
    });

    it("applies global paint override without replacing widget view and theme", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                view: {
                    enabled: false,
                },
                theme: {
                    enabled: false,
                },
                paint: {
                    metric: {
                        colorMode: "COLOR_MODE_BLACK_WHITE",
                    },
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            view: {
                                selectedView: "METRIC_VIEW_LINE",
                            },
                            theme: {
                                selectedTheme: "METRIC_THEME_CUPERTINO_GLASS",
                                cupertinoGlass: {
                                    paint: {
                                        colorMode: "COLOR_MODE_SOLID",
                                        solid: {
                                            colors: {
                                                usageColor: "#222222",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });

        assert.equal(settings.widget.slot.appearance.view.selectedView, "line");
        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "cupertino-glass");
        assert.equal(settings.widget.slot.appearance.theme.cupertinoGlass.paint.colorMode, "black-white");
        assert.equal(settings.widget.slot.appearance.theme.cupertinoGlass.paint.solid.colors.usageColor, "#3b82f6");
    });

    it("applies terminal global paint override to terminal widgets", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                view: {
                    enabled: false,
                },
                theme: {
                    enabled: false,
                },
                paint: {
                    terminal: {
                        preset: "TERMINAL_PALETTE_PRESET_CYAN",
                    },
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_TERMINAL",
                                terminal: {
                                    paint: {
                                        preset: "TERMINAL_PALETTE_PRESET_AMBER",
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });

        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "terminal");
        assert.equal(settings.widget.slot.appearance.theme.terminal.paint.preset, "cyan");
    });

    it("does not apply global metric paint override to pixel window widgets", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                view: {
                    enabled: false,
                },
                theme: {
                    enabled: false,
                },
                paint: {
                    metric: {
                        colorMode: "COLOR_MODE_BLACK_WHITE",
                    },
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_PIXEL_WINDOW",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });

        assert.equal(settings.widget.slot.appearance.theme.selectedTheme, "pixel-window");
        assert.equal(settings.widget.slot.appearance.theme.flat.paint.colorMode, "multi-color");
    });

    it("preserves widget transparent surface when only global theme override applies", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                view: {
                    enabled: false,
                },
                theme: {
                    theme: {
                        selectedTheme: "METRIC_THEME_CUPERTINO_GLASS",
                    },
                },
                paint: {
                    enabled: false,
                },
                transparentSurface: {
                    enabled: false,
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_FLAT",
                                cupertinoGlass: {
                                    transparentSurface: {
                                        enabled: true,
                                        backgroundOpacityPercent: 20,
                                        textOutlinePercent: 30,
                                        shapeOutlinePercent: 40,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });
        const theme = settings.widget.slot.appearance.theme;

        assert.equal(theme.selectedTheme, "cupertino-glass");
        assert.deepEqual(theme.cupertinoGlass.transparentSurface, {
            enabled: true,
            backgroundOpacityPercent: 20,
            textOutlinePercent: 30,
            shapeOutlinePercent: 40,
        });
    });

    it("applies global transparent surface override without replacing widget theme", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                view: {
                    enabled: false,
                },
                theme: {
                    enabled: false,
                },
                paint: {
                    enabled: false,
                },
                transparentSurface: {
                    transparentSurface: {
                        enabled: true,
                        backgroundOpacityPercent: 35,
                        textOutlinePercent: 45,
                        shapeOutlinePercent: 55,
                    },
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            theme: {
                                selectedTheme: "METRIC_THEME_PIXEL_WINDOW",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });
        const theme = settings.widget.slot.appearance.theme;

        assert.equal(theme.selectedTheme, "pixel-window");
        assert.deepEqual(theme.pixelWindow.transparentSurface, {
            enabled: true,
            backgroundOpacityPercent: 35,
            textOutlinePercent: 45,
            shapeOutlinePercent: 55,
        });
        assert.deepEqual(theme.flat.transparentSurface, theme.pixelWindow.transparentSurface);
    });

    it("uses kind switches for disk metric branches", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        disk: {
                            kind: "KIND_THROUGHPUT",
                            throughputDirection: "THROUGHPUT_DIRECTION_READ",
                        },
                    },
                    overrides: {
                        diskThroughput: {
                            maximumReadThroughputMebibytesPerSecond: 400,
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "disk");
        assert.equal(target.reading.kind, "throughput");
        assert.equal(target.reading.direction, "read");
        assert.equal(target.reading.display.maximumReadThroughputMebibytesPerSecond, 400);
    });

    it("uses kind switches for GPU metric branches", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        gpu: {
                            kind: "KIND_POWER",
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            runtime: {
                runtimeMaximumGpuPowerWatts: 450,
            },
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "gpu");
        assert.equal(target.reading.kind, "power");
        assert.equal(target.reading.maximumWatts, 450);
    });

    it("resolves Windows disk throughput as aggregate throughput", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    metric: {
                        disk: {
                            kind: "KIND_THROUGHPUT",
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings,
            runtime: {
                isWindows: true,
            },
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "disk");
        assert.equal(target.reading.kind, "throughput");
        assert.equal(settings.preferences.pollingFrequencySeconds, 1);
    });

    it("resolves source profiles and source policy ids", () => {
        const globalSettings = resolveStoredGlobalSettings(readStoredGlobalSettings({
            defaultSourceProfileId: "local",
            sourceProfiles: [
                {
                    id: "remote",
                    displayName: "Remote host",
                    sourceTypeId: "http-agent",
                    http: {
                        baseUrl: "http://127.0.0.1:4545",
                    },
                },
            ],
        }).settings);
        const widgetSettings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                singleMetric: {
                    slot: {
                        metric: {
                            sourcePolicy: {
                                primarySourceProfileId: "remote",
                                fallbackSourceProfileIds: ["local"],
                                failureMode: "FAILURE_MODE_USE_FALLBACK",
                            },
                            catalog: {
                                metricId: "gpu/0/temperature",
                                detectedLabel: "GPU",
                                detectedUnit: "METRIC_UNIT_CELSIUS",
                                detectedCategory: "CATALOG_METRIC_CATEGORY_GPU",
                                detectedReadingKind: "CATALOG_METRIC_READING_KIND_TEMPERATURE",
                                customLabel: "Hot Spot",
                                customMaximumValue: 120,
                            },
                        },
                    },
                },
            }).settings,
        });

        assert.equal(globalSettings.defaultSourceProfileId, "local");
        assert.equal(globalSettings.sourceProfiles[0]?.connection?.connectionKind, "http");
        assert.equal(widgetSettings.widget.slot.metric.source.primarySourceProfileId, "remote");
        assert.deepEqual(widgetSettings.widget.slot.metric.source.fallbackSourceProfileIds, ["local"]);
        assert.equal(widgetSettings.widget.slot.metric.source.failureMode, "useFallback");
        assert.equal(widgetSettings.widget.slot.metric.target.domain, "catalog");
        if (widgetSettings.widget.slot.metric.target.domain === "catalog") {
            assert.equal(widgetSettings.widget.slot.metric.target.metricId, "gpu/0/temperature");
            assert.equal(widgetSettings.widget.slot.metric.target.detectedLabel, "GPU");
            assert.equal(widgetSettings.widget.slot.metric.target.detectedUnit, MetricUnit.CELSIUS);
            assert.equal(widgetSettings.widget.slot.metric.target.detectedCategory, "gpu");
            assert.equal(widgetSettings.widget.slot.metric.target.detectedReadingKind, "temperature");
            assert.equal(widgetSettings.widget.slot.metric.target.customLabel, "Hot Spot");
            assert.equal(widgetSettings.widget.slot.metric.target.customMaximumValue, 120);
        }
    });

    it("resolves catalog target initial state with text view defaults", () => {
        const widgetSettings = resolveSingleMetricWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                singleMetric: {
                    slot: {
                        metric: {
                            catalog: {},
                        },
                    },
                },
            }).settings,
        });
        const target = widgetSettings.widget.slot.metric.target;

        assert.equal(target.domain, "catalog");
        if (target.domain === "catalog") {
            assert.equal(target.metricId, "");
            assert.equal(target.detectedLabel, undefined);
            assert.equal(target.detectedUnit, MetricUnit.UNSPECIFIED);
            assert.equal(target.detectedCategory, "unspecified");
            assert.equal(target.detectedReadingKind, "unspecified");
            assert.equal(target.customLabel, undefined);
            assert.equal(target.customMaximumValue, undefined);
        }
        assert.equal(widgetSettings.widget.slot.appearance.view.selectedView, "text");
        assert.equal(widgetSettings.widget.slot.appearance.theme.flat.paint.colorMode, "black-white");
    });

    it("resolves dense multi metric rows and shared appearance", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            denseMultiMetric: {
                slots: [
                    {
                        slotId: "cpu-row",
                        slot: {
                            metric: {
                                cpu: {
                                    kind: "KIND_USAGE",
                                },
                            },
                        },
                        customLabel: " CPU ",
                        customMaximumValue: 100,
                    },
                    {
                        slotId: "gpu-row",
                        slot: {
                            metric: {
                                gpu: {
                                    kind: "KIND_TEMPERATURE",
                                    maximumTemperatureCelsius: 90,
                                },
                            },
                        },
                    },
                ],
                appearance: {
                    view: {
                        selectedView: "METRIC_VIEW_LINE",
                    },
                    theme: {
                        selectedTheme: "METRIC_THEME_CUPERTINO_GLASS",
                    },
                },
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({ storedWidgetSettings });

        assert.equal(settings.widget.widgetKind, "denseMultiMetric");
        assert.equal(settings.widget.slots.length, 2);
        assert.equal(settings.widget.slots[0]?.slotId, "cpu-row");
        assert.equal(settings.widget.slots[0]?.slot.metric.target.domain, "cpu");
        assert.equal(settings.widget.slots[0]?.customLabel, "CPU");
        assert.equal(settings.widget.slots[0]?.customMaximumValue, 100);
        assert.equal(settings.widget.slots[1]?.slotId, "gpu-row");
        assert.equal(settings.widget.slots[1]?.slot.metric.target.domain, "gpu");
        assert.equal(settings.widget.appearance.view.selectedView, "circle");
        assert.equal(settings.widget.appearance.theme.selectedTheme, "cupertino-glass");
        assert.equal(settings.preferences.pollingFrequencySeconds, 1);
    });

    it("uses dense transparent surface outline defaults without blocking stored overrides", () => {
        const defaultSettings = resolveStoredWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                denseMultiMetric: {
                    slots: [
                        { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                        { slotId: "slot-2", slot: { metric: { gpu: {} } } },
                    ],
                },
            }).settings,
        });
        const customSettings = resolveStoredWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings({
                denseMultiMetric: {
                    slots: [
                        { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                        { slotId: "slot-2", slot: { metric: { gpu: {} } } },
                    ],
                    appearance: {
                        theme: {
                            flat: {
                                transparentSurface: {
                                    textOutlinePercent: 40,
                                    shapeOutlinePercent: 50,
                                },
                            },
                        },
                    },
                },
            }).settings,
        });

        if (defaultSettings.widget.widgetKind !== "denseMultiMetric") {
            throw new Error("Expected dense multi metric settings.");
        }
        if (customSettings.widget.widgetKind !== "denseMultiMetric") {
            throw new Error("Expected dense multi metric settings.");
        }

        assert.equal(defaultSettings.widget.appearance.theme.flat.transparentSurface.textOutlinePercent, 0);
        assert.equal(defaultSettings.widget.appearance.theme.flat.transparentSurface.shapeOutlinePercent, 0);
        assert.equal(defaultSettings.widget.appearance.theme.pixelWindow.transparentSurface.textOutlinePercent, 0);
        assert.equal(defaultSettings.widget.appearance.theme.pixelWindow.transparentSurface.shapeOutlinePercent, 0);
        assert.equal(customSettings.widget.appearance.theme.flat.transparentSurface.textOutlinePercent, 40);
        assert.equal(customSettings.widget.appearance.theme.flat.transparentSurface.shapeOutlinePercent, 50);
    });

    it("does not apply global view overrides to dense multi metric appearance", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                view: {
                    view: {
                        selectedView: "METRIC_VIEW_TEXT",
                    },
                },
                theme: {
                    theme: {
                        selectedTheme: "METRIC_THEME_TERMINAL",
                    },
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            denseMultiMetric: {
                slots: [
                    { slotId: "slot-1", slot: { metric: { cpu: {} } } },
                    { slotId: "slot-2", slot: { metric: { gpu: {} } } },
                ],
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });

        assert.equal(settings.widget.widgetKind, "denseMultiMetric");
        assert.equal(settings.widget.appearance.view.selectedView, "circle");
        assert.equal(settings.widget.appearance.theme.selectedTheme, "terminal");
    });

    it("rejects dense multi metric widgets below the minimum resolved slot count", () => {
        const storedWidgetSettings = create(StoredWidgetSettingsSchema, {
            widget: {
                case: "denseMultiMetric",
                value: create(DenseMultiMetricWidgetSchema, {
                    slots: [
                        { slotId: "slot-1" },
                    ],
                }),
            },
        });

        assert.throws(() => resolveStoredWidgetSettings({ storedWidgetSettings }), /2 to 6 metric slots/);
    });

    it("rejects dense multi metric widgets with duplicate resolved slot ids", () => {
        const storedWidgetSettings = create(StoredWidgetSettingsSchema, {
            widget: {
                case: "denseMultiMetric",
                value: create(DenseMultiMetricWidgetSchema, {
                    slots: [
                        { slotId: "slot-1" },
                        { slotId: "slot-1" },
                    ],
                }),
            },
        });

        assert.throws(() => resolveStoredWidgetSettings({ storedWidgetSettings }), /slot ids must be unique/);
    });

    it("resolves stacked metric slots and rotation settings", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            stackedMetric: {
                slots: [
                    {
                        slotId: "cpu-stack",
                        singleMetric: {
                            slot: {
                                metric: {
                                    cpu: {
                                        kind: "KIND_USAGE",
                                    },
                                },
                            },
                        },
                    },
                    {
                        slotId: "memory-stack",
                        singleMetric: {
                            slot: {
                                metric: {
                                    memory: {
                                        kind: "KIND_USAGE",
                                    },
                                },
                            },
                        },
                    },
                ],
                rotation: {
                    autoRotateEnabled: false,
                    intervalSeconds: 5,
                },
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({ storedWidgetSettings });

        assert.equal(settings.widget.widgetKind, "stackedMetric");
        assert.equal(settings.widget.slots.length, 2);
        assert.equal(settings.widget.slots[0]?.slotId, "cpu-stack");
        assert.equal(settings.widget.slots[0]?.widget.slot.metric.target.domain, "cpu");
        assert.equal(settings.widget.slots[1]?.slotId, "memory-stack");
        assert.equal(settings.widget.slots[1]?.widget.slot.metric.target.domain, "memory");
        assert.equal(settings.widget.rotation.autoRotateEnabled, false);
        assert.equal(settings.widget.rotation.intervalSeconds, 5);
        assert.equal(settings.preferences.pollingFrequencySeconds, 1);
    });

    it("resolves stacked metric rotation defaults", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            stackedMetric: {
                slots: [
                    { slotId: "slot-1", singleMetric: { slot: { metric: { cpu: {} } } } },
                    { slotId: "slot-2", singleMetric: { slot: { metric: { memory: {} } } } },
                ],
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({ storedWidgetSettings });

        assert.equal(settings.widget.widgetKind, "stackedMetric");
        assert.equal(settings.widget.rotation.autoRotateEnabled, true);
        assert.equal(settings.widget.rotation.intervalSeconds, 3);
    });

    it("rejects stacked metric widgets below the minimum resolved slot count", () => {
        const storedWidgetSettings = create(StoredWidgetSettingsSchema, {
            widget: {
                case: "stackedMetric",
                value: create(StackedMetricWidgetSchema, {
                    slots: [
                        { slotId: "slot-1" },
                    ],
                }),
            },
        });

        assert.throws(() => resolveStoredWidgetSettings({ storedWidgetSettings }), /2 to 3 metric slots/);
    });

    it("rejects stacked metric widgets with duplicate resolved slot ids", () => {
        const storedWidgetSettings = create(StoredWidgetSettingsSchema, {
            widget: {
                case: "stackedMetric",
                value: create(StackedMetricWidgetSchema, {
                    slots: [
                        create(StackedMetricSlotSchema, {
                            slotId: "slot-1",
                            item: {
                                case: "singleMetric",
                                value: create(SingleMetricWidgetSchema),
                            },
                        }),
                        create(StackedMetricSlotSchema, {
                            slotId: "slot-1",
                            item: {
                                case: "singleMetric",
                                value: create(SingleMetricWidgetSchema),
                            },
                        }),
                    ],
                }),
            },
        });

        assert.throws(() => resolveStoredWidgetSettings({ storedWidgetSettings }), /slot ids must be unique/);
    });

    it("rejects stacked metric slots without a single metric item", () => {
        const storedWidgetSettings = create(StoredWidgetSettingsSchema, {
            widget: {
                case: "stackedMetric",
                value: create(StackedMetricWidgetSchema, {
                    slots: [
                        { slotId: "slot-1" },
                        { slotId: "slot-2" },
                    ],
                }),
            },
        });

        assert.throws(() => resolveStoredWidgetSettings({ storedWidgetSettings }), /single metric widget/);
    });

    it("rejects stacked metric rotation intervals outside the supported range", () => {
        const storedWidgetSettings = create(StoredWidgetSettingsSchema, {
            widget: {
                case: "stackedMetric",
                value: create(StackedMetricWidgetSchema, {
                    slots: [
                        create(StackedMetricSlotSchema, {
                            slotId: "slot-1",
                            item: {
                                case: "singleMetric",
                                value: create(SingleMetricWidgetSchema),
                            },
                        }),
                        create(StackedMetricSlotSchema, {
                            slotId: "slot-2",
                            item: {
                                case: "singleMetric",
                                value: create(SingleMetricWidgetSchema),
                            },
                        }),
                    ],
                    rotation: {
                        intervalSeconds: 6,
                    },
                }),
            },
        });

        assert.throws(() => resolveStoredWidgetSettings({ storedWidgetSettings }), /1 to 5 seconds/);
    });
});

function resolveSingleMetricWidgetSettings(
    options: Parameters<typeof resolveStoredWidgetSettings>[0],
): ResolvedWidgetSettings & { readonly widget: ResolvedSingleMetricWidget } {
    const settings = resolveStoredWidgetSettings(options);
    if (settings.widget.widgetKind !== "singleMetric") {
        assert.fail(`Expected singleMetric widget, received ${settings.widget.widgetKind}`);
    }

    return {
        ...settings,
        widget: settings.widget,
    };
}

