import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Resvg } from "@resvg/resvg-js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const hubDirectory = resolve(scriptDirectory, "..");
const sampleDirectory = join(hubDirectory, "tmp", "resvg-bench-samples");
const iterationCount = Number.parseInt(process.argv[2] ?? "30", 10);
const resolvedIterationCount = Number.isFinite(iterationCount) && iterationCount > 0
    ? iterationCount
    : 30;
const shouldWriteSamples = process.argv.includes("--write-samples");
const shouldListFonts = process.argv.includes("--list-fonts");

const benchmarkCases = [
    { name: "tiny-rect", svg: buildTinyRectSvg() },
    { name: "text", svg: buildTextSvg() },
    { name: "small-screen-mixed", svg: buildSmallScreenMixedSvg() },
    { name: "sparkline-like", svg: buildSparklineLikeSvg() },
    { name: "i18n-mixed", svg: buildI18nMixedSvg() },
    { name: "i18n-zh", svg: buildI18nZhSvg() },
    { name: "i18n-ja", svg: buildI18nJaSvg() },
    { name: "i18n-ko", svg: buildI18nKoSvg() },
    { name: "i18n-cjk", svg: buildI18nCjkSvg() },
];

console.log([
    "resvg-minimal-benchmark",
    `node=${process.version}`,
    `platform=${process.platform}`,
    `arch=${process.arch}`,
    `iterations=${resolvedIterationCount}`,
    `writeSamples=${String(shouldWriteSamples)}`,
].join(" "));
printExpectationNotes();

for (const benchmarkCase of benchmarkCases) {
    const renderOptions = buildRenderOptions(benchmarkCase.svg);

    for (const options of renderOptions) {
        const summary = runBenchmark({
            caseName: benchmarkCase.name,
            svg: benchmarkCase.svg,
            optionsName: options.name,
            options: options.value,
            fontFiles: options.fontFiles,
            iterationCount: resolvedIterationCount,
        });

        console.log(formatSummary(summary));

        if (shouldListFonts) {
            console.log(formatFontList(benchmarkCase.name, options.name, options.fontFiles));
        }

        if (shouldWriteSamples) {
            writeSamplePng(benchmarkCase, options);
        }
    }
}

function printExpectationNotes() {
    const runtimePrimaryNote = process.platform === "win32"
        ? "Windows runtime primary should match bundled-primary-fonts using Inter."
        : process.platform === "darwin"
            ? "macOS runtime primary should match explicit-system-primary-fonts using SF."
            : "This platform has no runtime primary-font expectation in this benchmark.";

    console.log(`expected ${runtimePrimaryNote}`);
    console.log("expected default-font-loading is intentionally slow baseline; do not use for runtime.");
    console.log("expected no-system-fonts is fastest but can miss text glyphs; use only as control.");
    console.log("expected explicit-detected-fonts should preserve CJK/symbol samples while avoiding full system font scan.");
    console.log("expected samples: English letters, numbers, units, arrows, degree/micro symbols, and CJK text should be visible.");
}

function runBenchmark(parameters) {
    for (let warmupIndex = 0; warmupIndex < 3; warmupIndex += 1) {
        renderOnce(parameters.svg, parameters.options);
    }

    const constructDurations = [];
    const renderDurations = [];
    const asPngDurations = [];
    const totalDurations = [];

    for (let iterationIndex = 0; iterationIndex < parameters.iterationCount; iterationIndex += 1) {
        const sample = renderOnce(parameters.svg, parameters.options);

        constructDurations.push(sample.constructMilliseconds);
        renderDurations.push(sample.renderMilliseconds);
        asPngDurations.push(sample.asPngMilliseconds);
        totalDurations.push(sample.totalMilliseconds);
    }

    return {
        caseName: parameters.caseName,
        optionsName: parameters.optionsName,
        fontFileCount: parameters.fontFiles.length,
        fontFiles: parameters.fontFiles,
        svgByteLength: Buffer.byteLength(parameters.svg, "utf8"),
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
        minimum: sortedDurations[0],
        maximum: sortedDurations[sortedDurations.length - 1],
        p95: sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * 0.95))],
    };
}

function formatSummary(summary) {
    return [
        "case",
        `name=${summary.caseName}`,
        `options=${summary.optionsName}`,
        `fontFiles=${summary.fontFileCount}`,
        `fontBasenames=${summary.fontFiles.map(fontFile => basename(fontFile)).join(",") || "none"}`,
        `svgBytes=${summary.svgByteLength}`,
        `constructAvgMs=${formatDuration(summary.construct.average)}`,
        `constructP95Ms=${formatDuration(summary.construct.p95)}`,
        `constructMaxMs=${formatDuration(summary.construct.maximum)}`,
        `renderAvgMs=${formatDuration(summary.render.average)}`,
        `asPngAvgMs=${formatDuration(summary.asPng.average)}`,
        `totalAvgMs=${formatDuration(summary.total.average)}`,
        `totalP95Ms=${formatDuration(summary.total.p95)}`,
        `totalMaxMs=${formatDuration(summary.total.maximum)}`,
    ].join(" ");
}

function formatFontList(caseName, optionsName, fontFiles) {
    const fontList = fontFiles.length > 0 ? fontFiles.join(";") : "none";

    return `fonts name=${caseName} options=${optionsName} files=${fontList}`;
}

function formatDuration(durationMilliseconds) {
    return durationMilliseconds.toFixed(2);
}

function buildTinyRectSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        '<circle cx="72" cy="72" r="44" fill="#3b82f6"/>',
        "</svg>",
    ].join("");
}

function buildTextSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        buildTextElement({ x: 72, y: 67, fontSize: 31, fontWeight: 850, fill: "#f9fafb", text: "42%" }),
        buildTextElement({ x: 72, y: 92, fontSize: 13, fontWeight: 750, fill: "#9ca3af", text: "CPU" }),
        "</svg>",
    ].join("");
}

function buildSmallScreenMixedSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        buildTextElement({ x: 72, y: 34, fontSize: 14, fontWeight: 800, fill: "#d1d5db", text: "CPU &#28201;&#24230;" }),
        buildTextElement({ x: 72, y: 73, fontSize: 34, fontWeight: 850, fill: "#38bdf8", text: "42&#176;C" }),
        buildTextElement({ x: 72, y: 101, fontSize: 15, fontWeight: 800, fill: "#f9fafb", text: "1.25 MB/s" }),
        buildTextElement({ x: 72, y: 123, fontSize: 12, fontWeight: 750, fill: "#9ca3af", text: "&#8593; 8.4 MB/s  &#956;  &#937;" }),
        "</svg>",
    ].join("");
}

function buildSparklineLikeSvg() {
    const points = Array.from({ length: 60 }, (_, sampleIndex) => {
        const sampleRatio = sampleIndex / 59;
        const valueRatio = 0.5 + Math.sin(sampleRatio * Math.PI * 4) * 0.28;
        const xCoordinate = 10 + sampleRatio * 124;
        const yCoordinate = 102 - valueRatio * 66;
        return `${xCoordinate.toFixed(2)},${yCoordinate.toFixed(2)}`;
    }).join(" ");

    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        "<defs>",
        '<linearGradient id="line-gradient" x1="0%" y1="100%" x2="100%" y2="0%">',
        '<stop offset="0%" stop-color="#22c55e"/>',
        '<stop offset="100%" stop-color="#38bdf8"/>',
        "</linearGradient>",
        '<filter id="line-glow" x="-10%" y="-30%" width="120%" height="160%">',
        '<feGaussianBlur in="SourceGraphic" stdDeviation="1.7" result="blurredLine"/>',
        '<feColorMatrix in="blurredLine" type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.7 0 0 0 0 1 0 0 0 0.7 0"/>',
        "</filter>",
        "</defs>",
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        `<polyline points="${points}" fill="none" stroke="url(#line-gradient)" stroke-width="5" `,
        'stroke-linecap="round" stroke-linejoin="round" filter="url(#line-glow)" opacity="0.55"/>',
        `<polyline points="${points}" fill="none" stroke="url(#line-gradient)" stroke-width="2.5" `,
        'stroke-linecap="round" stroke-linejoin="round"/>',
        buildTextElement({ x: 72, y: 126, fontSize: 17, fontWeight: 850, fill: "#f9fafb", text: "42.0 MB/s" }),
        "</svg>",
    ].join("");
}

function buildI18nMixedSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        buildTextElement({ x: 72, y: 49, fontSize: 16, fontWeight: 850, fill: "#f9fafb", text: "CPU &#28201;&#24230;" }),
        buildTextElement({ x: 72, y: 81, fontSize: 30, fontWeight: 850, fill: "#38bdf8", text: "42&#176;C" }),
        buildTextElement({ x: 72, y: 106, fontSize: 13, fontWeight: 750, fill: "#9ca3af", text: "&#8595; 1.2 MB/s  &#8593; 8.4 MB/s" }),
        "</svg>",
    ].join("");
}

function buildI18nZhSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        buildTextElement({ x: 72, y: 58, fontSize: 18, fontWeight: 850, fill: "#f9fafb", text: "&#32593;&#32476;&#19979;&#36733;" }),
        buildTextElement({ x: 72, y: 92, fontSize: 26, fontWeight: 850, fill: "#38bdf8", text: "42%" }),
        "</svg>",
    ].join("");
}

function buildI18nJaSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        buildTextElement({ x: 72, y: 58, fontSize: 18, fontWeight: 850, fill: "#f9fafb", text: "&#28201;&#24230;&#12514;&#12491;&#12479;" }),
        buildTextElement({ x: 72, y: 92, fontSize: 26, fontWeight: 850, fill: "#38bdf8", text: "42&#176;C" }),
        "</svg>",
    ].join("");
}

function buildI18nKoSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        buildTextElement({ x: 72, y: 58, fontSize: 18, fontWeight: 850, fill: "#f9fafb", text: "&#48176;&#53552;&#47532; &#49324;&#50857;" }),
        buildTextElement({ x: 72, y: 92, fontSize: 26, fontWeight: 850, fill: "#38bdf8", text: "42%" }),
        "</svg>",
    ].join("");
}

function buildI18nCjkSvg() {
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">',
        '<rect width="144" height="144" rx="12" fill="#111827"/>',
        buildTextElement({ x: 72, y: 42, fontSize: 15, fontWeight: 850, fill: "#f9fafb", text: "&#20013;&#25991;" }),
        buildTextElement({ x: 72, y: 68, fontSize: 15, fontWeight: 850, fill: "#f9fafb", text: "&#26085;&#26412;&#35486;&#12514;&#12491;&#12479;" }),
        buildTextElement({ x: 72, y: 94, fontSize: 15, fontWeight: 850, fill: "#f9fafb", text: "&#54620;&#44397;&#50612;" }),
        buildTextElement({ x: 72, y: 120, fontSize: 13, fontWeight: 750, fill: "#9ca3af", text: "&#176;C &#956; &#937; &#8592; &#8594;" }),
        "</svg>",
    ].join("");
}

function buildTextElement(options) {
    return [
        `<text x="${options.x}" y="${options.y}" text-anchor="middle" `,
        'font-family="Inter, SF Pro Display, Segoe UI, sans-serif" ',
        `font-size="${options.fontSize}" font-weight="${options.fontWeight}" `,
        'font-variant-numeric="tabular-nums" ',
        `fill="${options.fill}">${options.text}</text>`,
    ].join("");
}

function buildRenderOptions(svgString) {
    const explicitSystemFontFiles = filterExistingFontFiles(resolveSystemPrimaryFontFileCandidates());
    const bundledPrimaryFontFiles = filterExistingFontFiles(resolveBundledPrimaryFontFileCandidates());
    const detectedFontFiles = filterExistingFontFiles([
        ...resolveRuntimePrimaryFontFileCandidates(),
        ...resolveScriptFontFileCandidates(svgString),
    ]);
    const nativeOptions = [];

    if (explicitSystemFontFiles.length > 0) {
        nativeOptions.push({
            name: "explicit-system-primary-fonts",
            value: buildExplicitFontOptions(explicitSystemFontFiles, resolveSystemPrimaryFontFamily()),
            fontFiles: explicitSystemFontFiles,
        });
    }

    if (bundledPrimaryFontFiles.length > 0) {
        nativeOptions.push({
            name: "bundled-primary-fonts",
            value: buildExplicitFontOptions(bundledPrimaryFontFiles, "Inter"),
            fontFiles: bundledPrimaryFontFiles,
        });
    }

    if (detectedFontFiles.length > 0) {
        nativeOptions.push({
            name: "explicit-detected-fonts",
            value: buildExplicitFontOptions(detectedFontFiles, resolveRuntimePrimaryFontFamily()),
            fontFiles: detectedFontFiles,
        });
    }

    return [
        {
            name: "default-font-loading",
            value: {
                fitTo: { mode: "width", value: 288 },
            },
            fontFiles: [],
        },
        {
            name: "no-system-fonts",
            value: {
                fitTo: { mode: "width", value: 288 },
                font: {
                    loadSystemFonts: false,
                    defaultFontFamily: "Arial",
                    sansSerifFamily: "Arial",
                },
            },
            fontFiles: [],
        },
        ...nativeOptions,
    ];
}

function buildExplicitFontOptions(fontFiles, defaultFontFamily) {
    return {
        fitTo: { mode: "width", value: 288 },
        font: {
            loadSystemFonts: false,
            fontFiles,
            defaultFontFamily,
            sansSerifFamily: defaultFontFamily,
        },
    };
}

function resolveSystemPrimaryFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\segoeui.ttf",
                "C:\\Windows\\Fonts\\seguisb.ttf",
                "C:\\Windows\\Fonts\\segoeuib.ttf",
                "C:\\Windows\\Fonts\\seguibl.ttf",
                "C:\\Windows\\Fonts\\seguisym.ttf",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/SFNS.ttf",
                "/System/Library/Fonts/SFNSDisplay.ttf",
                "/System/Library/Fonts/SFNSRounded.ttf",
                "/System/Library/Fonts/Apple Symbols.ttf",
                "/System/Library/Fonts/Supplemental/Arial.ttf",
            ];
        default:
            return [];
    }
}

function resolveBundledPrimaryFontFileCandidates() {
    return [
        join(hubDirectory, "assets", "fonts", "inter", "InterVariable.ttf"),
        join(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf"),
        join(process.cwd(), "packages", "hub", "assets", "fonts", "inter", "InterVariable.ttf"),
        ...resolvePlatformSymbolFontFileCandidates(),
    ];
}

function resolveRuntimePrimaryFontFileCandidates() {
    return process.platform === "win32"
        ? resolveBundledPrimaryFontFileCandidates()
        : resolveSystemPrimaryFontFileCandidates();
}

function resolveScriptFontFileCandidates(svgString) {
    const visibleText = extractVisibleSvgText(svgString);
    const fontFiles = [];

    if (containsHanCharacters(visibleText)) {
        fontFiles.push(...resolveHanFontFileCandidates());
    }

    if (containsJapaneseKanaCharacters(visibleText)) {
        fontFiles.push(...resolveJapaneseFontFileCandidates());
    }

    if (containsHangulCharacters(visibleText)) {
        fontFiles.push(...resolveKoreanFontFileCandidates());
    }

    if (containsSymbolFallbackCharacters(visibleText)) {
        fontFiles.push(...resolvePlatformSymbolFontFileCandidates());
    }

    return fontFiles;
}

function resolveHanFontFileCandidates() {
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

function resolveJapaneseFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\meiryo.ttc",
                "C:\\Windows\\Fonts\\meiryob.ttc",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/\u30d2\u30e9\u30ae\u30ce\u89d2\u30b4\u30b7\u30c3\u30af W3.ttc",
                "/System/Library/Fonts/\u30d2\u30e9\u30ae\u30ce\u89d2\u30b4\u30b7\u30c3\u30af W6.ttc",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [];
    }
}

function resolveKoreanFontFileCandidates() {
    switch (process.platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\malgun.ttf",
                "C:\\Windows\\Fonts\\malgunbd.ttf",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/AppleSDGothicNeo.ttc",
                "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        default:
            return [];
    }
}

function resolvePlatformSymbolFontFileCandidates() {
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

function resolveSystemPrimaryFontFamily() {
    switch (process.platform) {
        case "win32":
            return "Segoe UI";
        case "darwin":
            return "SF Pro Display";
        default:
            return "Arial";
    }
}

function resolveRuntimePrimaryFontFamily() {
    return process.platform === "win32" ? "Inter" : resolveSystemPrimaryFontFamily();
}

function filterExistingFontFiles(fontFiles) {
    return Array.from(new Set(fontFiles)).filter(fontFile => existsSync(fontFile));
}

function extractVisibleSvgText(svgString) {
    const visibleTextFragments = [];
    const cleanedSvgString = svgString.replace(/<!--[\s\S]*?-->/g, "");
    const textElementPattern = /<(text|tspan)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let textElementMatch;

    while ((textElementMatch = textElementPattern.exec(cleanedSvgString)) !== null) {
        visibleTextFragments.push(decodeXmlText(textElementMatch[2].replace(/<[^>]*>/g, "")));
    }

    return visibleTextFragments.join(" ");
}

function decodeXmlText(text) {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, codePointHexadecimal) => {
            return decodeCodePoint(Number.parseInt(codePointHexadecimal, 16));
        })
        .replace(/&#([0-9]+);/g, (_, codePointDecimal) => {
            return decodeCodePoint(Number.parseInt(codePointDecimal, 10));
        })
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function decodeCodePoint(codePoint) {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return "";
    }

    return String.fromCodePoint(codePoint);
}

function containsHanCharacters(text) {
    return /\p{Script_Extensions=Han}/u.test(text);
}

function containsJapaneseKanaCharacters(text) {
    return /\p{Script_Extensions=Hiragana}|\p{Script_Extensions=Katakana}/u.test(text);
}

function containsHangulCharacters(text) {
    return /\p{Script_Extensions=Hangul}/u.test(text);
}

function containsSymbolFallbackCharacters(text) {
    return /[\u00b0\u03bc\u03a9\u2190-\u21ff\u2200-\u22ff]/u.test(text);
}

function writeSamplePng(benchmarkCase, options) {
    mkdirSync(sampleDirectory, { recursive: true });

    const resvgInstance = new Resvg(benchmarkCase.svg, options.value);
    const renderedImage = resvgInstance.render();
    const pngBuffer = renderedImage.asPng();
    const sampleFileName = [
        process.platform,
        benchmarkCase.name,
        options.name,
    ].join("-");

    writeFileSync(join(sampleDirectory, `${sampleFileName}.png`), pngBuffer);
}
