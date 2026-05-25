import assert from "node:assert/strict";
import test from "node:test";
import {
    DEFAULT_RENDER_THEME_EFFECT_TOKENS,
    TERMINAL_CLEAN_RENDER_THEME_EFFECT_TOKENS,
    TERMINAL_VINTAGE_RENDER_THEME_EFFECT_TOKENS,
} from "../view-rendering/render-svg-effects";
import {
    DEFAULT_RENDER_TEXT_STYLES,
    TERMINAL_CLEAN_RENDER_TEXT_STYLES,
    TERMINAL_VINTAGE_RENDER_TEXT_STYLES,
} from "../view-rendering/render-text-style";
import { buildMetricRenderAppearance } from "./render-appearance-builder";
import { buildDefaultAppearanceSettings as buildAppearanceSettings } from "./default-appearance-settings";

test("metric view maps resolved appearance settings to renderer branch values", () => {
    const circleSettings = buildMetricRenderAppearance(buildAppearanceSettings({ view: { selectedView: "circle" } }));
    const barSettings = buildMetricRenderAppearance(buildAppearanceSettings({ view: { selectedView: "bar" } }));
    const lineSettings = buildMetricRenderAppearance(buildAppearanceSettings({ view: { selectedView: "line" } }));

    assert.equal(circleSettings.renderPrimitive, "circle");
    assert.equal(barSettings.renderPrimitive, "bar");
    assert.equal(lineSettings.renderPrimitive, "sparkline");
});

test("circle variant maps resolved appearance settings to renderer circle variants", () => {
    const minimalSettings = buildMetricRenderAppearance(buildAppearanceSettings({ view: { circleVariant: "minimal" } }));
    const gaugeSettings = buildMetricRenderAppearance(buildAppearanceSettings({ view: { circleVariant: "gauge" } }));
    const fullRingSettings = buildMetricRenderAppearance(buildAppearanceSettings({ view: { circleVariant: "full-ring" } }));

    assert.equal(minimalSettings.circleVariant, "minimal");
    assert.equal(gaugeSettings.circleVariant, "gauge");
    assert.equal(fullRingSettings.circleVariant, "full-ring");
});

test("text variant maps resolved appearance settings to renderer text variants", () => {
    const centeredSettings = buildMetricRenderAppearance(buildAppearanceSettings({ view: { textVariant: "centered" } }));
    const titleCardSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        view: {
            selectedView: "text",
            textVariant: "title-card",
        },
    }));

    assert.equal(centeredSettings.textVariant, "centered");
    assert.equal(titleCardSettings.textVariant, "title-card");
});

test("theme maps resolved appearance settings to renderer theme presets", () => {
    const cupertinoGlassSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "cupertino-glass" },
    }));
    const colorFilledSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "color-filled" },
    }));
    const terminalCleanSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "terminal" },
    }));
    const terminalVintageSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "terminal", terminal: { variant: "vintage" } },
    }));
    const defaultSettings = buildMetricRenderAppearance(buildAppearanceSettings());

    assert.equal(cupertinoGlassSettings.themePreset, "cupertino-glass");
    assert.equal(colorFilledSettings.themePreset, "color-filled");
    assert.equal(terminalCleanSettings.themePreset, "terminal-clean");
    assert.equal(terminalVintageSettings.themePreset, "terminal-vintage");
    assert.equal(defaultSettings.themePreset, "flat");
});

test("text styles map resolved appearance settings to renderer text roles", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings());
    const terminalCleanSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "terminal" },
    }));
    const terminalVintageSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "terminal", terminal: { variant: "vintage" } },
    }));

    assert.deepEqual(visualSettings.textStyles, DEFAULT_RENDER_TEXT_STYLES);
    assert.deepEqual(terminalCleanSettings.textStyles, TERMINAL_CLEAN_RENDER_TEXT_STYLES);
    assert.deepEqual(terminalVintageSettings.textStyles, TERMINAL_VINTAGE_RENDER_TEXT_STYLES);
});

test("theme effects map resolved appearance settings to renderer effect tokens", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings());
    const terminalCleanSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "terminal" },
    }));
    const terminalVintageSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "terminal", terminal: { variant: "vintage" } },
    }));

    assert.deepEqual(visualSettings.themeEffects, DEFAULT_RENDER_THEME_EFFECT_TOKENS);
    assert.deepEqual(terminalCleanSettings.themeEffects, TERMINAL_CLEAN_RENDER_THEME_EFFECT_TOKENS);
    assert.deepEqual(terminalVintageSettings.themeEffects, TERMINAL_VINTAGE_RENDER_THEME_EFFECT_TOKENS);
});

test("solid color mode uses resolved appearance color", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            flat: {
                paint: {
                    colorMode: "solid",
                    solid: {
                        colors: { usageColor: "#123456" },
                    },
                },
            },
        },
    }));

    assert.equal(visualSettings.paints.primaryMetric.solidColor, "#123456");
});

test("threshold values build renderer color bands", () => {
    const primaryMetric = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            flat: {
                paint: {
                    multiColor: {
                        lowThresholdPercent: 20,
                        highThresholdPercent: 90,
                    },
                },
            },
        },
    })).paints.primaryMetric;

    assert.deepEqual(primaryMetric.thresholds.map(threshold => ({
        min: threshold.min,
        max: threshold.max,
    })), [
        { min: 0, max: 20 },
        { min: 20, max: 90 },
        { min: 90, max: 101 },
    ]);
});

test("threshold colors use resolved appearance colors", () => {
    const primaryMetric = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            flat: {
                paint: {
                    multiColor: {
                        colors: {
                            usage: {
                                lowColor: "#111111",
                                mediumColor: "#222222",
                                highColor: "#333333",
                            },
                        },
                    },
                },
            },
        },
    })).paints.primaryMetric;

    assert.deepEqual(primaryMetric.thresholds.map(threshold => threshold.color), [
        "#111111",
        "#222222",
        "#333333",
    ]);
});

test("network channel defaults use blue download and orange upload ramps", () => {
    const appearance = buildAppearanceSettings();

    assert.equal(appearance.theme.flat.paint.solid.colors.downloadColor, "#2563EB");
    assert.equal(appearance.theme.flat.paint.solid.colors.uploadColor, "#F97316");
    assert.deepEqual(appearance.theme.flat.paint.multiColor.colors.download, {
        lowColor: "#60A5FA",
        mediumColor: "#2563EB",
        highColor: "#1E3A8A",
    });
    assert.deepEqual(appearance.theme.flat.paint.multiColor.colors.upload, {
        lowColor: "#FDBA74",
        mediumColor: "#F97316",
        highColor: "#C2410C",
    });
});

test("black-white color mode lowers renderer paint to neutral colors", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            flat: {
                paint: { colorMode: "black-white" },
            },
        },
    }));

    assert.equal(visualSettings.paintConstraint, "black-white");
    assert.deepEqual(visualSettings.paints.primaryMetric, {
        mode: "solid",
        solidColor: "#e6e6e6",
        thresholds: [],
        isGradientEnabled: false,
    });
});

test("terminal clean theme uses terminal paint without reading ordinary metric paint", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "terminal",
            flat: {
                paint: {
                    colorMode: "solid",
                    solid: { colors: { usageColor: "#ef4444" } },
                },
            },
        },
    }));
    const blackWhiteSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "terminal",
            flat: {
                paint: { colorMode: "black-white" },
            },
        },
    }));

    assert.equal(visualSettings.paints.primaryMetric.solidColor, "#25e84a");
    assert.equal(visualSettings.paints.primaryText, "#67ff70");
    assert.equal(visualSettings.paints.background, "#010705");
    assert.equal(blackWhiteSettings.paintConstraint, "none");
    assert.equal(blackWhiteSettings.paints.primaryMetric.solidColor, "#25e84a");
    assert.equal(blackWhiteSettings.paints.primaryText, "#67ff70");
});

test("terminal vintage theme keeps the physical phosphor palette", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: { selectedTheme: "terminal", terminal: { variant: "vintage" } },
    }));

    assert.equal(visualSettings.paints.primaryMetric.solidColor, "#10d82a");
    assert.equal(visualSettings.paints.primaryText, "#46ff36");
    assert.equal(visualSettings.paints.background, "#010301");
});

test("terminal palette changes the phosphor paint", () => {
    const amberSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "terminal",
            terminal: {
                paint: { preset: "amber" },
            },
        },
    }));
    const cyanVintageSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "terminal",
            terminal: {
                variant: "vintage",
                paint: { preset: "cyan" },
            },
        },
    }));

    assert.equal(amberSettings.paints.primaryMetric.solidColor, "#ffb000");
    assert.equal(amberSettings.paints.primaryText, "#ffd166");
    assert.equal(cyanVintageSettings.paints.primaryMetric.solidColor, "#00b8d8");
    assert.equal(cyanVintageSettings.paints.primaryText, "#5eead4");
});

test("color filled solid mode uses theme background color and neutral foreground paint", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "color-filled",
            flat: {
                paint: {
                    colorMode: "solid",
                    solid: { colors: { usageColor: "#ef4444" } },
                },
            },
            colorFilled: {
                paint: {
                    colorMode: "solid",
                    solid: { color: "#123456" },
                },
            },
        },
    }));

    assert.deepEqual(visualSettings.paints.backgroundFill, {
        fillKind: "solid",
        color: "#123456",
        isGradientEnabled: true,
    });
    assert.deepEqual(visualSettings.paints.primaryMetric, {
        mode: "solid",
        solidColor: "#e6e6e6",
        thresholds: [],
        isGradientEnabled: false,
    });
});

test("color filled default uses the default solid blue background", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "color-filled",
        },
    }));

    assert.deepEqual(visualSettings.paints.backgroundFill, {
        fillKind: "solid",
        color: "#3b82f6",
        isGradientEnabled: true,
    });
});

test("color filled multi-color mode uses soft triangle colors without threshold positions", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        theme: {
            selectedTheme: "color-filled",
            flat: {
                paint: {
                    multiColor: {
                        lowThresholdPercent: 10,
                        highThresholdPercent: 90,
                    },
                },
            },
            colorFilled: {
                paint: {
                    colorMode: "multi-color",
                    multiColor: {
                        colors: {
                            lowColor: "#111111",
                            mediumColor: "#222222",
                            highColor: "#333333",
                        },
                        isGradientEnabled: false,
                    },
                },
            },
        },
    }));

    assert.deepEqual(visualSettings.paints.backgroundFill, {
        fillKind: "soft-triangle",
        lowColor: "#111111",
        mediumColor: "#222222",
        highColor: "#333333",
        isGradientEnabled: false,
    });
});

test("line smoothing and grid options pass through resolved appearance settings", () => {
    const visualSettings = buildMetricRenderAppearance(buildAppearanceSettings({
        line: {
            lineSmoothingPercent: 95,
            gridLineVisibility: "always",
            gridLineType: "vertical",
        },
    }));

    assert.equal(visualSettings.lineSmoothingPercent, 95);
    assert.equal(visualSettings.gridLineVisibility, "always");
    assert.equal(visualSettings.gridLineType, "vertical");
});
