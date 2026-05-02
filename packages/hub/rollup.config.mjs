import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.ez.sho-metrics.sdPlugin";

const typescriptOptions = {
    compilerOptions: {
        sourceMap: isWatching,
    },
    mapRoot: isWatching ? "./" : undefined,
};

function replaceNodeEnvironment() {
    return {
        name: "replace-node-environment",
        renderChunk(code) {
            return {
                code: code.replaceAll("process.env.NODE_ENV", JSON.stringify("production")),
                map: null,
            };
        },
    };
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
        replaceNodeEnvironment(),
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
        replaceNodeEnvironment(),
        !isWatching && terser(),
    ],
};

export default [pluginConfig, propertyInspectorConfig];
