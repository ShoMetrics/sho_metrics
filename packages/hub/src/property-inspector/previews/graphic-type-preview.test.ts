import assert from "node:assert/strict";
import test from "node:test";
import { buildCircleStylePreviewUri } from "./circle-style-preview";
import { buildGraphicTypePreviewUri } from "./graphic-type-preview";
import type { CircleStyle, GraphicType } from "../inspector/settings-types";

test("graphic type preview URIs render every Property Inspector graphic option without throwing", () => {
    const graphicTypes: readonly GraphicType[] = ["circular", "text", "linear", "dashed-line"];

    for (const graphicType of graphicTypes) {
        const previewUri = buildGraphicTypePreviewUri(graphicType);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});

test("circle style preview URIs render every Property Inspector circle style without throwing", () => {
    const circleStyles: readonly CircleStyle[] = ["value", "compact", "gauge"];

    for (const circleStyle of circleStyles) {
        const previewUri = buildCircleStylePreviewUri(circleStyle);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});
