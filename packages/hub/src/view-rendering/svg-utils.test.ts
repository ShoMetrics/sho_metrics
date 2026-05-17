import assert from "node:assert/strict";
import test from "node:test";
import {
    adjustHexColorBrightness,
    clamp,
    escapeSvgText,
    renderConstrainedSvgText,
    sanitizeSvgId,
} from "./svg-utils";

test("SVG text escaping covers XML-sensitive characters", () => {
    assert.equal(escapeSvgText(`CPU <GPU> "hot" & 'fast'`), "CPU &lt;GPU&gt; &quot;hot&quot; &amp; &apos;fast&apos;");
});

test("clamp constrains values inside the inclusive range", () => {
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(11, 0, 10), 10);
});

test("SVG id sanitization preserves caller fallback ids", () => {
    assert.equal(sanitizeSvgId("disk label:root", "fallback-id"), "disk-label-root");
    assert.equal(sanitizeSvgId(":::", "fallback-id"), "---");
    assert.equal(sanitizeSvgId("", "fallback-id"), "fallback-id");
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

test("constrained SVG text shrinks near-boundary labels instead of clipping them", () => {
    const svgFragment = renderConstrainedSvgText({
        id: "linear-title",
        text: "Net Speed",
        xCoordinate: 42,
        yCoordinate: 30,
        maxWidth: 87,
        fontSize: 18,
        fill: "#fff",
        fontFamily: "Inter",
        fontWeight: 850,
    });

    assert.match(svgFragment, /font-size="17\.[0-9]+"/);
    assert.match(svgFragment, /textLength="87" lengthAdjust="spacingAndGlyphs"/);
});

test("constrained SVG text leaves clearly short labels at their original size", () => {
    const svgFragment = renderConstrainedSvgText({
        id: "short-title",
        text: "CPU",
        xCoordinate: 42,
        yCoordinate: 30,
        maxWidth: 87,
        fontSize: 18,
        fill: "#fff",
        fontFamily: "Inter",
        fontWeight: 850,
    });

    assert.match(svgFragment, /font-size="18"/);
    assert.doesNotMatch(svgFragment, /textLength=/);
});

test("hex color brightness adjusts valid colors and leaves invalid colors unchanged", () => {
    assert.equal(adjustHexColorBrightness("#000000", 50), "#808080");
    assert.equal(adjustHexColorBrightness("#808080", -50), "#404040");
    assert.equal(adjustHexColorBrightness("not-a-color", 50), "not-a-color");
});
