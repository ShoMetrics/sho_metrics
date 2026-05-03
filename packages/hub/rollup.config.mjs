import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.ez.sho-metrics.sdPlugin";
const buildMode = normalizeBuildMode(process.env.SHO_METRICS_BUILD_MODE ?? (isWatching ? "development" : "production"));
const logLevel = normalizeLogLevel(process.env.SHO_METRICS_LOG_LEVEL ?? (buildMode === "production" ? "info" : "debug"));

const typescriptOptions = {
    compilerOptions: {
        sourceMap: isWatching,
    },
    mapRoot: isWatching ? "./" : undefined,
};

function replaceCompileTimeConstants() {
    return {
        name: "replace-compile-time-constants",
        renderChunk(code) {
            return {
                code: code
                    .replaceAll("process.env.NODE_ENV", JSON.stringify("production"))
                    .replaceAll("__BUILD_MODE__", JSON.stringify(buildMode))
                    .replaceAll("__LOG_LEVEL__", JSON.stringify(logLevel)),
                map: null,
            };
        },
    };
}

function normalizeBuildMode(value) {
    if (value === "development" || value === "staging" || value === "production") {
        return value;
    }

    throw new Error(`Unsupported SHO_METRICS_BUILD_MODE: ${value}`);
}

function normalizeLogLevel(value) {
    if (value === "error" || value === "warn" || value === "info" || value === "debug" || value === "trace") {
        return value;
    }

    throw new Error(`Unsupported SHO_METRICS_LOG_LEVEL: ${value}`);
}

/**
 * @type {import('rollup').RollupOptions}
 */
const pluginConfig = {
    input: "src/plugin.ts",
    external: ["@resvg/resvg-js"],
    output: {
        file: `${sdPlugin}/bin/plugin.js`,
        sourcemap: isWatching,
        sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
            return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
        },
    },
    plugins: [
        {
            name: "watch-externals",
            buildStart: function () {
                this.addWatchFile(`${sdPlugin}/manifest.json`);
            },
        },
        typescript(typescriptOptions),
        nodeResolve({
            browser: false,
            exportConditions: ["node"],
            preferBuiltins: true,
        }),
        commonjs(),
        json(),
        replaceCompileTimeConstants(),
        !isWatching && terser(),
        {
            name: "emit-module-package-file",
            generateBundle() {
                this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
            },
        },
    ],
};

/**
 * @type {import('rollup').RollupOptions}
 */
const propertyInspectorConfig = {
    input: "src/property-inspector/property-inspector.tsx",
    output: {
        file: `${sdPlugin}/ui/property-inspector.js`,
        format: "es",
        sourcemap: isWatching,
        sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
            return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
        },
    },
    plugins: [
        {
            name: "watch-property-inspector-assets",
            buildStart: function () {
                this.addWatchFile(`${sdPlugin}/ui/property-inspector.html`);
                this.addWatchFile(`${sdPlugin}/ui/property-inspector.css`);
            },
        },
        typescript(typescriptOptions),
        nodeResolve({
            browser: true,
            exportConditions: ["browser"],
        }),
        commonjs(),
        json(),
        replaceCompileTimeConstants(),
        !isWatching && terser(),
    ],
};

export default [pluginConfig, propertyInspectorConfig];
