import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStreamDeckLocaleJson } from "../src/i18n/manifest-localization.ts";
import { manifestMessages } from "../src/i18n/manifest-messages.ts";

const pluginDirectory = "com.ez.sho-metrics.sdPlugin";
const manifestPath = join(pluginDirectory, "manifest.json");
const locales = ["en", "zh_CN", "ja"];

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

for (const locale of locales) {
    const localeJson = buildStreamDeckLocaleJson(manifest, manifestMessages, locale);
    writeFileSync(
        join(pluginDirectory, `${locale}.json`),
        `${JSON.stringify(localeJson, null, "\t")}\n`,
        "utf8",
    );
}
