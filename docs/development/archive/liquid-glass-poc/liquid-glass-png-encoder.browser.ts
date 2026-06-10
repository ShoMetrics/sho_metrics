import type { LiquidGlassPngEncode } from "./liquid-glass-png-encoder";

/**
 * Browser substitute for liquid-glass-png-encoder.ts, swapped in by the
 * Property Inspector rollup config. No PNG encoder means liquid-glass-effect
 * skips filter map generation and renders the tint-only fallback, keeping
 * node:zlib and Buffer out of the browser bundle.
 */
export const encodeLiquidGlassPng: LiquidGlassPngEncode | undefined = undefined;
