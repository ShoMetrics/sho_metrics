// Renders a liquid-glass playground SVG to PNG with the hub's @resvg/resvg-js,
// mirroring rasterizer.ts (fitTo width). Companion to liquid-glass-playground.html.
//
// Usage (run from packages/hub):
//   node scripts/playground/render-liquid-glass.mjs input.svg [output.png] [--width 288]
//   node scripts/playground/render-liquid-glass.mjs --selftest
//
// --selftest verifies that this resvg build supports the filter primitives the
// playground relies on: feImage with a PNG data URI, feDisplacementMap,
// feGaussianBlur, feColorMatrix, feComponentTransfer, and rounded clipPath.
import { Resvg } from "@resvg/resvg-js";
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

function renderSvgToPng(svgString, width) {
    const resvg = new Resvg(svgString, { fitTo: { mode: "width", value: width } });
    return resvg.render();
}

// Minimal PNG encoder (8-bit RGBA, no scanline filtering) for the selftest map.
function encodePng(width, height, rgba) {
    const crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c;
    }
    const crc32 = (bytes) => {
        let c = -1;
        for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
        return (c ^ -1) >>> 0;
    };
    const chunk = (type, data) => {
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length, 0);
        out.write(type, 4, "ascii");
        data.copy(out, 8);
        out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
        return out;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

function buildSelftestSvg(withBand) {
    // Fully opaque map: neutral gray except a horizontal-shift band (R=255).
    // 1:1 with user units so band coordinates need no rescaling.
    const mapSize = 144;
    const rgba = Buffer.alloc(mapSize * mapSize * 4);
    for (let y = 0; y < mapSize; y++) {
        for (let x = 0; x < mapSize; x++) {
            const i = (y * mapSize + x) * 4;
            const inBand = withBand && y >= 36 && y < 60 && x >= 12 && x < 84;
            rgba[i] = inBand ? 255 : 128;
            rgba[i + 1] = 128;
            rgba[i + 2] = 0;
            rgba[i + 3] = 255;
        }
    }
    const mapDataUri = `data:image/png;base64,${encodePng(mapSize, mapSize, rgba).toString("base64")}`;
    const stripes = Array.from({ length: 12 }, (_, i) =>
        `<rect x="${i * 12}" y="0" width="6" height="144" fill="#111"/>`,
    ).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <defs>
    <clipPath id="clip"><rect x="0" y="0" width="144" height="144" rx="16"/></clipPath>
    <filter id="glass" filterUnits="userSpaceOnUse" x="0" y="0" width="144" height="144"
            color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur"/>
      <feImage href="${mapDataUri}" x="0" y="0" width="144" height="144" result="map"/>
      <feDisplacementMap in="blur" in2="map" scale="40"
                         xChannelSelector="R" yChannelSelector="G" result="disp"/>
      <feColorMatrix in="disp" type="saturate" values="1.1" result="sat"/>
      <feComponentTransfer in="sat">
        <feFuncR type="linear" slope="1" intercept="0.02"/>
        <feFuncG type="linear" slope="1" intercept="0.02"/>
        <feFuncB type="linear" slope="1" intercept="0.02"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="144" height="144" fill="#e8e8e8"/>${stripes}
    <g filter="url(#glass)"><rect width="144" height="144" fill="#e8e8e8" opacity="0"/>
      <rect width="144" height="144" fill="#e8e8e8"/>${stripes}
    </g>
  </g>
</svg>`;
}

function runSelftest() {
    // Same scale on both renders, only the map band differs, so the comparison
    // isolates real displacement from the neutral-128 subpixel residual.
    const displaced = renderSvgToPng(buildSelftestSvg(true), 288);
    const neutral = renderSvgToPng(buildSelftestSvg(false), 288);
    const displacedPixels = displaced.pixels;
    const neutralPixels = neutral.pixels;
    let bandDiff = 0;
    let bandCount = 0;
    let outsideDiff = 0;
    let outsideCount = 0;
    const pngWidth = displaced.width;
    for (let y = 0; y < displaced.height; y++) {
        for (let x = 0; x < pngWidth; x++) {
            const i = (y * pngWidth + x) * 4;
            const diff =
                Math.abs(displacedPixels[i] - neutralPixels[i]) +
                Math.abs(displacedPixels[i + 1] - neutralPixels[i + 1]) +
                Math.abs(displacedPixels[i + 2] - neutralPixels[i + 2]);
            // Band: user y 36..60, x 12..84 at 2x output. Outside: clear of the
            // band plus blur spread headroom.
            if (y >= 76 && y < 116 && x >= 28 && x < 164) {
                bandDiff += diff;
                bandCount++;
            } else if (y < 60 || y > 136) {
                outsideDiff += diff;
                outsideCount++;
            }
        }
    }
    const bandMean = bandDiff / bandCount;
    const outsideMean = outsideDiff / outsideCount;
    console.log(`selftest: band mean diff/px = ${bandMean.toFixed(2)}, outside mean diff/px = ${outsideMean.toFixed(2)}`);
    if (bandMean < 50) {
        console.error("FAIL: feImage/feDisplacementMap appears to be a no-op in this resvg build.");
        process.exit(1);
    }
    if (outsideMean > 5) {
        console.error("FAIL: displacement leaked outside the map band (unexpected).");
        process.exit(1);
    }
    writeFileSync("liquid-glass-selftest.png", displaced.asPng());
    console.log("PASS: filter pipeline supported. Wrote liquid-glass-selftest.png for inspection.");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
    runSelftest();
} else {
    const positional = args.filter((arg) => !arg.startsWith("--"));
    if (positional.length === 0) {
        console.error("Usage: node render-liquid-glass.mjs input.svg [output.png] [--width 288] | --selftest");
        process.exit(1);
    }
    const widthFlagIndex = args.indexOf("--width");
    const width = widthFlagIndex >= 0 ? Number(args[widthFlagIndex + 1]) : 288;
    const inputPath = positional[0];
    const outputPath = positional[1] ?? inputPath.replace(/\.svg$/i, "") + ".png";
    const rendered = renderSvgToPng(readFileSync(inputPath, "utf8"), width);
    writeFileSync(outputPath, rendered.asPng());
    console.log(`Wrote ${outputPath} (${rendered.width}x${rendered.height})`);
}
