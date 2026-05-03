import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const testOutputDirectory = join(scriptDirectory, "..", ".test-dist");

mkdirSync(testOutputDirectory, { recursive: true });
writeFileSync(
    join(testOutputDirectory, "package.json"),
    `${JSON.stringify({ type: "commonjs" }, null, 4)}\n`,
    "utf8",
);
