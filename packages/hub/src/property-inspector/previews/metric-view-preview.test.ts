import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCircleVariantPreviewUri,
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
    const metricThemes: readonly MetricTheme[] = ["flat", "cupertino-glass", "color-filled", "terminal"];

    for (const metricTheme of metricThemes) {
        const previewUri = buildMetricThemePreviewUri(metricTheme, buildGpuPreviewInput());

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
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

    return {
        appearance: context.resolved.widget.slot.appearance,
        target: context.resolved.widget.slot.metric.target,
    };
}
