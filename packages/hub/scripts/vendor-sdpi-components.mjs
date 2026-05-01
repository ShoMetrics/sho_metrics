import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(packageDirectory, "node_modules", "sdpi-components");
const vendorDirectory = path.join(
    packageDirectory,
    "com.ez.sho-metrics.sdPlugin",
    "ui",
    "vendor",
    "sdpi-components",
);

const sourcePackageJsonPath = path.join(sourceDirectory, "package.json");
const sourceJavaScriptPath = path.join(sourceDirectory, "dist", "sdpi-components.js");
const sourceLicensePath = path.join(sourceDirectory, "LICENSE.md");
const vendorJavaScriptPath = path.join(vendorDirectory, "sdpi-components.js");
const vendorLicensePath = path.join(vendorDirectory, "LICENSE.md");
const vendorReadmePath = path.join(vendorDirectory, "README.md");

const sourcePackageJson = JSON.parse(await readFile(sourcePackageJsonPath, "utf8"));
const sourceRepository = sourcePackageJson.repository?.url
    ?.replace(/^git\+/, "")
    ?.replace(/\.git$/, "");

await mkdir(vendorDirectory, { recursive: true });
await copyFile(sourceJavaScriptPath, vendorJavaScriptPath);
await copyFile(sourceLicensePath, vendorLicensePath);
await writeFile(
    vendorReadmePath,
    [
        "# sdpi-components",
        "",
        `Source: ${sourceRepository ?? "https://github.com/GeekyEggo/sdpi-components"}`,
        `Version: ${sourcePackageJson.version}`,
        "Pinned by: packages/hub/package.json and package-lock.json",
        "Vendored file: dist/sdpi-components.js",
        "License: MIT, copied in LICENSE.md",
        "",
        "This file is vendored so the Stream Deck property inspector can load offline.",
        "Run `npm run vendor:sdpi-components` from packages/hub after dependency updates.",
        "",
    ].join("\n"),
);
