import assert from "node:assert/strict";
import test from "node:test";
import {
    buildCircleStylePreviewUri,
    buildGraphicTypePreviewUri,
    buildMetricThemePreviewUri,
    buildTerminalVariantPreviewUri,
    type MetricPreviewInput,
} from "./metric-option-preview";
import type { CircleStyle, SingleMetricViewLayout } from "../inspector/settings-types";
import type { MetricTheme, TerminalThemeVariant } from "../../settings/resolved-settings";
import { buildVisibilityContext } from "../testing/test-context";

test("graphic type preview URIs render every Property Inspector graphic option without throwing", () => {
    const graphicTypes: readonly SingleMetricViewLayout[] = ["circular", "text", "linear", "sparkline"];

    for (const graphicType of graphicTypes) {
        const previewUri = buildGraphicTypePreviewUri(graphicType);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("graphic type preview uses the active metric target", () => {
    const previewUri = buildGraphicTypePreviewUri("circular", buildGpuPreviewInput());
    const svg = decodeURIComponent(previewUri);

    assert.match(svg, />GPU</);
    assert.doesNotMatch(svg, />CPU</);
});

test("circle style preview URIs render every Property Inspector circle style without throwing", () => {
    const circleStyles: readonly CircleStyle[] = ["value", "compact", "gauge"];

    for (const circleStyle of circleStyles) {
        const previewUri = buildCircleStylePreviewUri(circleStyle);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("metric theme preview URIs render every Property Inspector graphic style without throwing", () => {
    const metricThemes: readonly MetricTheme[] = ["flat", "cupertino-glass", "color-filled", "terminal"];

    for (const metricTheme of metricThemes) {
        const previewUri = buildMetricThemePreviewUri(metricTheme, buildGpuPreviewInput());

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("terminal variant preview URIs render every terminal style without throwing", () => {
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
