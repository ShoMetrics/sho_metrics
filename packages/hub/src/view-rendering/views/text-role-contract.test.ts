import assert from "node:assert/strict";
import { test } from "vitest";
import { renderDualMetricBodyView } from "./dual-metric-view";
import { renderSingleMetricBodyView } from "./single-metric-view";
import { DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS, type MetricRenderAppearance } from "../color/render-appearance";
import { DEFAULT_RENDER_THEME_EFFECT_TOKENS } from "../rasterize/render-svg-effects";
import { DEFAULT_RENDER_TEXT_STYLES, type RenderTextStyles } from "../rasterize/render-text-style";
import type { DualChannelWidgetData, WidgetData } from "../widget-data";

/*
 * Locks the RenderTextStyles invariants against the views that select roles.
 *
 * Snapshots cannot do this. A role is only visible in a rendered pixel when the
 * preset gives it a distinct treatment, and the default preset gives `heading`
 * and `label` the same family and the same weight. That is why views picking
 * the wrong one of the two went unnoticed for months: nothing looked different.
 *
 * So this gives all five roles a family no other role has, then asks which
 * family governs a known string. The question is always "which WidgetData field
 * is this text", never "where did it land" or "how big is it".
 *
 * Scope is the two roles this vocabulary reassigned. Value and unit are already
 * pinned by the paint token tests next door and by the visual snapshots.
 */
const ROLE_FONT_FAMILIES = {
    value: "Role Value Font",
    unit: "Role Unit Font",
    heading: "Role Heading Font",
    label: "Role Label Font",
    footnote: "Role Footnote Font",
} as const satisfies Record<keyof RenderTextStyles, string>;

/*
 * Short on purpose. Title card caps its code column at four characters and its
 * channel names at two, and a fixture long enough to be truncated would make
 * these assertions about truncation rather than about roles.
 */
const KEY_NAME_TEXT = "NETX";
const POSITIVE_CHANNEL_TEXT = "PX";
const SECONDARY_TEXT = "SECONDARY";
const SINGLE_RENDER_SIZE = { width: 144, height: 144 } as const;
const DUAL_RENDER_SIZE = { width: 200, height: 100 } as const;

test("every single metric view renders data.label through the heading role", () => {
    const testCases = [
        { name: "bar", renderPrimitive: "bar" as const },
        { name: "sparkline", renderPrimitive: "sparkline" as const },
        { name: "circle full-ring", renderPrimitive: "circle" as const, circleVariant: "full-ring" as const },
        { name: "circle gauge", renderPrimitive: "circle" as const, circleVariant: "gauge" as const },
        { name: "text centered", renderPrimitive: "text" as const, textVariant: "centered" as const },
        { name: "text title-card", renderPrimitive: "text" as const, textVariant: "title-card" as const },
    ];

    for (const testCase of testCases) {
        const svg = renderSingleMetricBodyView({
            data: buildWidgetData(),
            visual: {
                ...buildMetricRenderAppearance(),
                renderPrimitive: testCase.renderPrimitive,
                textVariant: testCase.textVariant ?? "centered",
            },
            renderSize: SINGLE_RENDER_SIZE,
            centerIcon: "",
            topIcon: "",
            circleVariant: testCase.circleVariant ?? "full-ring",
        });

        assert.equal(
            resolveFontFamilyGoverning(svg, KEY_NAME_TEXT),
            ROLE_FONT_FAMILIES.heading,
            `single ${testCase.name} renders data.label through the wrong role`,
        );
    }
});

test("the bar secondary row renders through the footnote role", () => {
    const svg = renderSingleMetricBodyView({
        data: { ...buildWidgetData(), secondaryDisplayValue: SECONDARY_TEXT },
        visual: { ...buildMetricRenderAppearance(), renderPrimitive: "bar" },
        renderSize: SINGLE_RENDER_SIZE,
        centerIcon: "",
        topIcon: "",
        circleVariant: "full-ring",
    });

    assert.equal(resolveFontFamilyGoverning(svg, SECONDARY_TEXT), ROLE_FONT_FAMILIES.footnote);
});

// Circle is absent because it names neither the key nor the channels; it
// carries channel identity in color alone. Title card is absent because it sets
// the key name one character per element, which this text lookup cannot follow.
test("dual metric views that name the key render it through the heading role", () => {
    for (const renderPrimitive of ["sparkline", "text"] as const) {
        const svg = renderDualMetricBodyView(buildDualMetricProps({ renderPrimitive }));

        assert.equal(
            resolveFontFamilyGoverning(svg, KEY_NAME_TEXT),
            ROLE_FONT_FAMILIES.heading,
            `dual ${renderPrimitive} renders the key name through the wrong role`,
        );
    }
});

// The role that separates "what this key is" from "which of its readings this
// is". Both text variants name the channels; the chart primitives do not.
test("dual metric views that name each channel render it through the label role", () => {
    for (const textVariant of ["centered", "title-card"] as const) {
        const svg = renderDualMetricBodyView(buildDualMetricProps({ renderPrimitive: "text", textVariant }));

        assert.equal(
            resolveFontFamilyGoverning(svg, POSITIVE_CHANNEL_TEXT),
            ROLE_FONT_FAMILIES.label,
            `dual text ${textVariant} renders a channel name through the wrong role`,
        );
    }
});

/**
 * Returns the font family in force where `text` is painted.
 *
 * Renderers put `font-family` on the `text` element or on an inner `tspan`, so
 * this walks back to the nearest preceding declaration: the lazy quantifier
 * stops at the first candidate that can reach the text, and the lookahead stops
 * it from stepping over a nearer one.
 */
function resolveFontFamilyGoverning(svg: string, text: string): string | undefined {
    const governingFontFamilyPattern = new RegExp(
        `font-family="([^"]+)"(?:(?!font-family=)[\\s\\S])*?>${text}<`,
    );

    return governingFontFamilyPattern.exec(svg)?.[1];
}

function buildDualMetricProps(options: {
    renderPrimitive: "circle" | "text" | "sparkline";
    textVariant?: "centered" | "title-card";
}) {
    return {
        data: buildDualChannelData(),
        visual: {
            ...buildMetricRenderAppearance(),
            textVariant: options.textVariant ?? ("centered" as const),
        },
        renderPrimitive: options.renderPrimitive,
        renderSize: DUAL_RENDER_SIZE,
        titleText: KEY_NAME_TEXT,
        chartMode: "overlay" as const,
        centerContent: "value" as const,
        circleVariant: "full-ring" as const,
        topIcon: "",
        positive: { labelText: POSITIVE_CHANNEL_TEXT, unitText: "M", color: "#3b82f6" },
        negative: { labelText: "NX", unitText: "M", color: "#ef4444" },
    };
}

function buildMetricRenderAppearance(): MetricRenderAppearance {
    return {
        renderPrimitive: "circle",
        circleVariant: "full-ring",
        textVariant: "centered",
        themePreset: "flat",
        paintConstraint: "none",
        paints: {
            background: "#background-token",
            backgroundFill: undefined,
            surface: "#surface-token",
            primaryText: "#primary-text-token",
            secondaryText: "#secondary-text-token",
            mutedText: "#muted-text-token",
            icon: "#icon-token",
            barTitleText: "#bar-title-text-token",
            metricValueText: "#metric-value-text-token",
            barValueText: "#bar-value-text-token",
            barUnitText: "#bar-unit-text-token",
            barSecondaryText: "#bar-secondary-text-token",
            primaryMetric: {
                mode: "solid",
                solidColor: "#metric-token",
                thresholds: [],
                isGradientEnabled: false,
            },
            track: "#track-token",
            grid: "#grid-token",
            divider: "#divider-token",
        },
        textStyles: buildRoleTaggedTextStyles(),
        themeEffects: DEFAULT_RENDER_THEME_EFFECT_TOKENS,
        transparentSurface: DEFAULT_RENDER_TRANSPARENT_SURFACE_TOKENS,
        lineSmoothingPercent: 75,
        gridLineVisibility: "adaptive",
        gridLineType: "horizontal",
    };
}

function buildRoleTaggedTextStyles(): RenderTextStyles {
    return {
        value: { ...DEFAULT_RENDER_TEXT_STYLES.value, fontFamily: ROLE_FONT_FAMILIES.value },
        unit: { ...DEFAULT_RENDER_TEXT_STYLES.unit, fontFamily: ROLE_FONT_FAMILIES.unit },
        heading: { ...DEFAULT_RENDER_TEXT_STYLES.heading, fontFamily: ROLE_FONT_FAMILIES.heading },
        label: { ...DEFAULT_RENDER_TEXT_STYLES.label, fontFamily: ROLE_FONT_FAMILIES.label },
        footnote: { ...DEFAULT_RENDER_TEXT_STYLES.footnote, fontFamily: ROLE_FONT_FAMILIES.footnote },
    };
}

function buildWidgetData(): WidgetData {
    return {
        label: KEY_NAME_TEXT,
        current: 42,
        progress: 0.42,
        history: [10, 25, 42],
        unit: "%",
        displayValue: "42",
        sampleTimestampMilliseconds: 1,
    };
}

function buildDualChannelData(): DualChannelWidgetData {
    return {
        positive: { ...buildWidgetData(), label: POSITIVE_CHANNEL_TEXT, displayValue: "12", unit: "MB/s" },
        negative: { ...buildWidgetData(), label: "NX", displayValue: "4", unit: "MB/s" },
    };
}
