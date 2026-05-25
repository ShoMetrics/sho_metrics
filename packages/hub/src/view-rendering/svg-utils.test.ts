import assert from "node:assert/strict";
import test from "node:test";
import {
    adjustHexColorBrightness,
    clamp,
    escapeSvgText,
    renderConstrainedSvgText,
    renderStyledSvgText,
    resolveSvgTextFit,
    sanitizeSvgId,
} from "./svg-utils";
import { DEFAULT_RENDER_TEXT_STYLES } from "./render-text-style";

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

test("styled SVG text with neutral metrics matches constrained SVG text", () => {
    const textStyle = DEFAULT_RENDER_TEXT_STYLES.label;
    const styledText = renderStyledSvgText({
        id: "neutral-title",
        text: "CPU",
        xCoordinate: 42,
        yCoordinate: 30,
        maxWidth: 87,
        baseFontSize: 18,
        fill: "#fff",
        textStyle,
    });
    const constrainedText = renderConstrainedSvgText({
        id: "neutral-title",
        text: "CPU",
        xCoordinate: 42,
        yCoordinate: 30,
        maxWidth: 87,
        fontSize: 18,
        fill: "#fff",
        fontFamily: textStyle.fontFamily,
        fontWeight: textStyle.fontWeight,
        clipHeightEm: textStyle.clipHeightEm,
        fitOptions: {
            minimumFontScale: textStyle.minimumFontScale,
            widthScale: textStyle.widthScale,
        },
    });

    assert.equal(styledText, constrainedText);
});

test("styled SVG text applies positive and negative baseline shifts", () => {
    const textStyle = DEFAULT_RENDER_TEXT_STYLES.label;
    const positiveShiftText = renderStyledSvgText({
        id: "positive-baseline",
        text: "CPU",
        xCoordinate: 42,
        yCoordinate: 30,
        maxWidth: 87,
        baseFontSize: 18,
        fill: "#fff",
        textStyle: {
            ...textStyle,
            baselineShiftEm: 0.15,
        },
    });
    const negativeShiftText = renderStyledSvgText({
        id: "negative-baseline",
        text: "CPU",
        xCoordinate: 42,
        yCoordinate: 30,
        maxWidth: 87,
        baseFontSize: 18,
        fill: "#fff",
        textStyle: {
            ...textStyle,
            baselineShiftEm: -0.15,
        },
    });

    assert.equal(readTextYCoordinate(positiveShiftText), 32.7);
    assert.equal(readTextYCoordinate(negativeShiftText), 27.3);
});

test("styled SVG text applies clip height without changing font size", () => {
    const styledText = renderStyledSvgText({
        id: "clip-height",
        text: "CPU",
        xCoordinate: 42,
        yCoordinate: 30,
        maxWidth: 120,
        baseFontSize: 20,
        fill: "#fff",
        textStyle: {
            ...DEFAULT_RENDER_TEXT_STYLES.label,
            clipHeightEm: 2,
        },
    });

    assert.match(styledText, /height="40"/);
    assert.match(styledText, /font-size="20"/);
});

test("SVG text fitting applies width scale before the guard ratio", () => {
    const roomyFit = resolveSvgTextFit({
        runs: [{ text: "Net Speed", fontSize: 18, fontWeight: 850 }],
        maxWidth: 87,
        fitOptions: { widthScale: 0.5 },
    });
    const strictFit = resolveSvgTextFit({
        runs: [{ text: "Net Speed", fontSize: 18, fontWeight: 850 }],
        maxWidth: 87,
        fitOptions: { widthScale: 2 },
    });

    assert.equal(roomyFit.textLength, null);
    assert.equal(strictFit.textLength, 87);
    assert.ok(strictFit.fontScale < roomyFit.fontScale);
});

test("SVG text fitting clamps minimum font scale to safe bounds", () => {
    const belowRangeFit = resolveSvgTextFit({
        runs: [{ text: "VeryLongTelemetryLabel", fontSize: 20, fontWeight: 900 }],
        maxWidth: 1,
        fitOptions: { minimumFontScale: -1 },
    });
    const aboveRangeFit = resolveSvgTextFit({
        runs: [{ text: "VeryLongTelemetryLabel", fontSize: 20, fontWeight: 900 }],
        maxWidth: 1,
        fitOptions: { minimumFontScale: 2 },
    });

    assert.equal(belowRangeFit.fontScale, 0.35);
    assert.equal(aboveRangeFit.fontScale, 1);
});

test("hex color brightness adjusts valid colors and leaves invalid colors unchanged", () => {
    assert.equal(adjustHexColorBrightness("#000000", 50), "#808080");
    assert.equal(adjustHexColorBrightness("#808080", -50), "#404040");
    assert.equal(adjustHexColorBrightness("not-a-color", 50), "not-a-color");
});

function readTextYCoordinate(svgFragment: string): number {
    const match = /<text[^>]*\sy="([^"]+)"/u.exec(svgFragment);
    assert.ok(match);

    const yCoordinate = match[1];
    assert.notEqual(yCoordinate, undefined);

    return Number(yCoordinate);
}
