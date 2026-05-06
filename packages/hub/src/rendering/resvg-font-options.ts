import { existsSync } from "node:fs";
import path from "node:path";
import type { ResvgRenderOptions } from "@resvg/resvg-js";

export type FontScript = "han" | "kana" | "hangul" | "symbol";

export interface ResvgFontResolverEnvironment {
    platform: NodeJS.Platform;
    fileExists: (fontFile: string) => boolean;
    bundledInterFontFile?: string;
}

const DEFAULT_FONT_RESOLVER_ENVIRONMENT: ResvgFontResolverEnvironment = {
    platform: process.platform,
    fileExists: existsSync,
    bundledInterFontFile: resolveBundledInterFontFile(),
};

const fontFileCacheByKey = new Map<string, readonly string[]>();
const fontOptionsCacheByKey = new Map<string, NonNullable<ResvgRenderOptions["font"]>>();

const HAN_SCRIPT_PATTERN = /\p{Script_Extensions=Han}/u;
const HIRAGANA_SCRIPT_PATTERN = /\p{Script_Extensions=Hiragana}/u;
const KATAKANA_SCRIPT_PATTERN = /\p{Script_Extensions=Katakana}/u;
const HANGUL_SCRIPT_PATTERN = /\p{Script_Extensions=Hangul}/u;
const SYMBOL_FALLBACK_PATTERN = /[\u00b0\u03bc\u03a9\u2190-\u21ff\u2200-\u22ff]/u;

/**
 * Builds resvg font options without system-wide font loading.
 *
 * Windows uses vendored Inter as the primary Latin UI font for stable small-screen
 * rendering. macOS uses SF system fonts as the primary UI font to match platform
 * expectations. CJK fallback fonts are added only when visible SVG text needs them.
 */
export function resolveResvgFontOptions(
    svgString: string,
    environment = DEFAULT_FONT_RESOLVER_ENVIRONMENT,
): NonNullable<ResvgRenderOptions["font"]> {
    const scriptList = detectFontScriptsFromSvg(svgString);
    const cacheKey = [
        environment.platform,
        environment.bundledInterFontFile ?? "",
        ...scriptList,
    ].join("|");
    const cachedFontOptions = fontOptionsCacheByKey.get(cacheKey);

    if (cachedFontOptions) {
        return cachedFontOptions;
    }

    const fontFiles = resolveFontFiles(scriptList, environment);
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
    environment: ResvgFontResolverEnvironment,
): readonly string[] {
    const cacheKey = [
        environment.platform,
        environment.bundledInterFontFile ?? "",
        ...scriptList,
    ].join("|");
    const cachedFontFiles = fontFileCacheByKey.get(cacheKey);

    if (cachedFontFiles) {
        return cachedFontFiles;
    }

    const fontFiles = filterExistingFontFiles([
        ...resolvePrimaryFontFileCandidates(environment),
        ...scriptList.flatMap(fontScript => resolveFontFileCandidatesForScript(fontScript, environment.platform)),
    ], environment.fileExists);

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

function resolvePrimaryFontFileCandidates(environment: ResvgFontResolverEnvironment): readonly string[] {
    switch (environment.platform) {
        case "win32":
            return [
                environment.bundledInterFontFile,
                "C:\\Windows\\Fonts\\seguisym.ttf",
            ].filter((fontFile): fontFile is string => Boolean(fontFile));
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

function resolveHanFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
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

function resolveKanaFontFileCandidates(platform: NodeJS.Platform): readonly string[] {
    switch (platform) {
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
            return "Arial";
    }
}

function filterExistingFontFiles(
    fontFileCandidates: readonly string[],
    fileExists: (fontFile: string) => boolean,
): readonly string[] {
    const fontFileList = Array.from(new Set(fontFileCandidates));

    return fontFileList.filter(fontFile => fileExists(fontFile));
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

function resolveBundledInterFontFile(): string {
    const executableDirectory = path.dirname(process.argv[1] ?? process.cwd());

    return firstExistingFontFile([
        path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf"),
        path.resolve(process.cwd(), "com.ez.sho-metrics.sdPlugin", "assets", "fonts", "inter", "InterVariable.ttf"),
        path.resolve(executableDirectory, "..", "assets", "fonts", "inter", "InterVariable.ttf"),
        path.resolve(executableDirectory, "..", "..", "assets", "fonts", "inter", "InterVariable.ttf"),
    ]) ?? path.resolve(process.cwd(), "assets", "fonts", "inter", "InterVariable.ttf");
}

function firstExistingFontFile(fontFiles: readonly string[]): string | undefined {
    return fontFiles.find(fontFile => existsSync(fontFile));
}
