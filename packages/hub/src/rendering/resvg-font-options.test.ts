import assert from "node:assert/strict";
import test from "node:test";
import {
    detectFontScriptsFromSvg,
    extractVisibleSvgText,
    resolveResvgFontOptions,
    type ResvgFontResolverEnvironment,
} from "./resvg-font-options";

const BUNDLED_INTER_FONT_FILE = "C:\\Plugin\\assets\\fonts\\inter\\InterVariable.ttf";

test("font script detection keeps English SVG on primary fonts only", () => {
    assert.deepEqual(detectFontScriptsFromSvg(buildTextSvg("CPU 42%")), []);
});

test("font script detection detects Han Kana Hangul and symbols from visible text", () => {
    assert.deepEqual(detectFontScriptsFromSvg(buildTextSvg("&#32593;&#32476;&#19979;&#36733;")), ["han"]);
    assert.deepEqual(detectFontScriptsFromSvg(buildTextSvg("&#28201;&#24230;&#12514;&#12491;&#12479;")), ["han", "kana"]);
    assert.deepEqual(detectFontScriptsFromSvg(buildTextSvg("&#48176;&#53552;&#47532; &#49324;&#50857;")), ["hangul"]);
    assert.deepEqual(detectFontScriptsFromSvg(buildTextSvg("&#176;C &#956; &#937; &#8592; &#8594;")), ["symbol"]);
});

test("font script detection ignores non-visible SVG comments and path data", () => {
    const svgString = [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        "<!-- &#32593;&#32476;&#19979;&#36733; -->",
        '<path id="&#32593;&#32476;&#19979;&#36733;" d="M0 0 L10 10"/>',
        "<text>CPU</text>",
        "</svg>",
    ].join("");

    assert.deepEqual(detectFontScriptsFromSvg(svgString), []);
});

test("visible SVG text extraction handles tspan text and XML entities", () => {
    const svgString = [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        "<text>",
        '<tspan>&#x7f51;&#32476;</tspan>',
        '<tspan>&#8592; &amp; &#956;</tspan>',
        "</text>",
        "</svg>",
    ].join("");

    assert.equal(extractVisibleSvgText(svgString), "\u7f51\u7edc\u2190 & \u03bc");
    assert.deepEqual(detectFontScriptsFromSvg(svgString), ["han", "symbol"]);
});

test("font options disable system fonts and load bundled Inter on Windows", () => {
    const fontOptions = resolveResvgFontOptions(buildTextSvg("CPU"), buildEnvironment({
        platform: "win32",
        bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
        existingFontFiles: [
            BUNDLED_INTER_FONT_FILE,
            "C:\\Windows\\Fonts\\seguisym.ttf",
        ],
    }));

    assert.equal(fontOptions.loadSystemFonts, false);
    assert.equal(fontOptions.defaultFontFamily, "Inter");
    assert.deepEqual(fontOptions.fontFiles, [
        BUNDLED_INTER_FONT_FILE,
        "C:\\Windows\\Fonts\\seguisym.ttf",
    ]);
});

test("font options add only detected Windows CJK fallback font files", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvg("&#28201;&#24230;&#12514;&#12491;&#12479;"),
        buildEnvironment({
            platform: "win32",
            bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
            existingFontFiles: [
                BUNDLED_INTER_FONT_FILE,
                "C:\\Windows\\Fonts\\seguisym.ttf",
                "C:\\Windows\\Fonts\\msyh.ttc",
                "C:\\Windows\\Fonts\\meiryo.ttc",
                "C:\\Windows\\Fonts\\malgun.ttf",
            ],
        }),
    );

    assert.deepEqual(fontOptions.fontFiles, [
        BUNDLED_INTER_FONT_FILE,
        "C:\\Windows\\Fonts\\seguisym.ttf",
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:\\Windows\\Fonts\\meiryo.ttc",
    ]);
});

test("font options add only detected macOS Hangul fallback font files", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvg("&#48176;&#53552;&#47532; &#49324;&#50857;"),
        buildEnvironment({
            platform: "darwin",
            existingFontFiles: [
                "/System/Library/Fonts/SFNS.ttf",
                "/System/Library/Fonts/PingFang.ttc",
                "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            ],
        }),
    );

    assert.equal(fontOptions.defaultFontFamily, "SF Pro Display");
    assert.deepEqual(fontOptions.fontFiles, [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ]);
});

function buildTextSvg(text: string): string {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        `<text>${text}</text>`,
        "</svg>",
    ].join("");
}

function buildEnvironment(options: {
    platform: NodeJS.Platform;
    existingFontFiles: readonly string[];
    bundledInterFontFile?: string;
}): ResvgFontResolverEnvironment {
    const existingFontFileSet = new Set(options.existingFontFiles);

    return {
        platform: options.platform,
        bundledInterFontFile: options.bundledInterFontFile,
        fileExists: (fontFile: string) => existingFontFileSet.has(fontFile),
    };
}
