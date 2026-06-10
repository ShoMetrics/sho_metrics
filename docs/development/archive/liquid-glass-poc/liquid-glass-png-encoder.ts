import { deflateSync } from "node:zlib";

/**
 * Encodes raw RGBA pixels as a PNG data URL for liquid-glass filter maps.
 *
 * This module is node-only (zlib, Buffer). The Property Inspector bundle swaps
 * it for liquid-glass-png-encoder.browser.ts via a rollup alias, which exports
 * `undefined`; liquid-glass-effect then skips the filter and renders the
 * tint-only fallback in browser previews.
 */
export type LiquidGlassPngEncode = (rgbaPixels: Uint8ClampedArray, width: number, height: number) => string;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CRC_TABLE = buildPngCrcTable();

function buildPngCrcTable(): Int32Array {
    const table = new Int32Array(256);
    for (let tableIndex = 0; tableIndex < 256; tableIndex++) {
        let crc = tableIndex;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        table[tableIndex] = crc;
    }
    return table;
}

function encodePngDataUrl(rgbaPixels: Uint8ClampedArray, width: number, height: number): string {
    const crc32 = (bytes: Buffer): number => {
        let crc = -1;
        for (const byte of bytes) {
            crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ -1) >>> 0;
    };
    const chunk = (chunkType: string, chunkData: Buffer): Buffer => {
        const output = Buffer.alloc(12 + chunkData.length);
        output.writeUInt32BE(chunkData.length, 0);
        output.write(chunkType, 4, "ascii");
        chunkData.copy(output, 8);
        output.writeUInt32BE(crc32(output.subarray(4, 8 + chunkData.length)), 8 + chunkData.length);
        return output;
    };

    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // RGBA color type
    const scanlines = Buffer.alloc((width * 4 + 1) * height);
    for (let row = 0; row < height; row++) {
        scanlines[row * (width * 4 + 1)] = 0; // filter: none
        scanlines.set(
            rgbaPixels.subarray(row * width * 4, (row + 1) * width * 4),
            row * (width * 4 + 1) + 1,
        );
    }
    const png = Buffer.concat([
        PNG_SIGNATURE,
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(scanlines)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
    return `data:image/png;base64,${png.toString("base64")}`;
}

/** PNG encoder when available in this environment; undefined in the browser bundle. */
export const encodeLiquidGlassPng: LiquidGlassPngEncode | undefined = encodePngDataUrl;
