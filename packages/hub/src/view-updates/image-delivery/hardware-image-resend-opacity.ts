// Deterministic resend-only opacity nonces make each rasterized PNG different enough
// to bypass Stream Deck host image caching. Do not apply this to initial sends.
// A fixed sequence is enough to change the PNG and keeps resend logs/tests reproducible.
const HARDWARE_IMAGE_RESEND_OPACITY_VALUES = [0.99, 0.98, 0.97] as const;

/**
 * Adds a resend-only SVG opacity nonce so the host sees a new hardware image.
 */
export function addHardwareImageResendOpacity(hardwareSvg: string, resendIndex: number): string {
    const openingSvgEndIndex = hardwareSvg.indexOf(">");
    const closingSvgIndex = hardwareSvg.lastIndexOf("</svg>");

    if (openingSvgEndIndex < 0 || closingSvgIndex < 0 || closingSvgIndex <= openingSvgEndIndex) {
        return hardwareSvg;
    }

    return [
        hardwareSvg.slice(0, openingSvgEndIndex + 1),
        `<g opacity="${resolveHardwareImageResendOpacity(resendIndex)}">`,
        hardwareSvg.slice(openingSvgEndIndex + 1, closingSvgIndex),
        "</g>",
        hardwareSvg.slice(closingSvgIndex),
    ].join("");
}

export function resolveHardwareImageResendOpacity(resendIndex: number): number {
    return HARDWARE_IMAGE_RESEND_OPACITY_VALUES[
        resendIndex % HARDWARE_IMAGE_RESEND_OPACITY_VALUES.length
    ];
}
