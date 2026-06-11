import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.ez.sho-metrics.sdPlugin";
const buildMode = normalizeBuildMode(process.env.SHO_METRICS_BUILD_MODE ?? (isWatching ? "development" : "production"));
const devLocaleOverride = normalizeDevLocaleOverride(process.env.SHO_METRICS_DEV_LOCALE_OVERRIDE);
const devLocaleOverrideLiteral = devLocaleOverride === undefined ? "undefined" : JSON.stringify(devLocaleOverride);
const logLevel = normalizeLogLevel(process.env.SHO_METRICS_LOG_LEVEL ?? (buildMode === "production" ? "info" : "debug"));

const typescriptOptions = {
    compilerOptions: {
        sourceMap: isWatching,
    },
    mapRoot: isWatching ? "./" : undefined,
};

const sharedColorCompensationSourceFiles = [
    "src/color-compensation/messages.ts",
    "src/color-compensation/patterns.ts",
    "src/color-compensation/types.ts",
    "src/view-rendering/color-compensation-patterns.ts",
];

function watchSharedColorCompensationSources() {
    return {
        name: "watch-shared-color-compensation-sources",
        buildStart() {
            for (const sourceFile of sharedColorCompensationSourceFiles) {
                this.addWatchFile(sourceFile);
            }
        },
    };
}

function replaceCompileTimeConstants() {
    return {
        name: "replace-compile-time-constants",
        renderChunk(code) {
            return {
                code: code
                    .replaceAll("process.env.NODE_ENV", JSON.stringify("production"))
                    .replaceAll("__BUILD_MODE__", JSON.stringify(buildMode))
                    .replaceAll("__DEV_LOCALE_OVERRIDE__", devLocaleOverrideLiteral)
                    .replaceAll("__LOG_LEVEL__", JSON.stringify(logLevel)),
                map: null,
            };
        },
    };
}

function copyRuntimeAssets() {
    const assetDirectories = [
        ["assets/fonts", `${sdPlugin}/assets/fonts`],
    ];

    return {
        name: "copy-runtime-assets",
        buildStart() {
            for (const [sourceDirectory] of assetDirectories) {
                for (const sourceFile of listRuntimeAssetFiles(sourceDirectory)) {
                    this.addWatchFile(sourceFile);
                }
            }
        },
        writeBundle() {
            for (const [sourceDirectory, destinationDirectory] of assetDirectories) {
                fs.rmSync(destinationDirectory, { recursive: true, force: true });
                fs.cpSync(sourceDirectory, destinationDirectory, { recursive: true });
            }
        },
    };
}

function listRuntimeAssetFiles(sourceDirectory) {
    return fs.readdirSync(sourceDirectory, { withFileTypes: true })
        .flatMap(directoryEntry => {
            const sourcePath = path.join(sourceDirectory, directoryEntry.name);

            return directoryEntry.isDirectory()
                ? listRuntimeAssetFiles(sourcePath)
                : [sourcePath];
        });
}

function normalizeBuildMode(value) {
    if (value === "development" || value === "staging" || value === "production") {
        return value;
    }

    throw new Error(`Unsupported SHO_METRICS_BUILD_MODE: ${value}`);
}

function normalizeDevLocaleOverride(value) {
    if (value === undefined || value === "") {
        return undefined;
    }

    if (value === "en" || value === "zh_CN" || value === "ja") {
        return value;
    }

    throw new Error(`Unsupported SHO_METRICS_DEV_LOCALE_OVERRIDE: ${value}`);
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
    input: {
        plugin: "src/plugin.ts",
        "custom-http-transform-worker": "src/runtime/sources/custom-http/custom-http-transform-worker-thread.ts",
    },
    external: ["@resvg/resvg-js"],
    output: {
        dir: `${sdPlugin}/bin`,
        entryFileNames: "[name].js",
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
        watchSharedColorCompensationSources(),
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
        copyRuntimeAssets(),
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
        watchSharedColorCompensationSources(),
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
