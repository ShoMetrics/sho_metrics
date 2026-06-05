import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import {
    DOMParser,
    MIME_TYPE,
    NAMESPACE,
    XMLSerializer,
    type Document,
    type Element,
    type Node,
} from "@xmldom/xmldom";

interface CliOptions {
    verifyOnly: boolean;
    testOnly: boolean;
}

interface FigmaSquircleCornerPath {
    // These distances are one quadrant of Figma's continuous-corner path.
    // Keeping them named avoids the original algorithm's opaque a/b/c/d terms.
    leadingControlLength: number;
    trailingControlLength: number;
    arcApproachLength: number;
    arcApproachOffset: number;
    pathLength: number;
    radius: number;
    arcSectionLength: number;
}

const brandRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(brandRoot, "../../..");
// Single source of truth for the filled logo artwork. Every checked-in plugin,
// Windows, and installer image below is generated from this SVG.
const sourceFilledLogoPath = path.join(brandRoot, "shometrics-logo-filled.svg");
const temporaryRoot = path.join(repoRoot, "artifacts/brand-assets", randomUUID().replaceAll("-", ""));

const roundedSvgTargets = [
    path.join(brandRoot, "shometrics-logo-rounded.svg"),
];

// Stream Deck category/action-list icons are UI chrome, not key artwork.
// Marketplace guidance requires white monochrome foreground on transparent
// ground, with exact raster sizes for standard and high-DPI action lists.
const streamDeckActionListPngTargets = [
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/actions/sho-metrics/icon.png"), size: 20 },
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/actions/sho-metrics/icon@2x.png"), size: 40 },
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/plugin/category-icon.png"), size: 28 },
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/plugin/category-icon@2x.png"), size: 56 },
];

// Stream Deck key images are the on-device default action image. They keep the
// full filled brand treatment because the monochrome action-list rule does not
// apply to key state images.
const fullPngTargets = [
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/actions/sho-metrics/key.png"), size: 72 },
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/actions/sho-metrics/key@2x.png"), size: 144 },
];

// The manifest-level plugin icon appears in Stream Deck preferences and
// Marketplace surfaces. Elgato requires PNG at 256/512 px, but not monochrome,
// so use the rounded filled app-icon variant.
const streamDeckMarketplacePngTargets = [
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/plugin/marketplace.png"), size: 256 },
    { path: path.join(repoRoot, "packages/hub/com.ez.sho-metrics.sdPlugin/imgs/plugin/marketplace@2x.png"), size: 512 },
];

// WinUI titlebar images are loaded through ThemeDictionaries. Light surfaces use
// the rounded filled app icon for contrast; dark surfaces use the transparent
// mark so the glow sits directly on the dark titlebar.
const titleBarLightImagePath = path.join(repoRoot, "packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/Assets/sho-metrics-icon-titlebar-light.png");
const titleBarDarkImagePath = path.join(repoRoot, "packages/source-windows/ShoMetrics.Source.Windows.ControlPanel/Assets/sho-metrics-icon-titlebar-dark.png");
// The shared ICO is embedded into Windows executables and the Inno installer.
// ICO needs multiple raster sizes because Windows selects different entries for
// titlebars, taskbar, Explorer, UAC, and installer surfaces.
const windowsIconPath = path.join(repoRoot, "packages/source-windows/Assets/ShoMetrics.ico");
// Keep this SVG checked in for project files/tools that need a transparent
// source mark, but do not point Stream Deck at it because QtSVG loses fidelity.
const windowsIconSourcePath = path.join(repoRoot, "packages/source-windows/Assets/ShoMetricsIconTransparent.svg");
// Inno uses a tall wizard panel image and a small titlebar/wizard icon image;
// both must be bitmap files.
const installerWizardImagePath = path.join(repoRoot, "packages/source-windows/Assets/ShoMetricsWizardImage.png");
const installerWizardSmallImagePath = path.join(repoRoot, "packages/source-windows/Assets/ShoMetricsWizardSmallImage.png");

const minimumIconSizes = [16, 24, 32, 48, 256];
// Match the modern Windows scale table for titlebar, tray, taskbar, search,
// Start all-apps, and Start pins. Windows prefers an exact frame before it
// scales another size, so include the intermediate sizes called out by:
// https://learn.microsoft.com/windows/apps/design/iconography/app-icon-construction
const extraIconSizes = [20, 30, 36, 40, 60, 64, 72, 80, 96, 128];
const iconSizes = [...minimumIconSizes, ...extraIconSizes].sort((left, right) => right - left);
const filledLogoGroundColor = "#0a0e18";
const logoBackgroundElementId = "shometrics-logo-background";
const logoBloomSurfaceElementId = "shometrics-logo-bloom-surface";
const logoMarkElementId = "shometrics-logo-mark";
const logoStrokeGlowFilterId = "shometrics-logo-stroke-glow";
const roundedLogoClipPathId = "shometrics-logo-rounded-clip";
const appIconCornerRadius = 125.0;
const appIconCornerSmoothing = 0.8;
const appIconBoundsX = -12.57;
const appIconBoundsY = -26.40;
const appIconBoundsSize = 500.0;

function main(): void {
    const options = parseCliOptions(process.argv.slice(2));

    if (options.testOnly) {
        runTests();
        return;
    }

    if (!existsSync(sourceFilledLogoPath)) {
        throw new Error(`Brand source SVG was not found: ${sourceFilledLogoPath}`);
    }

    if (existsSync(temporaryRoot)) {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }

    mkdirSync(temporaryRoot, { recursive: true });

    try {
        const filledLogoSvg = readTextFile(sourceFilledLogoPath);
        const transparentLogoSvg = buildTransparentLogoSvg(filledLogoSvg);
        const streamDeckActionListLogoSvg = buildStreamDeckActionListLogoSvg(filledLogoSvg);
        const roundedLogoSvg = buildRoundedLogoSvg(filledLogoSvg);

        for (const targetPath of roundedSvgTargets) {
            saveOrVerifyText(options, targetPath, roundedLogoSvg);
        }

        saveOrVerifyText(options, windowsIconSourcePath, transparentLogoSvg);
        const roundedIconSourcePath = path.join(temporaryRoot, "ShoMetricsIconRounded.svg");
        writeTextFile(roundedIconSourcePath, roundedLogoSvg);

        for (const target of fullPngTargets) {
            saveOrVerifyPng(options, sourceFilledLogoPath, target.path, target.size);
        }

        for (const target of streamDeckMarketplacePngTargets) {
            saveOrVerifyPng(options, roundedIconSourcePath, target.path, target.size);
        }

        const streamDeckActionListLogoPath = path.join(temporaryRoot, "ShoMetricsStreamDeckActionListIcon.svg");
        writeTextFile(streamDeckActionListLogoPath, streamDeckActionListLogoSvg);

        for (const target of streamDeckActionListPngTargets) {
            // Stream Deck renders SVG action-list icons through QtSVG, which
            // does not preserve this logo's clip/filter treatment reliably.
            // Elgato documents PNG as supported, and Marketplace guidance
            // requires a white monochrome foreground on transparent ground.
            saveOrVerifyPng(options, streamDeckActionListLogoPath, target.path, target.size);
        }

        saveOrVerifyPng(options, roundedIconSourcePath, titleBarLightImagePath, 500);
        saveOrVerifyPng(options, windowsIconSourcePath, titleBarDarkImagePath, 500);
        saveOrVerifyIcon(options, roundedIconSourcePath, windowsIconPath);
        saveOrVerifyWizardPanelImage(options, sourceFilledLogoPath, installerWizardImagePath);
        saveOrVerifyWizardSmallImage(options, roundedIconSourcePath, installerWizardSmallImagePath);
    }
    finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }

    if (options.verifyOnly) {
        console.log("Brand assets are in sync.");
        return;
    }

    console.log("Synced ShoMetrics brand assets.");
    console.log(`Windows icon: ${windowsIconPath}`);
}

function parseCliOptions(args: string[]): CliOptions {
    const verifyOnly = args.includes("--verify-only") || args.includes("-VerifyOnly");
    const testOnly = args.includes("--test");
    const expectedArguments = new Set(["--verify-only", "-VerifyOnly", "--test"]);
    const unexpectedArguments = args.filter(argument => !expectedArguments.has(argument));
    if (unexpectedArguments.length > 0) {
        throw new Error(`Unexpected arguments: ${unexpectedArguments.join(" ")}`);
    }

    return { verifyOnly, testOnly };
}

function readTextFile(filePath: string): string {
    return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function writeTextFile(filePath: string, text: string): void {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `\uFEFF${text}`, "utf8");
}

function writeBinaryFile(filePath: string, content: Buffer): void {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
}

function assertTextEquals(filePath: string, expectedText: string): void {
    if (!existsSync(filePath)) {
        throw new Error(`Brand asset is missing: ${filePath}`);
    }

    const actualText = normalizeTextForComparison(filePath, readTextFile(filePath));
    const normalizedExpectedText = normalizeTextForComparison(filePath, expectedText);
    if (actualText !== normalizedExpectedText) {
        throw new Error(`Brand asset is out of sync with '${sourceFilledLogoPath}': ${filePath}`);
    }
}

function normalizeTextForComparison(filePath: string, text: string): string {
    const textWithoutByteOrderMark = text.replace(/^\uFEFF/, "");
    if (path.extname(filePath).toLowerCase() !== ".svg") {
        return textWithoutByteOrderMark.replace(/\r\n/g, "\n");
    }

    // SVG assets are generated through an XML serializer whose harmless
    // formatting details can differ by platform. Compare the parsed XML shape
    // instead of raw text so verify mode still catches real asset drift.
    return serializeSvgDocument(parseSvgDocument(textWithoutByteOrderMark));
}

function assertBinaryFileEquals(filePath: string, expectedContent: Buffer): void {
    if (!existsSync(filePath)) {
        throw new Error(`Brand asset is missing: ${filePath}`);
    }

    const actualContent = readFileSync(filePath);
    if (!actualContent.equals(expectedContent)) {
        throw new Error(`Brand asset is out of sync with '${sourceFilledLogoPath}': ${filePath}`);
    }
}

function saveOrVerifyText(options: CliOptions, filePath: string, expectedText: string): void {
    if (options.verifyOnly) {
        assertTextEquals(filePath, expectedText);
        return;
    }

    writeTextFile(filePath, expectedText);
}

function buildTransparentLogoSvg(filledLogoSvg: string): string {
    // Dark-surface shell/titlebar usage keeps the logo glow/filter treatment,
    // but removes only the solid ground so the mark can sit on the host surface.
    const logoDocument = parseSvgDocument(filledLogoSvg);
    removeRequiredElement(logoDocument, logoBackgroundElementId);
    return serializeSvgDocument(logoDocument);
}

function buildStreamDeckActionListLogoSvg(filledLogoSvg: string): string {
    // Stream Deck category/action-list icons are not app icons. Marketplace
    // guidance requires monochrome #FFFFFF foreground on a transparent ground,
    // so this strips the brand glow/accent treatment and keeps only the mark.
    const logoDocument = parseSvgDocument(filledLogoSvg);
    removeRequiredElement(logoDocument, logoBackgroundElementId);
    removeRequiredElement(logoDocument, logoBloomSurfaceElementId);
    removeFirstElementByTagName(logoDocument, "defs");

    const markElement = findRequiredElement(logoDocument.documentElement, logoMarkElementId);
    removeExpectedAttributeValue(markElement, "filter", `url(#${logoStrokeGlowFilterId})`);
    setFilledDescendantsToWhite(markElement);

    return serializeSvgDocument(logoDocument);
}

function buildRoundedLogoSvg(filledLogoSvg: string): string {
    const logoDocument = parseSvgDocument(filledLogoSvg);
    const clipPathData = buildFigmaSquircleSvgPath({
        width: appIconBoundsSize,
        height: appIconBoundsSize,
        cornerRadius: appIconCornerRadius,
        cornerSmoothing: appIconCornerSmoothing,
    });

    const definitionsElement = findFirstElementByTagName(logoDocument, "defs");
    if (!definitionsElement) {
        throw new Error("Filled logo SVG must have a <defs> element for the rounded clip path.");
    }

    const clipPathElement = logoDocument.createElementNS(NAMESPACE.SVG, "clipPath");
    clipPathElement.setAttribute("id", roundedLogoClipPathId);

    const clipGeometryElement = logoDocument.createElementNS(NAMESPACE.SVG, "path");
    clipGeometryElement.setAttribute("transform", `translate(${formatSvgNumber(appIconBoundsX)} ${formatSvgNumber(appIconBoundsY)})`);
    clipGeometryElement.setAttribute("d", clipPathData);

    clipPathElement.appendChild(clipGeometryElement);
    definitionsElement.appendChild(clipPathElement);

    wrapElementsAfterDefinitions(logoDocument, definitionsElement, `url(#${roundedLogoClipPathId})`);
    return serializeSvgDocument(logoDocument);
}

function parseSvgDocument(svg: string): Document {
    const parseErrors: string[] = [];
    const parser = new DOMParser({
        locator: false,
        onError: (level, message) => {
            if (level !== "warning") {
                parseErrors.push(message);
            }
        },
    });
    const logoDocument = parser.parseFromString(svg, MIME_TYPE.XML_SVG_IMAGE);

    if (parseErrors.length > 0) {
        throw new Error(`Could not parse brand SVG: ${parseErrors.join("; ")}`);
    }

    if (logoDocument.documentElement.tagName !== "svg") {
        throw new Error("Brand source must be an SVG document.");
    }

    return logoDocument;
}

function serializeSvgDocument(logoDocument: Document): string {
    return new XMLSerializer().serializeToString(logoDocument);
}

function findRequiredElement(rootElement: Element, elementId: string): Element {
    const element = findElementById(rootElement, elementId);
    if (!element) {
        throw new Error(`Brand source SVG is missing required element id '${elementId}'.`);
    }

    return element;
}

function findElementById(rootElement: Element, elementId: string): Element | undefined {
    if (rootElement.getAttribute("id") === elementId) {
        return rootElement;
    }

    for (const childNode of getChildNodes(rootElement)) {
        if (isElementNode(childNode)) {
            const element = findElementById(childNode, elementId);
            if (element) {
                return element;
            }
        }
    }

    return undefined;
}

function removeRequiredElement(logoDocument: Document, elementId: string): void {
    const element = findRequiredElement(logoDocument.documentElement, elementId);
    if (!element.parentNode) {
        throw new Error(`Brand source SVG element '${elementId}' cannot be removed because it has no parent.`);
    }

    element.parentNode.removeChild(element);
}

function findFirstElementByTagName(logoDocument: Document, tagName: string): Element | undefined {
    const elements = logoDocument.getElementsByTagName(tagName);
    const firstElement = elements.item(0);
    return firstElement ?? undefined;
}

function removeFirstElementByTagName(logoDocument: Document, tagName: string): void {
    const element = findFirstElementByTagName(logoDocument, tagName);
    if (!element) {
        return;
    }

    if (!element.parentNode) {
        throw new Error(`Brand source SVG <${tagName}> element cannot be removed because it has no parent.`);
    }

    element.parentNode.removeChild(element);
}

function removeExpectedAttributeValue(element: Element, attributeName: string, expectedValue: string): void {
    const actualValue = element.getAttribute(attributeName);
    if (actualValue !== expectedValue) {
        throw new Error(`Expected '${element.getAttribute("id") ?? element.tagName}' to have ${attributeName}='${expectedValue}', got '${actualValue ?? ""}'.`);
    }

    element.removeAttribute(attributeName);
}

function setFilledDescendantsToWhite(rootElement: Element): void {
    if (rootElement.hasAttribute("fill") && rootElement.getAttribute("fill") !== "none") {
        rootElement.setAttribute("fill", "#FFFFFF");
    }

    for (const childNode of getChildNodes(rootElement)) {
        if (isElementNode(childNode)) {
            setFilledDescendantsToWhite(childNode);
        }
    }
}

function wrapElementsAfterDefinitions(logoDocument: Document, definitionsElement: Element, clipPathValue: string): void {
    const clipGroupElement = logoDocument.createElementNS(NAMESPACE.SVG, "g");
    clipGroupElement.setAttribute("clip-path", clipPathValue);

    let shouldWrap = false;
    for (const childNode of getChildNodes(logoDocument.documentElement)) {
        if (childNode === definitionsElement) {
            shouldWrap = true;
            continue;
        }

        if (shouldWrap) {
            clipGroupElement.appendChild(childNode);
        }
    }

    logoDocument.documentElement.appendChild(clipGroupElement);
}

function getChildNodes(node: Node): Node[] {
    const nodes: Node[] = [];
    for (let index = 0; index < node.childNodes.length; index += 1) {
        const childNode = node.childNodes.item(index);
        if (childNode) {
            nodes.push(childNode);
        }
    }

    return nodes;
}

function isElementNode(node: Node): node is Element {
    return node.nodeType === 1;
}

function buildFigmaSquircleSvgPath(input: {
    width: number;
    height: number;
    cornerRadius: number;
    cornerSmoothing: number;
}): string {
    // Adapted from figma-squircle by Tien Pham, MIT License:
    // https://github.com/phamfoo/figma-squircle
    // It follows Figma's continuous corner approximation so the app icon reads
    // closer to macOS-style masks than a plain SVG rect rx/ry corner.
    const roundingAndSmoothingBudget = Math.min(input.width, input.height) / 2.0;
    const effectiveCornerRadius = Math.min(input.cornerRadius, roundingAndSmoothingBudget);
    const cornerPath = buildFigmaSquircleCornerPath({
        cornerRadius: effectiveCornerRadius,
        cornerSmoothing: input.cornerSmoothing,
        roundingAndSmoothingBudget,
    });

    return [
        `M ${formatSvgNumber(input.width - cornerPath.pathLength)} 0`,
        buildFigmaSquircleTopRightPath(cornerPath),
        `L ${formatSvgNumber(input.width)} ${formatSvgNumber(input.height - cornerPath.pathLength)}`,
        buildFigmaSquircleBottomRightPath(cornerPath),
        `L ${formatSvgNumber(cornerPath.pathLength)} ${formatSvgNumber(input.height)}`,
        buildFigmaSquircleBottomLeftPath(cornerPath),
        `L 0 ${formatSvgNumber(cornerPath.pathLength)}`,
        buildFigmaSquircleTopLeftPath(cornerPath),
        "Z",
    ].join(" ");
}

function buildFigmaSquircleCornerPath(input: {
    cornerRadius: number;
    cornerSmoothing: number;
    roundingAndSmoothingBudget: number;
}): FigmaSquircleCornerPath {
    let effectiveCornerSmoothing = input.cornerSmoothing;
    let pathLength = (1.0 + effectiveCornerSmoothing) * input.cornerRadius;
    if (pathLength > input.roundingAndSmoothingBudget) {
        effectiveCornerSmoothing = input.roundingAndSmoothingBudget / input.cornerRadius - 1.0;
        pathLength = input.roundingAndSmoothingBudget;
    }

    const arcMeasure = 90.0 * (1.0 - effectiveCornerSmoothing);
    const arcSectionLength = Math.sin(toRadians(arcMeasure / 2.0)) * input.cornerRadius * Math.sqrt(2.0);
    const angleAlpha = (90.0 - arcMeasure) / 2.0;
    const p3ToP4Distance = input.cornerRadius * Math.tan(toRadians(angleAlpha / 2.0));
    const angleBeta = 45.0 * effectiveCornerSmoothing;
    const arcApproachLength = p3ToP4Distance * Math.cos(toRadians(angleBeta));
    const arcApproachOffset = arcApproachLength * Math.tan(toRadians(angleBeta));
    const trailingControlLength = (pathLength - arcSectionLength - arcApproachLength - arcApproachOffset) / 3.0;
    const leadingControlLength = 2.0 * trailingControlLength;

    return {
        leadingControlLength,
        trailingControlLength,
        arcApproachLength,
        arcApproachOffset,
        pathLength,
        radius: input.cornerRadius,
        arcSectionLength,
    };
}

function buildFigmaSquircleTopRightPath(cornerPath: FigmaSquircleCornerPath): string {
    const {
        leadingControlLength,
        trailingControlLength,
        arcApproachLength,
        arcApproachOffset,
        radius,
        arcSectionLength,
    } = cornerPath;

    const firstCurveControlX = leadingControlLength;
    const secondCurveControlX = leadingControlLength + trailingControlLength;
    const firstCurveEndX = leadingControlLength + trailingControlLength + arcApproachLength;
    const finalCurveControlY = trailingControlLength + arcApproachLength;
    const finalCurveEndY = leadingControlLength + trailingControlLength + arcApproachLength;

    const firstBezier = `c ${formatSvgCoordinatePair(firstCurveControlX, 0)}, ${formatSvgCoordinatePair(secondCurveControlX, 0)}, ${formatSvgCoordinatePair(firstCurveEndX, arcApproachOffset)}`;
    const arc = `a ${formatSvgCoordinatePair(radius, radius)} 0 0 1, ${formatSvgCoordinatePair(arcSectionLength, arcSectionLength)}`;
    const secondBezier = `c ${formatSvgCoordinatePair(arcApproachOffset, arcApproachLength)}, ${formatSvgCoordinatePair(arcApproachOffset, finalCurveControlY)}, ${formatSvgCoordinatePair(arcApproachOffset, finalCurveEndY)}`;

    return `${firstBezier} ${arc} ${secondBezier}`;
}

function buildFigmaSquircleBottomRightPath(cornerPath: FigmaSquircleCornerPath): string {
    const {
        leadingControlLength,
        trailingControlLength,
        arcApproachLength,
        arcApproachOffset,
        radius,
        arcSectionLength,
    } = cornerPath;

    const firstCurveControlY = leadingControlLength;
    const secondCurveControlY = leadingControlLength + trailingControlLength;
    const firstCurveEndY = leadingControlLength + trailingControlLength + arcApproachLength;
    const finalCurveControlX = -(trailingControlLength + arcApproachLength);
    const finalCurveEndX = -(leadingControlLength + trailingControlLength + arcApproachLength);

    const firstBezier = `c ${formatSvgCoordinatePair(0, firstCurveControlY)}, ${formatSvgCoordinatePair(0, secondCurveControlY)}, ${formatSvgCoordinatePair(-arcApproachOffset, firstCurveEndY)}`;
    const arc = `a ${formatSvgCoordinatePair(radius, radius)} 0 0 1, ${formatSvgCoordinatePair(-arcSectionLength, arcSectionLength)}`;
    const secondBezier = `c ${formatSvgCoordinatePair(-arcApproachLength, arcApproachOffset)}, ${formatSvgCoordinatePair(finalCurveControlX, arcApproachOffset)}, ${formatSvgCoordinatePair(finalCurveEndX, arcApproachOffset)}`;

    return `${firstBezier} ${arc} ${secondBezier}`;
}

function buildFigmaSquircleBottomLeftPath(cornerPath: FigmaSquircleCornerPath): string {
    const {
        leadingControlLength,
        trailingControlLength,
        arcApproachLength,
        arcApproachOffset,
        radius,
        arcSectionLength,
    } = cornerPath;

    const firstCurveControlX = -leadingControlLength;
    const secondCurveControlX = -(leadingControlLength + trailingControlLength);
    const firstCurveEndX = -(leadingControlLength + trailingControlLength + arcApproachLength);
    const finalCurveControlY = -(trailingControlLength + arcApproachLength);
    const finalCurveEndY = -(leadingControlLength + trailingControlLength + arcApproachLength);

    const firstBezier = `c ${formatSvgCoordinatePair(firstCurveControlX, 0)}, ${formatSvgCoordinatePair(secondCurveControlX, 0)}, ${formatSvgCoordinatePair(firstCurveEndX, -arcApproachOffset)}`;
    const arc = `a ${formatSvgCoordinatePair(radius, radius)} 0 0 1, ${formatSvgCoordinatePair(-arcSectionLength, -arcSectionLength)}`;
    const secondBezier = `c ${formatSvgCoordinatePair(-arcApproachOffset, -arcApproachLength)}, ${formatSvgCoordinatePair(-arcApproachOffset, finalCurveControlY)}, ${formatSvgCoordinatePair(-arcApproachOffset, finalCurveEndY)}`;

    return `${firstBezier} ${arc} ${secondBezier}`;
}

function buildFigmaSquircleTopLeftPath(cornerPath: FigmaSquircleCornerPath): string {
    const {
        leadingControlLength,
        trailingControlLength,
        arcApproachLength,
        arcApproachOffset,
        radius,
        arcSectionLength,
    } = cornerPath;

    const firstCurveControlY = -leadingControlLength;
    const secondCurveControlY = -(leadingControlLength + trailingControlLength);
    const firstCurveEndY = -(leadingControlLength + trailingControlLength + arcApproachLength);
    const finalCurveControlX = trailingControlLength + arcApproachLength;
    const finalCurveEndX = leadingControlLength + trailingControlLength + arcApproachLength;

    const firstBezier = `c ${formatSvgCoordinatePair(0, firstCurveControlY)}, ${formatSvgCoordinatePair(0, secondCurveControlY)}, ${formatSvgCoordinatePair(arcApproachOffset, firstCurveEndY)}`;
    const arc = `a ${formatSvgCoordinatePair(radius, radius)} 0 0 1, ${formatSvgCoordinatePair(arcSectionLength, -arcSectionLength)}`;
    const secondBezier = `c ${formatSvgCoordinatePair(arcApproachLength, -arcApproachOffset)}, ${formatSvgCoordinatePair(finalCurveControlX, -arcApproachOffset)}, ${formatSvgCoordinatePair(finalCurveEndX, -arcApproachOffset)}`;

    return `${firstBezier} ${arc} ${secondBezier}`;
}

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180.0;
}

function formatSvgCoordinatePair(x: number, y: number): string {
    return `${formatSvgNumber(x)} ${formatSvgNumber(y)}`;
}

function formatSvgNumber(value: number): string {
    return value.toFixed(4).replace(/\.?0+$/, "");
}

function readImageSignature(filePath: string): string {
    if (!isMagickAvailable()) {
        throw new Error("ImageMagick 'magick' is required to verify generated ICO and installer bitmap assets.");
    }

    return execFileSync("magick", ["identify", "-quiet", "-format", "%#\n", filePath], { encoding: "utf8" }).trim();
}

function assertRasterPixelsEqual(expectedPath: string, actualPath: string): void {
    if (!existsSync(actualPath)) {
        throw new Error(`Brand asset is missing: ${actualPath}`);
    }

    const expectedSignature = readImageSignature(expectedPath);
    const actualSignature = readImageSignature(actualPath);

    if (expectedSignature !== actualSignature) {
        throw new Error(`Brand asset is out of sync with '${sourceFilledLogoPath}': ${actualPath}`);
    }
}

function isMagickAvailable(): boolean {
    try {
        execFileSync("magick", ["-version"], { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}

function invokeMagick(args: string[]): void {
    if (!isMagickAvailable()) {
        throw new Error("ImageMagick 'magick' was not found on PATH. Install it or add it to PATH before syncing brand assets.");
    }

    execFileSync("magick", args, { stdio: "inherit" });
}

function saveOrVerifyPng(options: CliOptions, sourceSvgPath: string, targetPath: string, outputSize: number): void {
    const expectedPng = renderSvgToPng(sourceSvgPath, outputSize);

    if (options.verifyOnly) {
        assertBinaryFileEquals(targetPath, expectedPng);
        return;
    }

    writeBinaryFile(targetPath, expectedPng);
}

function saveOrVerifyIcon(options: CliOptions, sourceSvgPath: string, targetPath: string): void {
    const iconPngPaths = iconSizes.map(iconSize => {
        const iconPngPath = path.join(temporaryRoot, `ShoMetrics-${iconSize}.png`);
        writeBinaryFile(iconPngPath, renderSvgToPng(sourceSvgPath, iconSize));
        return iconPngPath;
    });

    if (options.verifyOnly) {
        const expectedPath = path.join(temporaryRoot, "ShoMetrics.ico");
        invokeMagick([...iconPngPaths, expectedPath]);

        assertRasterPixelsEqual(expectedPath, targetPath);
        return;
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    invokeMagick([...iconPngPaths, targetPath]);
}

function saveOrVerifyWizardPanelImage(options: CliOptions, sourceSvgPath: string, targetPath: string): void {
    const logoPath = path.join(temporaryRoot, "wizard-panel-logo.png");
    writeBinaryFile(logoPath, renderSvgToPng(sourceSvgPath, 380));

    if (options.verifyOnly) {
        const expectedPath = path.join(temporaryRoot, path.basename(targetPath));
        invokeMagick(["-size", "534x1022", `xc:${filledLogoGroundColor}`, logoPath, "-gravity", "center", "-composite", `PNG32:${expectedPath}`]);

        assertRasterPixelsEqual(expectedPath, targetPath);
        return;
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    invokeMagick(["-size", "534x1022", `xc:${filledLogoGroundColor}`, logoPath, "-gravity", "center", "-composite", `PNG32:${targetPath}`]);
}

function saveOrVerifyWizardSmallImage(options: CliOptions, sourceSvgPath: string, targetPath: string): void {
    const iconPath = path.join(temporaryRoot, "wizard-small-icon.png");
    writeBinaryFile(iconPath, renderSvgToPng(sourceSvgPath, 96));

    if (options.verifyOnly) {
        const expectedPath = path.join(temporaryRoot, path.basename(targetPath));
        invokeMagick(["-size", "159x159", "xc:none", iconPath, "-gravity", "center", "-composite", `PNG32:${expectedPath}`]);

        assertRasterPixelsEqual(expectedPath, targetPath);
        return;
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    invokeMagick(["-size", "159x159", "xc:none", iconPath, "-gravity", "center", "-composite", `PNG32:${targetPath}`]);
}

function renderSvgToPng(sourceSvgPath: string, outputSize: number): Buffer {
    const sourceSvg = readTextFile(sourceSvgPath);
    const renderedImage = new Resvg(sourceSvg, {
        fitTo: {
            mode: "width",
            value: outputSize,
        },
        background: "rgba(0, 0, 0, 0)",
        imageRendering: 0,
        shapeRendering: 2,
        textRendering: 2,
    }).render();

    if (renderedImage.width !== outputSize || renderedImage.height !== outputSize) {
        throw new Error(`Expected ${sourceSvgPath} to render as ${outputSize}x${outputSize}, got ${renderedImage.width}x${renderedImage.height}.`);
    }

    return renderedImage.asPng();
}

function runTests(): void {
    assert.deepEqual(parseCliOptions([]), { verifyOnly: false, testOnly: false });
    assert.deepEqual(parseCliOptions(["--verify-only"]), { verifyOnly: true, testOnly: false });
    assert.deepEqual(parseCliOptions(["--test"]), { verifyOnly: false, testOnly: true });
    assert.throws(() => parseCliOptions(["--unexpected"]), /Unexpected arguments/u);

    const solidGroundSvg = [
        "<svg>",
        `<rect id="${logoBackgroundElementId}" x="-12.57" y="-26.40" width="500" height="500" fill="${filledLogoGroundColor}"/>`,
        "<path d=\"M0 0\"/>",
        "</svg>",
    ].join("\n");
    const transparentGroundSvg = buildTransparentLogoSvg(solidGroundSvg);
    assert(!transparentGroundSvg.includes("<rect"), "transparent variant should remove only the solid logo ground rect");
    assert(transparentGroundSvg.includes("<path d=\"M0 0\"/>"), "transparent variant should keep the logo geometry");

    const sourceFilledLogoSvg = readTextFile(sourceFilledLogoPath);
    assert(sourceFilledLogoSvg.includes(`id="${logoBackgroundElementId}"`), "source logo should keep the stable background id");
    assert(sourceFilledLogoSvg.includes(`id="${logoBloomSurfaceElementId}"`), "source logo should keep the stable bloom-surface id");
    assert(sourceFilledLogoSvg.includes(`id="${logoMarkElementId}"`), "source logo should keep the stable mark id");

    const streamDeckActionListSvg = buildStreamDeckActionListLogoSvg(sourceFilledLogoSvg);
    assert(!streamDeckActionListSvg.includes("<defs"), "Stream Deck action-list icon should not keep glow/filter definitions");
    assert(!streamDeckActionListSvg.includes(logoBackgroundElementId), "Stream Deck action-list icon should have transparent ground");
    assert(!streamDeckActionListSvg.includes(logoBloomSurfaceElementId), "Stream Deck action-list icon should remove the filled-logo bloom surface");
    assert(!/fill="#9ec5ff"/u.test(streamDeckActionListSvg), "Stream Deck action-list icon should not keep accent color");
    assert(!/filter="/u.test(streamDeckActionListSvg), "Stream Deck action-list icon should not keep glow filters");
    assert(streamDeckActionListSvg.includes("fill=\"#FFFFFF\""), "Stream Deck action-list icon should use white foreground");

    const roundedSvg = buildRoundedLogoSvg("<svg><defs></defs><path d=\"M0 0\"/></svg>");
    assert(roundedSvg.includes(`<clipPath id="${roundedLogoClipPathId}">`));
    assert(roundedSvg.includes(`<g clip-path="url(#${roundedLogoClipPathId})">`));
    assert(roundedSvg.endsWith("</g></svg>"));

    const cornerPath = buildFigmaSquircleCornerPath({
        cornerRadius: appIconCornerRadius,
        cornerSmoothing: appIconCornerSmoothing,
        roundingAndSmoothingBudget: appIconBoundsSize / 2.0,
    });
    assert(cornerPath.leadingControlLength > 0);
    assert(cornerPath.trailingControlLength > 0);
    assert(cornerPath.arcApproachLength > 0);
    assert(cornerPath.arcApproachOffset > 0);
    assert.equal(cornerPath.pathLength, 225);

    const squirclePath = buildFigmaSquircleSvgPath({
        width: appIconBoundsSize,
        height: appIconBoundsSize,
        cornerRadius: appIconCornerRadius,
        cornerSmoothing: appIconCornerSmoothing,
    });
    assert(!squirclePath.includes("NaN"));
    assert(squirclePath.startsWith("M 275 0 c "), "squircle path should start after the top-right corner budget");
    assert(squirclePath.endsWith(" Z"));

    console.log("Brand asset script tests passed.");
}

main();
