import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    readStoredGlobalSettings,
    readStoredWidgetSettings,
} from "./codec";
import {
    resolveStoredGlobalSettings,
    resolveStoredWidgetSettings,
} from "./resolver";

describe("stored settings proto resolver", () => {
    it("resolves empty stored settings to a complete single CPU widget", () => {
        const settings = resolveStoredWidgetSettings({
            storedWidgetSettings: readStoredWidgetSettings(undefined).settings,
        });

        assert.equal(settings.widget.widgetKind, "singleMetric");
        assert.equal(settings.widget.slot.metric.target.domain, "cpu");
        assert.equal(settings.preferences.pollingFrequencySeconds, 1);
        assert.equal(settings.widget.slot.appearance.viewLayout, "circular");
        assert.equal(settings.widget.slot.appearance.usageColors.solidColor, "#3b82f6");
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
                            direction: "DIRECTION_DOWNLOAD",
                            trafficDisplayMode: "TRAFFIC_DISPLAY_MODE_OVERLAY",
                        },
                    },
                    overrides: {
                        appearance: {
                            usageColors: {
                                solidColor: "#222222",
                            },
                        },
                        network: {
                            maximumUploadSpeedMegabitsPerSecond: 50,
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
            runtime: {
                runtimeMaximumDownloadSpeedMegabitsPerSecond: 800,
            },
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(settings.widget.slot.appearance.usageColors.solidColor, "#222222");
        assert.equal(target.domain, "network");
        assert.equal(target.reading.kind, "traffic");
        assert.equal(target.reading.direction, "download");
        assert.equal(target.reading.trafficDisplayMode, "overlay");
        assert.equal(target.reading.display.unitBase, "bit");
        assert.equal(target.reading.display.maximumDownloadSpeedMegabitsPerSecond, 800);
        assert.equal(target.reading.display.maximumUploadSpeedMegabitsPerSecond, 50);
    });

    it("applies global override without changing non-appearance settings", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                layoutStyle: {
                    viewLayout: "SINGLE_METRIC_VIEW_LAYOUT_LINEAR",
                    circleStyle: "CIRCLE_STYLE_GAUGE",
                    theme: "METRIC_THEME_CUPERTINO_GLASS",
                },
                color: {
                    colors: {
                        solidColor: "#111111",
                    },
                    colorMode: "COLOR_MODE_SOLID",
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
                            viewLayout: "SINGLE_METRIC_VIEW_LAYOUT_SPARKLINE",
                            usageColors: {
                                solidColor: "#222222",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });

        assert.equal(settings.preferences.pollingFrequencySeconds, 15);
        assert.equal(settings.widget.slot.appearance.viewLayout, "linear");
        assert.equal(settings.widget.slot.appearance.circleStyle, "gauge");
        assert.equal(settings.widget.slot.appearance.theme, "cupertino-glass");
        assert.equal(settings.widget.slot.appearance.colorMode, "solid");
        assert.equal(settings.widget.slot.appearance.usageColors.solidColor, "#111111");
    });

    it("resolves black-white as a user-facing color mode", () => {
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            colorMode: "COLOR_MODE_BLACK_WHITE",
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({
            storedWidgetSettings,
        });

        assert.equal(settings.widget.slot.appearance.colorMode, "black-white");
    });

    it("applies global color override without replacing widget layout and style", () => {
        const storedGlobalSettings = readStoredGlobalSettings({
            overrides: {
                enabled: true,
                layoutStyle: {
                    enabled: false,
                },
                color: {
                    colorMode: "COLOR_MODE_BLACK_WHITE",
                },
            },
        }).settings;
        const storedWidgetSettings = readStoredWidgetSettings({
            singleMetric: {
                slot: {
                    overrides: {
                        appearance: {
                            viewLayout: "SINGLE_METRIC_VIEW_LAYOUT_SPARKLINE",
                            theme: "METRIC_THEME_CUPERTINO_GLASS",
                            colorMode: "COLOR_MODE_SOLID",
                            usageColors: {
                                solidColor: "#222222",
                            },
                        },
                    },
                },
            },
        }).settings;

        const settings = resolveStoredWidgetSettings({
            storedWidgetSettings,
            storedGlobalSettings,
        });

        assert.equal(settings.widget.slot.appearance.viewLayout, "sparkline");
        assert.equal(settings.widget.slot.appearance.theme, "cupertino-glass");
        assert.equal(settings.widget.slot.appearance.colorMode, "black-white");
        assert.equal(settings.widget.slot.appearance.usageColors.solidColor, "#3b82f6");
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

        const settings = resolveStoredWidgetSettings({
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

        const settings = resolveStoredWidgetSettings({
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

    it("keeps Windows disk throughput unsupported as runtime context", () => {
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

        const settings = resolveStoredWidgetSettings({
            storedWidgetSettings,
            runtime: {
                isWindows: true,
            },
        });
        const target = settings.widget.slot.metric.target;

        assert.equal(target.domain, "disk");
        assert.equal(target.reading.kind, "usage");
        assert.equal(settings.preferences.pollingFrequencySeconds, 60);
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
        const widgetSettings = resolveStoredWidgetSettings({
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
                                fallbackLabel: "GPU",
                                fallbackUnit: "C",
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
    });
});
