import assert from "node:assert/strict";
import test from "node:test";
import {
    adjustHexColorBrightness,
    clamp,
    escapeSvgText,
    renderConstrainedSvgText,
} from "./svg-utils";

test("SVG text escaping covers XML-sensitive characters", () => {
    assert.equal(
        escapeSvgText(`CPU <GPU> "hot" & 'fast'`),
        "CPU &lt;GPU&gt; &quot;hot&quot; &amp; &apos;fast&apos;",
    );
});

test("clamp constrains values inside the inclusive range", () => {
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(11, 0, 10), 10);
});

test("constrained SVG text sanitizes ids, escapes text attributes, and preserves clip bounds", () => {
    const svgFragment = renderConstrainedSvgText({
        id: "disk label:root",
        text: `<System & Apps>`,
        xCoordinate: 72,
        yCoordinate: 42,
        maxWidth: -10,
        fontSize: 18,
        fill: `#fff" onclick="bad`,
        fontFamily: `"Inter" & Test`,
        fontWeight: "bold",
        textAnchor: "middle",
        extraAttributes: ["font-variant-numeric=\"tabular-nums\""],
    });

    assert.match(svgFragment, /clipPath id="disk-label-root"/);
    assert.match(svgFragment, /width="1"/);
    assert.match(svgFragment, /x="71\.50"/);
    assert.match(svgFragment, /&lt;System &amp; Apps&gt;/);
    assert.match(svgFragment, /font-family="&quot;Inter&quot; &amp; Test"/);
    assert.match(svgFragment, /fill="#fff&quot; onclick=&quot;bad"/);
    assert.match(svgFragment, /font-variant-numeric="tabular-nums"/);
});

test("hex color brightness adjusts valid colors and leaves invalid colors unchanged", () => {
    assert.equal(adjustHexColorBrightness("#000000", 50), "#808080");
    assert.equal(adjustHexColorBrightness("#808080", -50), "#404040");
    assert.equal(adjustHexColorBrightness("not-a-color", 50), "not-a-color");
});
