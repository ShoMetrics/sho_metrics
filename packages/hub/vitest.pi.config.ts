import { defineConfig } from "vitest/config";

export default defineConfig({
    esbuild: {
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
            },
        },
    },
    test: {
        environment: "node",
        fileParallelism: false,
        include: [
            "src/property-inspector/**/*.pi.test.tsx",
        ],
        isolate: true,
        pool: "forks",
        setupFiles: [
            "src/property-inspector/testing/dom-test-setup.ts",
        ],
    },
});
