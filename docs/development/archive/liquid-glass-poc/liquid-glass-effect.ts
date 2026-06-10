import type { KeySize } from "../../view-rendering/widget-data";
import { encodeLiquidGlassPng, type LiquidGlassPngEncode } from "./liquid-glass-png-encoder";
import type { ThemeStylePaints } from "./theme-style";

/**
 * Liquid-glass effect support for theme styles.
 *
 * Reproduces the resvg-safe approximation prototyped in
 * scripts/playground/liquid-glass-playground.html: the glass layer is a second
 * copy of the theme background (with bleed past the key bounds) run through the
 * Filter.vue-equivalent chain (blur → displacement → saturate → specular
 * composite), then clipped to the rounded glass shape. Refraction physics is a
 * verbatim port of the kube.io / vue-web-liquid-glass profile simulation; map
 * pixels use the playground's "v2" generator (rounded-rect SDF, analytic 1px
 * feather, true-maximum normalization) so corners stay free of the resampling
 * speckle the original generator exhibits.
 *
 * Filter regions are always emitted explicitly in userSpaceOnUse units; resvg
 * panics natively when a filter region dwarfs the canvas, so the region must
 * track the bleed pad and nothing more.
 */
export interface LiquidGlassOptics {
    /** Bezel height profile of the refraction simulation. */
    readonly profile: "convex_squircle" | "convex_circle" | "concave" | "lip";
    /** Glass body thickness below the bezel, in key units. */
    readonly glassThickness: number;
    /** Width of the refracting edge band, in key units. */
    readonly bezelWidth: number;
    readonly refractiveIndex: number;
    /** Backdrop blur sigma, in key units. */
    readonly blurStdDeviation: number;
    /** Dimensionless displacement strength; 1 ≈ full simulated refraction. */
    readonly refractionScaleRatio: number;
    readonly specularOpacity: number;
    readonly specularSaturation: number;
    /** Rounded-corner radius of the glass shape, in key units. */
    readonly cornerRadius: number;
    /**
     * Inset of the glass shape from the key bounds, in key units. Keeps the
     * bezel rim inside the key so hardware corner cropping cannot cut it off.
     */
    readonly edgeInset: number;
}

interface GlassRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly radius: number;
}

function resolveGlassRect(keySize: KeySize, optics: LiquidGlassOptics): GlassRect {
    const width = keySize.width - optics.edgeInset * 2;
    const height = keySize.height - optics.edgeInset * 2;

    return {
        x: optics.edgeInset,
        y: optics.edgeInset,
        width,
        height,
        radius: Math.min(optics.cornerRadius, width / 2, height / 2),
    };
}

const LIQUID_GLASS_FILTER_ID = "liquid-glass-filter";
const LIQUID_GLASS_CLIP_ID = "liquid-glass-clip";

/** Map pixel density per key unit; matches the 2x keypad PNG render scale. */
const MAP_PIXEL_DENSITY = 2;
/** Maps are generated at this multiple and box-downscaled for edge AA. */
const MAP_SUPERSAMPLE = 2;

/**
 * Renders the size-dependent defs (clip path and filter chain) for the glass
 * effect. Heavy map generation runs once per key size and is cached. In the
 * browser bundle (no PNG encoder) this is empty and the backdrop falls back to
 * the tint-only surface.
 */
export function renderLiquidGlassDefs(keySize: KeySize, optics: LiquidGlassOptics): string {
    const encodePng = encodeLiquidGlassPng;
    if (!encodePng) {
        return "";
    }

    return resolveLiquidGlassAssets(keySize, optics, encodePng).defsMarkup;
}

/**
 * Renders the glass backdrop layer: a bled copy of the theme background run
 * through the glass filter, clipped to the glass shape, under the surface tint.
 */
export function renderLiquidGlassBackdrop(
    keySize: KeySize,
    paints: ThemeStylePaints,
    optics: LiquidGlassOptics,
): string {
    const glassRect = resolveGlassRect(keySize, optics);
    const tintRect = `<rect x="${formatSvgNumber(glassRect.x)}" y="${formatSvgNumber(glassRect.y)}"
            width="${formatSvgNumber(glassRect.width)}" height="${formatSvgNumber(glassRect.height)}"
            rx="${formatSvgNumber(glassRect.radius)}" fill="${paints.surface}" />`;

    const encodePng = encodeLiquidGlassPng;
    if (!encodePng) {
        return tintRect;
    }

    const pad = resolveLiquidGlassAssets(keySize, optics, encodePng).bleedPad;

    // The bleed rect repeats the theme background paint so the blur never
    // samples transparent black at the glass edge. Object-bounding-box
    // gradients stretch slightly with the bleed; flat colors are unaffected.
    return `
        <g clip-path="url(#${LIQUID_GLASS_CLIP_ID})">
            <rect x="${-pad}" y="${-pad}"
                width="${keySize.width + pad * 2}" height="${keySize.height + pad * 2}"
                fill="${paints.background}" filter="url(#${LIQUID_GLASS_FILTER_ID})" />
        </g>
        ${tintRect}
    `;
}

interface LiquidGlassAssets {
    readonly bleedPad: number;
    readonly defsMarkup: string;
}

const liquidGlassAssetsCache = new Map<string, LiquidGlassAssets>();

function resolveLiquidGlassAssets(
    keySize: KeySize,
    optics: LiquidGlassOptics,
    encodePng: LiquidGlassPngEncode,
): LiquidGlassAssets {
    const cacheKey = `${keySize.width}x${keySize.height}|${JSON.stringify(optics)}`;
    const cachedAssets = liquidGlassAssetsCache.get(cacheKey);

    if (cachedAssets) {
        return cachedAssets;
    }

    const refractionProfile = computeRefractionProfile(optics);
    const displacementScale = refractionProfile.maximumDisplacement * optics.refractionScaleRatio;
    const bleedPad = Math.min(48, Math.max(
        8,
        Math.ceil(3 * optics.blurStdDeviation + 0.5 * Math.abs(displacementScale) + 4),
    ));
    const maps = buildGlassMaps(keySize, optics, refractionProfile, bleedPad, encodePng);
    const assets: LiquidGlassAssets = {
        bleedPad,
        defsMarkup: buildLiquidGlassDefsMarkup(keySize, optics, maps, displacementScale, bleedPad),
    };

    if (liquidGlassAssetsCache.size > 8) {
        liquidGlassAssetsCache.clear();
    }
    liquidGlassAssetsCache.set(cacheKey, assets);
    return assets;
}

interface GlassMaps {
    readonly displacementMapDataUrl: string;
    readonly specularMapDataUrl: string;
}

function buildLiquidGlassDefsMarkup(
    keySize: KeySize,
    optics: LiquidGlassOptics,
    maps: GlassMaps,
    displacementScale: number,
    bleedPad: number,
): string {
    const glassRect = resolveGlassRect(keySize, optics);
    const region = `x="${-bleedPad}" y="${-bleedPad}"
        width="${keySize.width + bleedPad * 2}" height="${keySize.height + bleedPad * 2}"`;

    // Primitive chain mirrors vue-web-liquid-glass Filter.vue node-for-node.
    return `
        <clipPath id="${LIQUID_GLASS_CLIP_ID}">
            <rect x="${formatSvgNumber(glassRect.x)}" y="${formatSvgNumber(glassRect.y)}"
                width="${formatSvgNumber(glassRect.width)}" height="${formatSvgNumber(glassRect.height)}"
                rx="${formatSvgNumber(glassRect.radius)}" />
        </clipPath>
        <filter id="${LIQUID_GLASS_FILTER_ID}" filterUnits="userSpaceOnUse" ${region}
            color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="${formatSvgNumber(optics.blurStdDeviation)}"
                result="blurred_source" />
            <feImage href="${maps.displacementMapDataUrl}" ${region} result="displacement_map" />
            <feDisplacementMap in="blurred_source" in2="displacement_map"
                scale="${formatSvgNumber(displacementScale)}"
                xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feColorMatrix in="displaced" type="saturate"
                values="${formatSvgNumber(optics.specularSaturation)}" result="displaced_saturated" />
            <feImage href="${maps.specularMapDataUrl}" ${region} result="specular_layer" />
            <feComposite in="displaced_saturated" in2="specular_layer" operator="in"
                result="specular_saturated" />
            <feComponentTransfer in="specular_layer" result="specular_faded">
                <feFuncA type="linear" slope="${formatSvgNumber(optics.specularOpacity)}" />
            </feComponentTransfer>
            <feBlend in="specular_saturated" in2="displaced" mode="normal" result="withSaturation" />
            <feBlend in="specular_faded" in2="withSaturation" mode="normal" />
        </filter>
    `;
}

interface RefractionProfile {
    /** Lateral ray displacement per normalized bezel position, in key units. */
    readonly displacements: Float64Array;
    readonly maximumDisplacement: number;
}

const REFRACTION_PROFILE_SAMPLES = 128;

const SURFACE_PROFILES: Record<LiquidGlassOptics["profile"], (x: number) => number> = {
    convex_circle: (x) => Math.sqrt(1 - (1 - x) ** 2),
    convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
    concave: (x) => 1 - Math.sqrt(1 - (1 - x) ** 2),
    lip: (x) => {
        const convex = Math.pow(1 - Math.pow(1 - Math.min(1, x * 2), 4), 1 / 4);
        const concave = (1 - Math.sqrt(1 - (1 - x) ** 2)) + 0.1;
        const smootherstep = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
        return convex * (1 - smootherstep) + concave * smootherstep;
    },
};

/** Simulates vertical-ray refraction through the bezel; verbatim physics from the Vue lib. */
function computeRefractionProfile(optics: LiquidGlassOptics): RefractionProfile {
    const surfaceFn = SURFACE_PROFILES[optics.profile];
    const eta = 1 / optics.refractiveIndex;
    const displacements = new Float64Array(REFRACTION_PROFILE_SAMPLES);

    for (let sampleIndex = 0; sampleIndex < REFRACTION_PROFILE_SAMPLES; sampleIndex++) {
        const x = sampleIndex / REFRACTION_PROFILE_SAMPLES;
        const y = surfaceFn(x);
        const dx = x < 1 ? 0.0001 : -0.0001;
        const derivative = (surfaceFn(x + dx) - y) / dx;
        const magnitude = Math.sqrt(derivative * derivative + 1);
        const normalX = -derivative / magnitude;
        const normalY = -1 / magnitude;
        const dot = normalY;
        const k = 1 - eta * eta * (1 - dot * dot);

        if (k < 0) {
            displacements[sampleIndex] = 0; // total internal reflection
            continue;
        }

        const kSqrt = Math.sqrt(k);
        const refractedX = -(eta * dot + kSqrt) * normalX;
        const refractedY = eta - (eta * dot + kSqrt) * normalY;
        const remainingHeight = y * optics.bezelWidth + optics.glassThickness;
        displacements[sampleIndex] = refractedX * (remainingHeight / refractedY);
    }

    let maximumDisplacement = 0;
    for (const displacement of displacements) {
        maximumDisplacement = Math.max(maximumDisplacement, Math.abs(displacement));
    }

    return { displacements, maximumDisplacement: maximumDisplacement || 1 };
}

const SPECULAR_LIGHT_ANGLE_RADIANS = Math.PI / 3;

/**
 * Generates the displacement and specular maps over the padded glass area.
 *
 * Displacement pixels stay fully opaque (edge falloff is written into the RG
 * channels, never alpha) so premultiplication cannot corrupt the vectors; the
 * band boundary gets an analytic 1px feather plus supersampled downscale so
 * resampling never interpolates neutral against extreme values.
 */
function buildGlassMaps(
    keySize: KeySize,
    optics: LiquidGlassOptics,
    refractionProfile: RefractionProfile,
    bleedPad: number,
    encodePng: LiquidGlassPngEncode,
): GlassMaps {
    const paddedWidth = keySize.width + bleedPad * 2;
    const paddedHeight = keySize.height + bleedPad * 2;
    const outputWidth = Math.round(paddedWidth * MAP_PIXEL_DENSITY);
    const outputHeight = Math.round(paddedHeight * MAP_PIXEL_DENSITY);
    const hiResWidth = outputWidth * MAP_SUPERSAMPLE;
    const hiResHeight = outputHeight * MAP_SUPERSAMPLE;
    const pixelsPerUnit = hiResWidth / paddedWidth;

    const displacementPixels = new Uint8ClampedArray(hiResWidth * hiResHeight * 4);
    for (let pixelIndex = 0; pixelIndex < displacementPixels.length; pixelIndex += 4) {
        displacementPixels[pixelIndex] = 128;
        displacementPixels[pixelIndex + 1] = 128;
        displacementPixels[pixelIndex + 3] = 255;
    }
    const specularPixels = new Uint8ClampedArray(hiResWidth * hiResHeight * 4);

    const glassRect = resolveGlassRect(keySize, optics);
    const centerX = glassRect.x + glassRect.width / 2;
    const centerY = glassRect.y + glassRect.height / 2;
    const halfWidth = glassRect.width / 2;
    const halfHeight = glassRect.height / 2;
    const radius = glassRect.radius;
    const bezel = Math.max(0.5, optics.bezelWidth);
    const ringWidth = Math.max(bezel, 2) + 1;
    const lightX = Math.cos(SPECULAR_LIGHT_ANGLE_RADIANS);
    const lightY = Math.sin(SPECULAR_LIGHT_ANGLE_RADIANS);
    const { displacements, maximumDisplacement } = refractionProfile;
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
    const sampleDisplacement = (t: number) => {
        const index = clamp01(t) * (REFRACTION_PROFILE_SAMPLES - 1);
        const lowerIndex = Math.floor(index);
        const fraction = index - lowerIndex;
        const upperIndex = Math.min(REFRACTION_PROFILE_SAMPLES - 1, lowerIndex + 1);
        return displacements[lowerIndex] * (1 - fraction) + displacements[upperIndex] * fraction;
    };

    for (let pixelY = 0; pixelY < hiResHeight; pixelY++) {
        const unitY = (pixelY + 0.5) / pixelsPerUnit - bleedPad;
        for (let pixelX = 0; pixelX < hiResWidth; pixelX++) {
            const unitX = (pixelX + 0.5) / pixelsPerUnit - bleedPad;
            // Interior fast skip: rounded corners only shrink the edge distance,
            // so the axis-aligned bound is conservative and safe.
            const minimumAxisDistance = Math.min(
                unitX - glassRect.x,
                glassRect.x + glassRect.width - unitX,
                unitY - glassRect.y,
                glassRect.y + glassRect.height - unitY);
            if (minimumAxisDistance > ringWidth) {
                continue;
            }

            const qx = Math.abs(unitX - centerX) - (halfWidth - radius);
            const qy = Math.abs(unitY - centerY) - (halfHeight - radius);
            const ax = Math.max(qx, 0);
            const ay = Math.max(qy, 0);
            const edgeDistance = -(Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius);
            if (edgeDistance < -1 || edgeDistance > ringWidth) {
                continue;
            }
            const coverage = clamp01(edgeDistance * pixelsPerUnit + 0.5);
            if (coverage <= 0) {
                continue;
            }

            let normalX: number;
            let normalY: number;
            if (qx > 0 && qy > 0) {
                const length = Math.hypot(ax, ay) || 1;
                normalX = (ax / length) * Math.sign(unitX - centerX);
                normalY = (ay / length) * Math.sign(unitY - centerY);
            } else if (qx > qy) {
                normalX = Math.sign(unitX - centerX);
                normalY = 0;
            } else {
                normalX = 0;
                normalY = Math.sign(unitY - centerY);
            }
            const pixelIndex = (pixelY * hiResWidth + pixelX) * 4;

            if (edgeDistance <= bezel) {
                const displacement = sampleDisplacement(Math.max(0, edgeDistance) / bezel);
                const feather = Math.min(coverage, clamp01((bezel - edgeDistance) * pixelsPerUnit + 0.5));
                displacementPixels[pixelIndex] =
                    Math.round(128 + ((-normalX * displacement) / maximumDisplacement) * 127 * feather);
                displacementPixels[pixelIndex + 1] =
                    Math.round(128 + ((-normalY * displacement) / maximumDisplacement) * 127 * feather);
            }
            if (edgeDistance < 2) {
                const lightAlignment = Math.abs(normalX * lightX - normalY * lightY);
                const coefficient = lightAlignment
                    * Math.sqrt(Math.max(0, 1 - (1 - Math.max(0, edgeDistance)) ** 2));
                const luminance = 255 * coefficient;
                specularPixels[pixelIndex] = luminance;
                specularPixels[pixelIndex + 1] = luminance;
                specularPixels[pixelIndex + 2] = luminance;
                specularPixels[pixelIndex + 3] = luminance * coefficient * coverage;
            }
        }
    }

    return {
        displacementMapDataUrl: encodePng(
            downscaleRgba(displacementPixels, hiResWidth, hiResHeight, MAP_SUPERSAMPLE),
            outputWidth,
            outputHeight,
        ),
        specularMapDataUrl: encodePng(
            downscaleRgba(specularPixels, hiResWidth, hiResHeight, MAP_SUPERSAMPLE),
            outputWidth,
            outputHeight,
        ),
    };
}

/** Box-averages square pixel blocks; the supersampled maps use this as edge AA. */
function downscaleRgba(
    sourcePixels: Uint8ClampedArray,
    sourceWidth: number,
    sourceHeight: number,
    factor: number,
): Uint8ClampedArray {
    const outputWidth = sourceWidth / factor;
    const outputHeight = sourceHeight / factor;
    const outputPixels = new Uint8ClampedArray(outputWidth * outputHeight * 4);
    const blockPixelCount = factor * factor;

    for (let outputY = 0; outputY < outputHeight; outputY++) {
        for (let outputX = 0; outputX < outputWidth; outputX++) {
            let sumR = 0;
            let sumG = 0;
            let sumB = 0;
            let sumA = 0;
            for (let blockY = 0; blockY < factor; blockY++) {
                for (let blockX = 0; blockX < factor; blockX++) {
                    const sourceIndex =
                        ((outputY * factor + blockY) * sourceWidth + outputX * factor + blockX) * 4;
                    sumR += sourcePixels[sourceIndex];
                    sumG += sourcePixels[sourceIndex + 1];
                    sumB += sourcePixels[sourceIndex + 2];
                    sumA += sourcePixels[sourceIndex + 3];
                }
            }
            const outputIndex = (outputY * outputWidth + outputX) * 4;
            outputPixels[outputIndex] = Math.round(sumR / blockPixelCount);
            outputPixels[outputIndex + 1] = Math.round(sumG / blockPixelCount);
            outputPixels[outputIndex + 2] = Math.round(sumB / blockPixelCount);
            outputPixels[outputIndex + 3] = Math.round(sumA / blockPixelCount);
        }
    }
    return outputPixels;
}

function formatSvgNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
