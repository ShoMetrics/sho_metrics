import { existsSync } from "node:fs";
import path from "node:path";
import type { ResvgRenderOptions } from "@resvg/resvg-js";
import { JAPANESE_SERIF_RENDER_FONT_FAMILY } from "./render-text-style";

export type FontScript = "han" | "kana" | "hangul" | "symbol";
export type BundledFontFamily = "share-tech-mono" | "dotgothic16";

export interface ResvgFontResolverEnvironment {
    platform: NodeJS.Platform;
    fileExists: (fontFile: string) => boolean;
    bundledInterFontFile?: string;
    bundledShareTechMonoFontFile?: string;
    bundledDotGothic16FontFile?: string;
    /**
     * Bundled fallback for title-card Japanese serif text when no preferred
     * system Japanese serif font file is available.
     */
    bundledJapaneseSerifFontFile?: string;
    /**
     * Whether deterministic visual tests should use the bundled Japanese serif
     * font before system candidates. Production rendering should leave this
     * unset so user machines keep their system Japanese serif rendering.
     */
    preferBundledJapaneseSerifFont?: boolean;
}

const DEFAULT_FONT_RESOLVER_ENVIRONMENT: ResvgFontResolverEnvironment = {
    platform: process.platform,
    fileExists: existsSync,
    bundledInterFontFile: resolveBundledFontFile("inter", "InterVariable.ttf"),
    bundledShareTechMonoFontFile: resolveBundledFontFile("share-tech-mono", "ShareTechMono-Regular.ttf"),
    bundledDotGothic16FontFile: resolveBundledFontFile("dotgothic16", "DotGothic16-Regular.ttf"),
    bundledJapaneseSerifFontFile: resolveBundledFontFile("biz-udpmincho", "BIZUDPMincho-Regular.ttf"),
};

const fontFileCacheByKey = new Map<string, readonly string[]>();
const fontOptionsCacheByKey = new Map<string, NonNullable<ResvgRenderOptions["font"]>>();

const HAN_SCRIPT_PATTERN = /\p{Script_Extensions=Han}/u;
const HIRAGANA_SCRIPT_PATTERN = /\p{Script_Extensions=Hiragana}/u;
const KATAKANA_SCRIPT_PATTERN = /\p{Script_Extensions=Katakana}/u;
const HANGUL_SCRIPT_PATTERN = /\p{Script_Extensions=Hangul}/u;
const SYMBOL_FALLBACK_PATTERN = /[\u00b0\u03bc\u03a9\u2190-\u21ff\u2200-\u22ff]/u;
const JAPANESE_SERIF_FONT_FAMILY_PATTERN = new RegExp([
    "Yu\\s*Mincho",
    "Hiragino Mincho",
    "Noto Serif(?: CJK)? JP",
    "Source Han Serif(?: JP)?",
    "IPAexMincho",
    "IPAMincho",
    "BIZ UDP?Mincho",
    "MS P?Mincho",
    "Songti SC",
    "SimSun",
    "MingLiU",
].join("|"), "iu");

/**
 * Builds resvg font options without system-wide font loading.
 *
 * Windows and Linux use vendored Inter as the primary Latin UI font for stable
 * small-screen rendering and CI snapshots. macOS keeps SF Pro as the primary
 * family and loads resolvable preinstalled fonts with bundled Inter as the
 * final Latin fallback. CJK fallback fonts are added only when visible SVG text
 * needs them.
 */
export function resolveResvgFontOptions(
    svgString: string,
    environment = DEFAULT_FONT_RESOLVER_ENVIRONMENT,
): NonNullable<ResvgRenderOptions["font"]> {
    const scriptList = detectFontScriptsFromSvg(svgString);
    const bundledFontFamilyList = detectBundledFontFamiliesFromSvg(svgString);
    const usesJapaneseSerifFontFamily = usesJapaneseSerifRenderFontFamily(svgString);
    const cacheKey = [
        environment.platform,
        environment.bundledInterFontFile ?? "",
        environment.bundledShareTechMonoFontFile ?? "",
        environment.bundledDotGothic16FontFile ?? "",
        environment.bundledJapaneseSerifFontFile ?? "",
        environment.preferBundledJapaneseSerifFont ? "prefer-bundled-japanese-serif" : "",
        usesJapaneseSerifFontFamily ? "japanese-serif" : "",
        ...bundledFontFamilyList,
        ...scriptList,
    ].join("|");
    const cachedFontOptions = fontOptionsCacheByKey.get(cacheKey);

    if (cachedFontOptions) {
        return cachedFontOptions;
    }

    const fontFiles = resolveFontFiles(scriptList, bundledFontFamilyList, usesJapaneseSerifFontFamily, environment);
    const fontOptions: NonNullable<ResvgRenderOptions["font"]> = {
        loadSystemFonts: false,
        fontFiles: [...fontFiles],
        defaultFontFamily: resolvePrimaryFontFamily(environment.platform),
        sansSerifFamily: resolvePrimaryFontFamily(environment.platform),
    };

    fontOptionsCacheByKey.set(cacheKey, fontOptions);
    return fontOptions;
}

export function detectFontScriptsFromSvg(svgString: string): readonly FontScript[] {
    const visibleText = extractVisibleSvgText(svgString);
    const scriptList: FontScript[] = [];

    if (HAN_SCRIPT_PATTERN.test(visibleText)) {
        scriptList.push("han");
    }

    if (HIRAGANA_SCRIPT_PATTERN.test(visibleText) || KATAKANA_SCRIPT_PATTERN.test(visibleText)) {
        scriptList.push("kana");
    }

    if (HANGUL_SCRIPT_PATTERN.test(visibleText)) {
        scriptList.push("hangul");
    }

    if (SYMBOL_FALLBACK_PATTERN.test(visibleText)) {
        scriptList.push("symbol");
    }

    return scriptList;
}

export function detectBundledFontFamiliesFromSvg(svgString: string): readonly BundledFontFamily[] {
    const bundledFontFamilyList: BundledFontFamily[] = [];

    if (/\bShare Tech Mono\b/iu.test(svgString)) {
        bundledFontFamilyList.push("share-tech-mono");
    }

    if (/\bDotGothic16\b/iu.test(svgString)) {
        bundledFontFamilyList.push("dotgothic16");
    }

    return bundledFontFamilyList;
}

export function usesJapaneseSerifRenderFontFamily(svgString: string): boolean {
    return svgString.includes(JAPANESE_SERIF_RENDER_FONT_FAMILY)
        || JAPANESE_SERIF_FONT_FAMILY_PATTERN.test(svgString);
}

export function clearResvgFontOptionsCacheForTests(): void {
    fontFileCacheByKey.clear();
    fontOptionsCacheByKey.clear();
}

export function extractVisibleSvgText(svgString: string): string {
    const visibleTextFragments: string[] = [];
    const cleanedSvgString = svgString.replace(/<!--[\s\S]*?-->/g, "");
    const textElementPattern = /<(text|tspan)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let textElementMatch: RegExpExecArray | null;

    while ((textElementMatch = textElementPattern.exec(cleanedSvgString)) !== null) {
        visibleTextFragments.push(decodeXmlText(textElementMatch[2].replace(/<[^>]*>/g, "")));
    }

    return visibleTextFragments.join(" ");
}

function resolveFontFiles(
    scriptList: readonly FontScript[],
    bundledFontFamilyList: readonly BundledFontFamily[],
    usesJapaneseSerifFontFamily: boolean,
    environment: ResvgFontResolverEnvironment,
): readonly string[] {
    const cacheKey = [
        environment.platform,
        environment.bundledInterFontFile ?? "",
        environment.bundledShareTechMonoFontFile ?? "",
        environment.bundledDotGothic16FontFile ?? "",
        environment.bundledJapaneseSerifFontFile ?? "",
        environment.preferBundledJapaneseSerifFont ? "prefer-bundled-japanese-serif" : "",
        usesJapaneseSerifFontFamily ? "japanese-serif" : "",
        ...bundledFontFamilyList,
        ...scriptList,
    ].join("|");
    const cachedFontFiles = fontFileCacheByKey.get(cacheKey);

    if (cachedFontFiles) {
        return cachedFontFiles;
    }

    const japaneseSerifFontFiles = usesJapaneseSerifFontFamily
        ? resolveJapaneseSerifFontFiles(environment)
        : [];
    const scriptFontList = japaneseSerifFontFiles.length > 0
        ? scriptList.filter(fontScript => fontScript !== "han" && fontScript !== "kana")
        : scriptList;
    const fontFiles = Array.from(new Set([
        ...bundledFontFamilyList.flatMap(fontFamily => resolveBundledFontFileCandidates(fontFamily, environment)),
        ...resolvePrimaryFontFileCandidates(environment),
        ...japaneseSerifFontFiles,
        ...scriptFontList.flatMap(fontScript => resolveFontFileCandidatesForScript(fontScript, environment.platform)),
    ])).filter(fontFile => environment.fileExists(fontFile));

    fontFileCacheByKey.set(cacheKey, fontFiles);
    return fontFiles;
}

function resolveFontFileCandidatesForScript(fontScript: FontScript, platform: NodeJS.Platform): readonly string[] {
    switch (fontScript) {
        case "han":
            return resolveHanFontFileCandidates(platform);
        case "kana":
            return resolveKanaFontFileCandidates(platform);
        case "hangul":
            return resolveHangulFontFileCandidates(platform);
        case "symbol":
            return resolveSymbolFontFileCandidates(platform);
    }
}

function resolveBundledFontFileCandidates(
    bundledFontFamily: BundledFontFamily,
    environment: ResvgFontResolverEnvironment,
): readonly string[] {
    switch (bundledFontFamily) {
        case "share-tech-mono":
            return [environment.bundledShareTechMonoFontFile]
                .filter((fontFile): fontFile is string => Boolean(fontFile));
        case "dotgothic16":
            return [environment.bundledDotGothic16FontFile]
                .filter((fontFile): fontFile is string => Boolean(fontFile));
    }
}

function resolvePrimaryFontFileCandidates(environment: ResvgFontResolverEnvironment): readonly string[] {
    switch (environment.platform) {
        case "win32":
            return [
                environment.bundledInterFontFile,
                "C:\\Windows\\Fonts\\seguisym.ttf",
            ].filter((fontFile): fontFile is string => Boolean(fontFile));
        case "darwin":
            return [
                "/System/Library/Fonts/HelveticaNeue.ttc",
                environment.bundledInterFontFile,
            ].filter((fontFile): fontFile is string => Boolean(fontFile));
        default:
            return [environment.bundledInterFontFile]
                .filter((fontFile): fontFile is string => Boolean(fontFile));
    }
}

function resolveHanFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
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
        case "linux":
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
        default:
            return [];
    }
}

function resolveKanaFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\meiryo.ttc",
                "C:\\Windows\\Fonts\\meiryob.ttc",
                "C:\\Windows\\Fonts\\msgothic.ttc",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/\u30d2\u30e9\u30ae\u30ce\u89d2\u30b4\u30b7\u30c3\u30af W3.ttc",
                "/System/Library/Fonts/\u30d2\u30e9\u30ae\u30ce\u89d2\u30b4\u30b7\u30c3\u30af W6.ttc",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        case "linux":
            return [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
                "/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf",
                "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
            ];
        default:
            return [];
    }
}

function resolveJapaneseSerifFontFiles(environment: ResvgFontResolverEnvironment): readonly string[] {
    const bundledFontFiles = resolveBundledJapaneseSerifFontFileCandidates(environment);

    if (environment.preferBundledJapaneseSerifFont && bundledFontFiles.length > 0) {
        return bundledFontFiles;
    }

    const preferredFontFiles = resolveJapaneseSerifPreferredFontFileCandidates(environment.platform)
        .filter(fontFile => environment.fileExists(fontFile));

    if (preferredFontFiles.length > 0) {
        return preferredFontFiles;
    }

    const fallbackFontFiles = resolveJapaneseSerifFallbackFontFileCandidates(environment.platform)
        .filter(fontFile => environment.fileExists(fontFile));

    if (fallbackFontFiles.length > 0) {
        return fallbackFontFiles;
    }

    return bundledFontFiles;
}

function resolveBundledJapaneseSerifFontFileCandidates(environment: ResvgFontResolverEnvironment): readonly string[] {
    const fontFile = environment.bundledJapaneseSerifFontFile;

    return fontFile && environment.fileExists(fontFile) ? [fontFile] : [];
}

function resolveJapaneseSerifPreferredFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
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
        case "linux":
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
        default:
            return [];
    }
}

function resolveJapaneseSerifFallbackFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
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
        case "linux":
            return [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
            ];
        default:
            return [];
    }
}

function resolveHangulFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
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
        case "linux":
            return [
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
                "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
                "/usr/share/fonts/truetype/unfonts-core/UnDotum.ttf",
            ];
        default:
            return [];
    }
}

function resolveSymbolFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
        case "win32":
            return [
                "C:\\Windows\\Fonts\\seguisym.ttf",
            ];
        case "darwin":
            return [
                "/System/Library/Fonts/Apple Symbols.ttf",
                "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            ];
        case "linux":
            return [
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/noto/NotoSansSymbols-Regular.ttf",
                "/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf",
            ];
        default:
            return [];
    }
}

function resolvePrimaryFontFamily(platform: NodeJS.Platform): string {
    switch (platform) {
        case "win32":
            return "Inter";
        case "darwin":
            return "SF Pro Display";
        default:
            return "Inter";
    }
}

function decodeXmlText(text: string): string {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, codePointHexadecimal: string) => {
            return decodeCodePoint(Number.parseInt(codePointHexadecimal, 16));
        })
        .replace(/&#([0-9]+);/g, (_, codePointDecimal: string) => {
            return decodeCodePoint(Number.parseInt(codePointDecimal, 10));
        })
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function decodeCodePoint(codePoint: number): string {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
        return "";
    }

    return String.fromCodePoint(codePoint);
}

function resolveBundledFontFile(fontDirectory: string, fontFileName: string): string {
    const executableDirectory = path.dirname(process.argv[1] ?? process.cwd());
    const bundledFontFile = [
        path.resolve(process.cwd(), "assets", "fonts", fontDirectory, fontFileName),
        path.resolve(process.cwd(), "com.ez.sho-metrics.sdPlugin", "assets", "fonts", fontDirectory, fontFileName),
        path.resolve(executableDirectory, "..", "assets", "fonts", fontDirectory, fontFileName),
        path.resolve(executableDirectory, "..", "..", "assets", "fonts", fontDirectory, fontFileName),
    ].find(fontFile => existsSync(fontFile));

    return bundledFontFile ?? path.resolve(process.cwd(), "assets", "fonts", fontDirectory, fontFileName);
}
