import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateLocalizedMessagePlaceholders } from "../src/i18n/format.ts";
import { appMessages } from "../src/i18n/messages.ts";
import {
    buildStreamDeckLocaleJson,
    validateManifestLocalizationCatalog,
} from "../src/i18n/manifest-localization.ts";
import { manifestMessages } from "../src/i18n/manifest-messages.ts";

const pluginDirectory = "com.ez.sho-metrics.sdPlugin";
const manifestPath = join(pluginDirectory, "manifest.json");
const locales = ["en", "zh_CN", "ja"];

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errorList = [
    ...validateManifestLocalizationCatalog(manifest, manifestMessages),
    ...validateCatalogPlaceholders("appMessages", appMessages),
    ...validateCatalogPlaceholders("manifestMessages.root", manifestMessages.root),
    ...Object.entries(manifestMessages.actions).flatMap(([actionUuid, actionMessages]) => [
        ...validateCatalogPlaceholders(`manifestMessages.actions.${actionUuid}`, actionMessages),
        ...validateStatePlaceholders(actionUuid, actionMessages.states),
        ...validateCatalogPlaceholders(
            `manifestMessages.actions.${actionUuid}.encoder.triggerDescription`,
            actionMessages.encoder?.triggerDescription ?? {},
        ),
    ]),
    ...validateGeneratedLocaleFiles(manifest),
];

if (errorList.length > 0) {
    throw new Error(`i18n check failed:\n${errorList.map((error) => `- ${error}`).join("\n")}`);
}

function validateGeneratedLocaleFiles(manifest) {
    return locales.flatMap((locale) => {
        const localePath = join(pluginDirectory, `${locale}.json`);
        const expected = `${JSON.stringify(buildStreamDeckLocaleJson(manifest, manifestMessages, locale), null, "\t")}\n`;

        if (!existsSync(localePath)) {
            return [`Generated locale file is missing: ${localePath}`];
        }

        const actual = readFileSync(localePath, "utf8");
        return actual === expected ? [] : [`Generated locale file is stale: ${localePath}`];
    });
}

function validateStatePlaceholders(actionUuid, states) {
    return (states ?? []).flatMap((state, index) => validateCatalogPlaceholders(
        `manifestMessages.actions.${actionUuid}.states.${index}`,
        state,
    ));
}

function validateCatalogPlaceholders(label, value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
    }

    if (isLocalizedMessage(value)) {
        const mismatchedLocales = validateLocalizedMessagePlaceholders(value);
        return mismatchedLocales.map((locale) => `${label} placeholder mismatch: ${locale}`);
    }

    return Object.entries(value).flatMap(([key, childValue]) => (
        validateCatalogPlaceholders(`${label}.${key}`, childValue)
    ));
}

function isLocalizedMessage(value) {
    return Boolean(
        value
            && typeof value === "object"
            && !Array.isArray(value)
            && typeof value.en === "string"
            && typeof value.zh_CN === "string"
            && typeof value.ja === "string",
    );
}
