import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Resvg } from "@resvg/resvg-js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const hubDirectory = resolve(scriptDirectory, "../..");
const iterationCount = resolveIterationCount(process.argv[2]);

const japaneseSerifFontFamily = [
    "'Yu Mincho'",
    "'YuMincho'",
    "'Hiragino Mincho ProN'",
    "'Hiragino Mincho Pro'",
    "'Noto Serif CJK JP'",
    "'Noto Serif JP'",
    "'Source Han Serif JP'",
    "'Source Han Serif'",
    "'IPAexMincho'",
    "'IPAMincho'",
    "'BIZ UDMincho'",
    "'BIZ UDPMincho'",
    "'MS Mincho'",
    "'MS PMincho'",
    "'Songti SC'",
    "'SimSun'",
    "'MingLiU'",
    "serif",
].join(",");

const benchmarkCases = [
    {
        name: "title-card-square-single",
        svg: buildTitleCardSquareSingleSvg(),
        width: 120,
    },
    {
        name: "title-card-square-network",
        svg: buildTitleCardSquareNetworkSvg(),
        width: 120,
    },
    {
        name: "title-card-wide-network",
        svg: buildTitleCardWideNetworkSvg(),
        width: 200,
    },
];

const fontOptionCases = [
    {
        name: "previous-title-card-candidates",
        fontFiles: resolvePreviousTitleCardFontFiles(),
    },
    {
        name: "current-title-card-candidates",
        fontFiles: resolveCurrentTitleCardFontFiles(),
    },
];

console.log([
    "resvg-title-card-font-benchmark",
    `node=${process.version}`,
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `iterations=${iterationCount}`,
].join(" "));

for (const fontOptionCase of fontOptionCases) {
    console.log(formatFontList(fontOptionCase));
}

for (const benchmarkCase of benchmarkCases) {
    for (const fontOptionCase of fontOptionCases) {
        const summary = runBenchmark({
            svg: benchmarkCase.svg,
            width: benchmarkCase.width,
            fontFiles: fontOptionCase.fontFiles,
            iterationCount,
        });

        console.log(formatSummary({
            caseName: benchmarkCase.name,
            optionName: fontOptionCase.name,
            fontFiles: fontOptionCase.fontFiles,
            svgByteLength: Buffer.byteLength(benchmarkCase.svg, "utf8"),
            summary,
        }));
    }
}

function runBenchmark(parameters) {
    const options = {
        fitTo: { mode: "width", value: parameters.width },
        font: {
            loadSystemFonts: false,
            fontFiles: parameters.fontFiles,
            defaultFontFamily: resolveRuntimePrimaryFontFamily(),
            sansSerifFamily: resolveRuntimePrimaryFontFamily(),
        },
    };

    for (let warmupIndex = 0; warmupIndex < 5; warmupIndex += 1) {
        renderOnce(parameters.svg, options);
    }

    const constructDurations = [];
    const renderDurations = [];
    const asPngDurations = [];
    const totalDurations = [];

    for (let iterationIndex = 0; iterationIndex < parameters.iterationCount; iterationIndex += 1) {
        const sample = renderOnce(parameters.svg, options);

        constructDurations.push(sample.constructMilliseconds);
        renderDurations.push(sample.renderMilliseconds);
        asPngDurations.push(sample.asPngMilliseconds);
        totalDurations.push(sample.totalMilliseconds);
    }

    return {
        construct: summarizeDurations(constructDurations),
        render: summarizeDurations(renderDurations),
        asPng: summarizeDurations(asPngDurations),
        total: summarizeDurations(totalDurations),
    };
}

function renderOnce(svgString, options) {
    const startTimeMilliseconds = performance.now();
    const resvgInstance = new Resvg(svgString, options);
    const constructEndTimeMilliseconds = performance.now();
    const renderedImage = resvgInstance.render();
    const renderEndTimeMilliseconds = performance.now();
    renderedImage.asPng();
    const asPngEndTimeMilliseconds = performance.now();

    return {
        constructMilliseconds: constructEndTimeMilliseconds - startTimeMilliseconds,
        renderMilliseconds: renderEndTimeMilliseconds - constructEndTimeMilliseconds,
        asPngMilliseconds: asPngEndTimeMilliseconds - renderEndTimeMilliseconds,
        totalMilliseconds: asPngEndTimeMilliseconds - startTimeMilliseconds,
    };
}

function summarizeDurations(durations) {
    const sortedDurations = [...durations].sort((leftDuration, rightDuration) => leftDuration - rightDuration);
    const totalMilliseconds = durations.reduce(
        (durationTotal, durationMilliseconds) => durationTotal + durationMilliseconds,
        0,
    );

    return {
        average: totalMilliseconds / durations.length,
        p50: percentile(sortedDurations, 0.5),
        p95: percentile(sortedDurations, 0.95),
        maximum: sortedDurations[sortedDurations.length - 1] ?? 0,
    };
}

function percentile(sortedDurations, percentileRatio) {
    if (sortedDurations.length === 0) {
        return 0;
    }

    return sortedDurations[Math.min(
        sortedDurations.length - 1,
        Math.floor(sortedDurations.length * percentileRatio),
    )];
}

function formatSummary(result) {
    return [
        "case",
        `name=${result.caseName}`,
        `options=${result.optionName}`,
        `fontFiles=${result.fontFiles.length}`,
        `fontBasenames=${result.fontFiles.map(fontFile => basename(fontFile)).join(",") || "none"}`,
        `svgBytes=${result.svgByteLength}`,
        `constructAvgMs=${formatDuration(result.summary.construct.average)}`,
        `constructP50Ms=${formatDuration(result.summary.construct.p50)}`,
        `constructP95Ms=${formatDuration(result.summary.construct.p95)}`,
        `constructMaxMs=${formatDuration(result.summary.construct.maximum)}`,
        `renderAvgMs=${formatDuration(result.summary.render.average)}`,
        `asPngAvgMs=${formatDuration(result.summary.asPng.average)}`,
        `totalAvgMs=${formatDuration(result.summary.total.average)}`,
        `totalP50Ms=${formatDuration(result.summary.total.p50)}`,
        `totalP95Ms=${formatDuration(result.summary.total.p95)}`,
        `totalMaxMs=${formatDuration(result.summary.total.maximum)}`,
    ].join(" ");
}

function formatFontList(fontOptionCase) {
    const fontList = fontOptionCase.fontFiles.length > 0
        ? fontOptionCase.fontFiles.join(";")
        : "none";

    return `fonts options=${fontOptionCase.name} files=${fontList}`;
}

function formatDuration(durationMilliseconds) {
    return durationMilliseconds.toFixed(2);
}

function resolveIterationCount(value) {
    const parsedValue = Number.parseInt(value ?? "120", 10);

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 120;
}

function resolvePreviousTitleCardFontFiles() {
    return filterExistingFontFiles([
        ...resolvePrimaryFontFileCandidates(),
        ...resolvePreviousTitleCardSerifFontFileCandidates(),
        ...resolvePreviousHanFontFileCandidates(),
        ...resolvePreviousSymbolFontFileCandidates(),
    ]);
}

function resolveCurrentTitleCardFontFiles() {
    const japaneseSerifFontFiles = resolveCurrentJapaneseSerifFontFiles();

    return filterExistingFontFiles([
        ...resolvePrimaryFontFileCandidates(),
        ...japaneseSerifFontFiles,
        ...(japaneseSerifFontFiles.length > 0 ? [] : resolveCurrentHanFontFileCandidates()),
        ...resolveCurrentSymbolFontFileCandidates(),
    ]);
}

function resolvePrimaryFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                join(hubDirectory, "assets", "fonts", "inter", "InterVariable.ttf"),
                "C:\\Windows\\Fonts\\seguisym.ttf",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/HelveticaNeue.ttc",
                join(hubDirectory, "assets", "fonts", "inter", "InterVariable.ttf"),
            ];
        default:
            return [
                join(hubDirectory, "assets", "fonts", "inter", "InterVariable.ttf"),
            ];
    }
}

function resolvePreviousTitleCardSerifFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\yumin.ttf",
                "C:\\Windows\\Fonts\\yumindb.ttf",
                "C:\\Windows\\Fonts\\msmincho.ttc",
                "C:\\Windows\\Fonts\\BIZ-UDMinchoM.ttc",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/\u30d2\u30e9\u30ae\u30ce\u660e\u671d ProN.ttc",
                "/System/Library/Fonts/Supplemental/\u30d2\u30e9\u30ae\u30ce\u660e\u671d ProN.ttc",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [];
    }
}

function resolveCurrentJapaneseSerifFontFiles() {
    const preferredFontFiles = filterExistingFontFiles(resolveCurrentJapaneseSerifPreferredFontFileCandidates());

    if (preferredFontFiles.length > 0) {
        return preferredFontFiles;
    }

    return filterExistingFontFiles(resolveCurrentJapaneseSerifFallbackFontFileCandidates());
}

function resolveCurrentJapaneseSerifPreferredFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\yuminl.ttf",
                "C:\\Windows\\Fonts\\yumin.ttf",
                "C:\\Windows\\Fonts\\yumindb.ttf",
                "C:\\Windows\\Fonts\\BIZ-UDMinchoM.ttc",
                "C:\\Windows\\Fonts\\msmincho.ttc",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/\u30d2\u30e9\u30ae\u30ce\u660e\u671d ProN.ttc",
                "/System/Library/Fonts/Supplemental/\u30d2\u30e9\u30ae\u30ce\u660e\u671d ProN.ttc",
                "/System/Library/Fonts/Supplemental/\u30d2\u30e9\u30ae\u30ce\u660e\u671d Pro.ttc",
            ];
        default:
            return [
                "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc",
                "/usr/share/fonts/opentype/noto/NotoSerifCJKjp-Regular.otf",
                "/usr/share/fonts/opentype/noto/NotoSerifCJKjp-Bold.otf",
                "/usr/share/fonts/truetype/noto/NotoSerifCJK-Regular.ttc",
                "/usr/share/fonts/opentype/source-han-serif/SourceHanSerif-Regular.ttc",
                "/usr/share/fonts/opentype/source-han-serif/SourceHanSerifJP-Regular.otf",
                "/usr/share/fonts/opentype/ipaexfont-mincho/ipaexm.ttf",
                "/usr/share/fonts/opentype/ipafont-mincho/ipam.ttf",
                "/usr/share/fonts/truetype/fonts-japanese-mincho.ttf",
            ];
    }
}

function resolveCurrentJapaneseSerifFallbackFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\simsun.ttc",
                "C:\\Windows\\Fonts\\mingliu.ttc",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/Supplemental/Songti.ttc",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
            ];
    }
}

function resolvePreviousHanFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\msyh.ttc",
                "C:\\Windows\\Fonts\\msyhbd.ttc",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/PingFang.ttc",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [];
    }
}

function resolveCurrentHanFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\msyh.ttc",
                "C:\\Windows\\Fonts\\msyhbd.ttc",
                "C:\\Windows\\Fonts\\simsun.ttc",
                "C:\\Windows\\Fonts\\mingliu.ttc",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/PingFang.ttc",
                "/System/Library/Fonts/Supplemental/Songti.ttc",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/source-han-sans/SourceHanSans-Regular.ttc",
                "/usr/share/fonts/opentype/source-han-sans/SourceHanSansJP-Regular.otf",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
                "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
            ];
    }
}

function resolvePreviousSymbolFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return ["C:\\Windows\\Fonts\\seguisym.ttf"];
        case "darwin":
            return [
                "/System/Library/Fonts/Apple Symbols.ttf",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [];
    }
}

function resolveCurrentSymbolFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return ["C:\\Windows\\Fonts\\seguisym.ttf"];
        case "darwin":
            return [
                "/System/Library/Fonts/Apple Symbols.ttf",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/noto/NotoSansSymbols-Regular.ttf",
                "/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf",
            ];
    }
}

function resolveRuntimePrimaryFontFamily() {
    switch (process.platform) {
        case "darwin":
            return "SF Pro Display";
        default:
            return "Inter";
    }
}

function filterExistingFontFiles(fontFiles) {
    return Array.from(new Set(fontFiles)).filter(fontFile => existsSync(fontFile));
}

function buildTitleCardSquareSingleSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">',
        '<rect width="120" height="120" rx="14" fill="#0b0b0b"/>',
        buildTextElement({ id: "code", x: 8, y: 18, fontSize: 28, text: "CPU" }),
        buildScaledTextElement({ id: "cap-0", x: 8, y: 51, fontSize: 48, xScale: 0.56, yScale: 0.50, text: "&#20351;" }),
        buildScaledTextElement({ id: "cap-1", x: 8, y: 82, fontSize: 48, xScale: 0.56, yScale: 0.50, text: "&#29992;" }),
        buildScaledTextElement({ id: "cap-2", x: 8, y: 112, fontSize: 48, xScale: 0.56, yScale: 0.50, text: "&#29575;" }),
        buildTextElement({ id: "value", x: 94, y: 105, fontSize: 52, anchor: "end", text: "91" }),
        buildTextElement({ id: "unit", x: 103, y: 108, fontSize: 16, text: "%" }),
        "</svg>",
    ].join("");
}

function buildTitleCardSquareNetworkSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">',
        '<rect width="120" height="120" rx="14" fill="#0b0b0b"/>',
        buildTextElement({ id: "code", x: 8, y: 18, fontSize: 28, text: "NET" }),
        buildScaledTextElement({ id: "cap-0", x: 8, y: 51, fontSize: 48, xScale: 0.56, yScale: 0.50, text: "&#36578;" }),
        buildScaledTextElement({ id: "cap-1", x: 8, y: 82, fontSize: 48, xScale: 0.56, yScale: 0.50, text: "&#36865;" }),
        buildScaledTextElement({ id: "cap-2", x: 8, y: 112, fontSize: 48, xScale: 0.56, yScale: 0.50, text: "&#36895;" }),
        buildTextElement({ id: "up-label", x: 46, y: 82, fontSize: 13, text: "&#8593;" }),
        buildTextElement({ id: "up-value", x: 99, y: 82, fontSize: 30, anchor: "end", text: "999" }),
        buildTextElement({ id: "up-unit", x: 107, y: 90, fontSize: 12, text: "M" }),
        buildTextElement({ id: "down-label", x: 46, y: 112, fontSize: 13, text: "&#8595;" }),
        buildTextElement({ id: "down-value", x: 99, y: 112, fontSize: 30, anchor: "end", text: "888" }),
        buildTextElement({ id: "down-unit", x: 107, y: 120, fontSize: 12, text: "M" }),
        "</svg>",
    ].join("");
}

function buildTitleCardWideNetworkSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">',
        '<rect width="200" height="100" rx="8" fill="#0b0b0b"/>',
        buildTextElement({ id: "code-0", x: 8, y: 13, fontSize: 18, text: "N" }),
        buildTextElement({ id: "code-1", x: 24, y: 13, fontSize: 18, text: "E" }),
        buildTextElement({ id: "code-2", x: 40, y: 13, fontSize: 18, text: "T" }),
        buildScaledTextElement({ id: "cap-0", x: 8, y: 36, fontSize: 40, xScale: 0.58, yScale: 0.52, text: "&#36578;" }),
        buildScaledTextElement({ id: "cap-1", x: 8, y: 62, fontSize: 40, xScale: 0.58, yScale: 0.52, text: "&#36865;" }),
        buildScaledTextElement({ id: "cap-2", x: 8, y: 88, fontSize: 40, xScale: 0.58, yScale: 0.52, text: "&#36895;" }),
        buildTextElement({ id: "up-label", x: 56, y: 60, fontSize: 13, text: "&#8593;" }),
        buildTextElement({ id: "up-value", x: 139, y: 60, fontSize: 32, anchor: "end", text: "999" }),
        buildTextElement({ id: "up-unit", x: 144, y: 68, fontSize: 13, text: "M" }),
        buildTextElement({ id: "down-label", x: 56, y: 89, fontSize: 13, text: "&#8595;" }),
        buildTextElement({ id: "down-value", x: 139, y: 89, fontSize: 32, anchor: "end", text: "888" }),
        buildTextElement({ id: "down-unit", x: 144, y: 97, fontSize: 13, text: "M" }),
        "</svg>",
    ].join("");
}

function buildTextElement(options) {
    const anchor = options.anchor ?? "start";

    return [
        `<text id="${options.id}" x="${options.x}" y="${options.y}" text-anchor="${anchor}" `,
        `font-family="${japaneseSerifFontFamily}" font-size="${options.fontSize}" font-weight="900" `,
        'font-variant-numeric="tabular-nums" fill="#f8f8f8">',
        options.text,
        "</text>",
    ].join("");
}

function buildScaledTextElement(options) {
    const origin = `${options.x} ${options.y}`;

    return [
        `<text id="${options.id}" x="${options.x}" y="${options.y}" text-anchor="start" `,
        `font-family="${japaneseSerifFontFamily}" font-size="${options.fontSize}" font-weight="900" `,
        `transform="translate(${origin}) scale(${options.xScale} ${options.yScale}) translate(${-options.x} ${-options.y})" `,
        'stroke="#f8f8f8" stroke-width="0.6" paint-order="stroke fill" fill="#f8f8f8">',
        options.text,
        "</text>",
    ].join("");
}
