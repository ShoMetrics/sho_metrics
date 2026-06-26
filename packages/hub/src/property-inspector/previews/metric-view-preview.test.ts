import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildCircleVariantPreviewUri,
    buildDenseMetricThemePreviewUri,
    buildMetricViewPreviewUri,
    buildMetricThemePreviewUri,
    buildTerminalVariantPreviewUri,
    buildTextVariantPreviewUri,
    type MetricPreviewInput,
} from "./metric-option-preview";
import type { CircleViewVariant, MetricView, TextViewVariant } from "../inspector/settings-types";
import type {
    MetricTheme,
    TerminalThemeVariant,
} from "../../settings/resolved-settings";
import { requireResolvedSingleMetricWidget } from "../../settings/resolved-settings";
import { MetricUnit } from "../../runtime/sources/metric-source";
import { buildDefaultAppearanceSettings } from "../../settings/default-appearance-settings";
import { buildVisibilityContext } from "../testing/test-context";

test("metric view preview URIs render every Property Inspector view option without throwing", () => {
    const metricViews: readonly MetricView[] = ["circle", "text", "bar", "line"];

    for (const metricView of metricViews) {
        const previewUri = buildMetricViewPreviewUri(metricView);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("metric view preview uses the active metric target", () => {
    const previewUri = buildMetricViewPreviewUri("circle", buildGpuPreviewInput());
    const svg = decodeURIComponent(previewUri);

    assert.match(svg, />GPU</);
    assert.doesNotMatch(svg, />CPU</);
});

test("metric view preview uses catalog metric icons", () => {
    const previewUri = buildCircleVariantPreviewUri("minimal", buildCatalogPreviewInput());
    const svg = decodeURIComponent(previewUri);

    assert.match(svg, /<path d="M14 4v10\.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/);
    assert.match(svg, /<rect x="4" y="4" width="16" height="16" rx="2" \/>/);
    assert.match(svg, /<rect x="8" y="8" width="8" height="8" rx="1" \/>/);
});

test("circle variant preview URIs render every Property Inspector circle variant without throwing", () => {
    const circleVariants: readonly CircleViewVariant[] = ["full-ring", "minimal", "gauge"];

    for (const circleVariant of circleVariants) {
        const previewUri = buildCircleVariantPreviewUri(circleVariant);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("text variant preview URIs render every Property Inspector text variant without throwing", () => {
    const textVariants: readonly TextViewVariant[] = ["centered", "title-card"];

    for (const textVariant of textVariants) {
        const previewUri = buildTextVariantPreviewUri(textVariant);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("metric theme preview URIs render every Property Inspector theme without throwing", () => {
    const metricThemes: readonly MetricTheme[] = [
        "flat",
        "cupertino-glass",
        "color-filled",
        "terminal",
        "pixel-window",
    ];

    for (const metricTheme of metricThemes) {
        const previewUri = buildMetricThemePreviewUri(metricTheme, buildGpuPreviewInput());

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("dense metric theme preview renders dense rows instead of the single metric default", () => {
    const previewUri = buildDenseMetricThemePreviewUri("flat", {
        appearance: buildDefaultAppearanceSettings(),
        data: {
            rows: [
                buildDensePreviewRow("preview-cpu", "CPU", 45),
                buildDensePreviewRow("preview-gpu", "GPU", 68),
                buildDensePreviewRow("preview-ram", "RAM", 72),
            ],
        },
    });
    const svg = decodeURIComponent(previewUri);

    assert.match(svg, />GPU</);
    assert.match(svg, />RAM</);
    assert.doesNotMatch(svg, /<circle[\s\S]*>CPU</);
});

test("terminal variant preview URIs render every terminal variant without throwing", () => {
    const terminalVariants: readonly TerminalThemeVariant[] = ["clean", "vintage"];

    for (const terminalVariant of terminalVariants) {
        const previewUri = buildTerminalVariantPreviewUri(terminalVariant, buildGpuPreviewInput());

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

function buildGpuPreviewInput(): MetricPreviewInput {
    const context = buildVisibilityContext({ actionKind: "gpu" });
    const slot = requireResolvedSingleMetricWidget(context.resolved).slot;

    return {
        appearance: slot.appearance,
        target: slot.metric.target,
    };
}

function buildCatalogPreviewInput(): MetricPreviewInput {
    return {
        appearance: buildDefaultAppearanceSettings(),
        target: {
            domain: "catalog",
            metricId: "catalog.cpu.temperature",
            detectedLabel: "CPU Package",
            detectedUnit: MetricUnit.CELSIUS,
            detectedCategory: "cpu",
            detectedReadingKind: "temperature",
            customLabel: undefined,
            customMaximumValue: undefined,
            customIconId: undefined,
        },
    };
}

function buildDensePreviewRow(slotId: string, label: string, current: number) {
    return {
        rowKind: "configured" as const,
        slotId,
        metricKey: slotId,
        widgetData: {
            current,
            progress: current / 100,
            history: [],
            unit: "%",
            label,
            displayValue: current.toFixed(0),
            sampleTimestampMilliseconds: 1,
        },
    };
}
