import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/visual",
    testMatch: "**/*.visual.spec.ts",
    outputDir: "test-results/visual",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI
        ? [
            ["list"],
            ["html", { outputFolder: "playwright-report", open: "never" }],
        ]
        : "list",
    expect: {
        toMatchSnapshot: {
            maxDiffPixelRatio: 0,
        },
        toHaveScreenshot: {
            animations: "disabled",
            caret: "hide",
            maxDiffPixelRatio: 0.001,
        },
    },
    use: {
        trace: "retain-on-failure",
    },
});
