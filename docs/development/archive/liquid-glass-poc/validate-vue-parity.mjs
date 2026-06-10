// Byte-level parity check: the lib functions ported into
// liquid-glass-vue-parity.html vs the original Vue lib TypeScript sources.
// Node 24 runs the .ts files directly (type stripping).
//
// Usage (from packages/hub):
//   node scripts/playground/validate-vue-parity.mjs [path-to-vue-lib-src]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const vueLibDir = process.argv[2]
    ?? "<path-to-vue-web-liquid-glass-main>/src/lib";

// Minimal ImageData shim for the node side (both implementations use it).
globalThis.ImageData = class ImageData {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
    }
};

// --- load the ported lib out of each HTML that embeds a copy ---
function extractPortedLib(htmlFileName) {
    const htmlPath = join(dirname(fileURLToPath(import.meta.url)), htmlFileName);
    const html = readFileSync(htmlPath, "utf8");
    const beginMarker = "==== VUE-LIB-PORT BEGIN ====";
    const endMarker = "/* ==== VUE-LIB-PORT END ==== */";
    const beginIndex = html.indexOf(beginMarker);
    const endIndex = html.indexOf(endMarker);
    if (beginIndex < 0 || endIndex < 0) throw new Error(`VUE-LIB-PORT markers not found in ${htmlFileName}`);
    const afterBeginComment = html.indexOf("*/", beginIndex) + 2;
    const libSource = html.slice(afterBeginComment, endIndex);
    return new Function(`${libSource}
        return { CONVEX, CONVEX_CIRCLE, CONCAVE, LIP,
            calculateDisplacementMap, calculateDisplacementMapWithShape, calculateRefractionSpecular };`)();
}
const PORTED_HTML_FILES = ["liquid-glass-vue-parity.html", "liquid-glass-playground.html"];

// --- load the originals ---
const orig = {
    ...(await import(pathToFileURL(join(vueLibDir, "surfaceEquations.ts")).href)),
    ...(await import(pathToFileURL(join(vueLibDir, "displacementMap.ts")).href)),
    ...(await import(pathToFileURL(join(vueLibDir, "specular.ts")).href)),
};

let failures = 0;

function compareArrays(name, a, b, tolerance = 0) {
    if (a.length !== b.length) {
        console.error(`FAIL ${name}: length ${a.length} != ${b.length}`);
        failures++;
        return;
    }
    let mismatches = 0;
    let firstIndex = -1;
    let maxDelta = 0;
    for (let i = 0; i < a.length; i++) {
        const delta = Math.abs(a[i] - b[i]);
        if (delta > tolerance) {
            mismatches++;
            if (firstIndex < 0) firstIndex = i;
            maxDelta = Math.max(maxDelta, delta);
        }
    }
    if (mismatches > 0) {
        console.error(`FAIL ${name}: ${mismatches}/${a.length} mismatches, first at ${firstIndex} (${a[firstIndex]} vs ${b[firstIndex]}), max delta ${maxDelta}`);
        failures++;
    } else {
        console.log(`PASS ${name} (${a.length} values identical)`);
    }
}

// Configs mirroring the parity page presets (size XL + small, bg + thumb).
const cases = [
    { name: "XL-bg",    lut: [190, 30, "CONVEX", 1.3],        shape: [480, 80, 480, 80, 30, 100], spec: [480, 80, 40, 30] },
    { name: "XL-thumb", lut: [160, 15, "CONVEX_CIRCLE", 1.5], shape: [116, 72, 116, 72, 15, 100], spec: [116, 72, 36, 15] },
    { name: "small-bg", lut: [100, 15, "CONVEX", 1.3],        shape: [240, 42, 240, 42, 15, 100], spec: [240, 42, 21, 15] },
];

for (const htmlFileName of PORTED_HTML_FILES) {
    console.log(`\n== ${htmlFileName} ==`);
    const ported = extractPortedLib(htmlFileName);
    for (const testCase of cases) {
        const [thickness, bezel, surfaceName, refractiveIndex] = testCase.lut;
        const lutPorted = ported.calculateDisplacementMap(thickness, bezel, ported[surfaceName].fn, refractiveIndex);
        const lutOrig = orig.calculateDisplacementMap(thickness, bezel, orig[surfaceName].fn, refractiveIndex);
        compareArrays(`${testCase.name} LUT`, lutPorted, lutOrig);

        const shapePorted = ported.calculateDisplacementMapWithShape(...testCase.shape, lutPorted, "pill", 1.0, 2, 2);
        const shapeOrig = orig.calculateDisplacementMapWithShape(...testCase.shape, lutOrig, "pill", 1.0, 2, 2);
        compareArrays(`${testCase.name} displacement map`, shapePorted.data, shapeOrig.data);

        const specPorted = ported.calculateRefractionSpecular(...testCase.spec, undefined, 2);
        const specOrig = orig.calculateRefractionSpecular(...testCase.spec, undefined, 2);
        compareArrays(`${testCase.name} specular map`, specPorted.data, specOrig.data);
    }
}

if (failures > 0) {
    console.error(`\n${failures} comparison(s) FAILED`);
    process.exit(1);
}
console.log("\nAll parity checks passed: ported lib is byte-identical to the Vue lib.");
