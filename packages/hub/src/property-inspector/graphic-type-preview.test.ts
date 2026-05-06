import assert from "node:assert/strict";
import test from "node:test";
import { buildGraphicTypePreviewUri } from "./graphic-type-preview";
import type { GraphicType } from "../widgets/widget.interface";

test("graphic type preview URIs render every PI graphic option without throwing", () => {
    const graphicTypes: readonly GraphicType[] = ["circular", "linear", "dashed-line"];

    for (const graphicType of graphicTypes) {
        const previewUri = buildGraphicTypePreviewUri(graphicType);

        assert.match(previewUri, /^data:image\/svg\+xml,/);
        assert.ok(decodeURIComponent(previewUri).includes("<svg"));
    }
});
