import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
    clearResvgFontOptionsCacheForTests,
    detectBundledFontFamiliesFromSvg,
    detectFontScriptsFromSvg,
    extractVisibleSvgText,
    resolveResvgFontOptions,
    type ResvgFontResolverEnvironment,
} from "./resvg-font-options";

const BUNDLED_INTER_FONT_FILE = "C:\\Plugin\\assets\\fonts\\inter\\InterVariable.ttf";
const BUNDLED_SHARE_TECH_MONO_FONT_FILE = "C:\\Plugin\\assets\\fonts\\share-tech-mono\\ShareTechMono-Regular.ttf";
const MACOS_HELVETICA_NEUE_FONT_FILE = "/System/Library/Fonts/HelveticaNeue.ttc";

// Keep these tests hermetic. They simulate Windows/macOS font availability
// instead of reading real OS font files, whose presence and load cost vary by machine.
beforeEach(() => {
    clearResvgFontOptionsCacheForTests();
});

test("font script detection keeps English SVG on primary fonts only", () => {
    assert.deepEqual(detectFontScriptsFromSvg(buildTextSvg("CPU 42%")), []);
});

test("bundled font family detection finds terminal font-family usage", () => {
    const svgString = [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        '<text font-family="\'Share Tech Mono\',Inter">40%</text>',
        "</svg>",
    ].join("");

    assert.deepEqual(detectBundledFontFamiliesFromSvg(svgString), ["share-tech-mono"]);
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

test("font options load terminal bundled fonts before primary fonts when SVG asks for them", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvgWithFontFamily("CPU", "'Share Tech Mono','Inter'"),
        buildEnvironment({
            platform: "win32",
            bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
            bundledShareTechMonoFontFile: BUNDLED_SHARE_TECH_MONO_FONT_FILE,
            existingFontFiles: [
                BUNDLED_INTER_FONT_FILE,
                BUNDLED_SHARE_TECH_MONO_FONT_FILE,
                "C:\\Windows\\Fonts\\seguisym.ttf",
            ],
        }),
    );

    assert.deepEqual(fontOptions.fontFiles, [
        BUNDLED_SHARE_TECH_MONO_FONT_FILE,
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

test("font options degrade safely when Windows CJK fallback font files are missing", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvg("&#32593;&#32476;&#19979;&#36733;"),
        buildEnvironment({
            platform: "win32",
            bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
            existingFontFiles: [
                BUNDLED_INTER_FONT_FILE,
                "C:\\Windows\\Fonts\\seguisym.ttf",
            ],
        }),
    );

    assert.deepEqual(fontOptions.fontFiles, [
        BUNDLED_INTER_FONT_FILE,
        "C:\\Windows\\Fonts\\seguisym.ttf",
    ]);
});

test("font options degrade safely when bundled Inter is missing on Windows", () => {
    const fontOptions = resolveResvgFontOptions(buildTextSvg("CPU"), buildEnvironment({
        platform: "win32",
        bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
        existingFontFiles: [
            "C:\\Windows\\Fonts\\seguisym.ttf",
        ],
    }));

    assert.equal(fontOptions.defaultFontFamily, "Inter");
    assert.deepEqual(fontOptions.fontFiles, [
        "C:\\Windows\\Fonts\\seguisym.ttf",
    ]);
});

test("font options use bundled Inter as the Linux primary font for visual tests", () => {
    const fontOptions = resolveResvgFontOptions(buildTextSvg("CPU"), buildEnvironment({
        platform: "linux",
        bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
        existingFontFiles: [
            BUNDLED_INTER_FONT_FILE,
        ],
    }));

    assert.equal(fontOptions.defaultFontFamily, "Inter");
    assert.deepEqual(fontOptions.fontFiles, [
        BUNDLED_INTER_FONT_FILE,
    ]);
});

test("font options add terminal fonts and bundled Inter on Linux", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvgWithFontFamily("CPU", "'Share Tech Mono','Inter'"),
        buildEnvironment({
            platform: "linux",
            bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
            bundledShareTechMonoFontFile: BUNDLED_SHARE_TECH_MONO_FONT_FILE,
            existingFontFiles: [
                BUNDLED_INTER_FONT_FILE,
                BUNDLED_SHARE_TECH_MONO_FONT_FILE,
            ],
        }),
    );

    assert.deepEqual(fontOptions.fontFiles, [
        BUNDLED_SHARE_TECH_MONO_FONT_FILE,
        BUNDLED_INTER_FONT_FILE,
    ]);
});

test("font options add only detected macOS Hangul fallback font files", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvg("&#48176;&#53552;&#47532; &#49324;&#50857;"),
        buildEnvironment({
            platform: "darwin",
            bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
            existingFontFiles: [
                MACOS_HELVETICA_NEUE_FONT_FILE,
                BUNDLED_INTER_FONT_FILE,
                "/System/Library/Fonts/PingFang.ttc",
                "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            ],
        }),
    );

    assert.equal(fontOptions.loadSystemFonts, false);
    assert.equal(fontOptions.defaultFontFamily, "SF Pro Display");
    assert.deepEqual(fontOptions.fontFiles, [
        MACOS_HELVETICA_NEUE_FONT_FILE,
        BUNDLED_INTER_FONT_FILE,
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ]);
});

test("font options degrade safely to bundled Inter when macOS primary and CJK fallback files are missing", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvg("&#48176;&#53552;&#47532; &#49324;&#50857;"),
        buildEnvironment({
            platform: "darwin",
            bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
            existingFontFiles: [
                BUNDLED_INTER_FONT_FILE,
            ],
        }),
    );

    assert.equal(fontOptions.defaultFontFamily, "SF Pro Display");
    assert.deepEqual(fontOptions.fontFiles, [
        BUNDLED_INTER_FONT_FILE,
    ]);
});

test("font options add macOS symbol fallback fonts only when visible text needs symbols", () => {
    const fontOptions = resolveResvgFontOptions(
        buildTextSvg("&#8592; &#8594;"),
        buildEnvironment({
            platform: "darwin",
            bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
            existingFontFiles: [
                MACOS_HELVETICA_NEUE_FONT_FILE,
                BUNDLED_INTER_FONT_FILE,
                "/System/Library/Fonts/Apple Symbols.ttf",
            ],
        }),
    );

    assert.deepEqual(fontOptions.fontFiles, [
        MACOS_HELVETICA_NEUE_FONT_FILE,
        BUNDLED_INTER_FONT_FILE,
        "/System/Library/Fonts/Apple Symbols.ttf",
    ]);
});

test("font option cache avoids repeated font existence checks for the same platform and scripts", () => {
    const checkedFontFiles: string[] = [];
    const environment = buildEnvironment({
        platform: "win32",
        bundledInterFontFile: BUNDLED_INTER_FONT_FILE,
        existingFontFiles: [
            BUNDLED_INTER_FONT_FILE,
            "C:\\Windows\\Fonts\\seguisym.ttf",
            "C:\\Windows\\Fonts\\msyh.ttc",
        ],
        onFileExists: fontFile => checkedFontFiles.push(fontFile),
    });

    resolveResvgFontOptions(buildTextSvg("&#32593;&#32476;&#19979;&#36733;"), environment);
    const firstCheckCount = checkedFontFiles.length;
    resolveResvgFontOptions(buildTextSvg("&#20013;&#25991;"), environment);

    assert.equal(firstCheckCount > 0, true);
    assert.equal(checkedFontFiles.length, firstCheckCount);
});

function buildTextSvg(text: string): string {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        `<text>${text}</text>`,
        "</svg>",
    ].join("");
}

function buildTextSvgWithFontFamily(text: string, fontFamily: string): string {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        `<text font-family="${fontFamily}">${text}</text>`,
        "</svg>",
    ].join("");
}

function buildEnvironment(options: {
    platform: NodeJS.Platform;
    existingFontFiles: readonly string[];
    bundledInterFontFile?: string;
    bundledShareTechMonoFontFile?: string;
    onFileExists?: (fontFile: string) => void;
}): ResvgFontResolverEnvironment {
    const existingFontFileSet = new Set(options.existingFontFiles);

    return {
        platform: options.platform,
        bundledInterFontFile: options.bundledInterFontFile,
        bundledShareTechMonoFontFile: options.bundledShareTechMonoFontFile,
        fileExists: (fontFile: string) => {
            options.onFileExists?.(fontFile);
            return existingFontFileSet.has(fontFile);
        },
    };
}
