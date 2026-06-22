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
        coverage: {
            exclude: [
                "src/**/*.test.ts",
                "src/**/*.pi.test.tsx",
                "src/**/*.type-test.ts",
                "src/**/*.d.ts",
                "src/generated/**",
                "src/property-inspector/testing/**",
            ],
            include: [
                "src/**/*.ts",
                "src/**/*.tsx",
            ],
            provider: "v8",
        },
        environment: "node",
        exclude: [
            "node_modules/**",
            "src/**/*.pi.test.tsx",
        ],
        fileParallelism: false,
        include: [
            "src/**/*.test.ts",
        ],
        isolate: false,
        pool: "threads",
    },
});
