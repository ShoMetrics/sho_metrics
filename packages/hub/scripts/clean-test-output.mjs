import { rmSync } from "node:fs";

const testOutputDirectory = process.argv[2] ?? ".test-dist";

rmSync(testOutputDirectory, {
    recursive: true,
    force: true,
});
