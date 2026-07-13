import { existsSync, readFileSync } from "node:fs";

/**
 * Asserts the shipped plugin reads the published update feed and nothing else.
 *
 * The feed URL is substituted into the bundle when it is built, so the only way
 * a shipped plugin could read a developer's test feed is if that URL were baked
 * in. rollup.config.mjs refuses to do that outside a development build, and this
 * asserts the outcome rather than trusting the rule: the two guards fail
 * independently, and a build that slips past both would ship a plugin quietly
 * asking a stranger which version its users are behind.
 *
 * This runs from `postbuild` and nowhere else, which is what lets it assume the
 * bundle it reads is a production one. It does not check that, because it cannot:
 * inferring a build mode from an artifact is guessing, and a guess is exactly the
 * wrong thing to build a release guard on. The assumption is held up by the npm
 * script graph instead. `build` fixes SHO_METRICS_BUILD_MODE to production, and
 * rollup's cleanPluginOutput plugin empties bin/ before writing, so the file below
 * can only be the one that build just produced. `build:dev` and `watch` have no
 * postbuild, so a development bundle never reaches this at all.
 *
 * Do not add a standalone script for this. A second entry point is a second way
 * to point it at a bundle nobody promised anything about, and the failure then
 * reads as a leaked feed URL rather than as the mistake it is.
 */

const PRODUCTION_BUNDLE_PATH = "com.ez.sho-metrics.sdPlugin/bin/plugin.js";
const PRODUCTION_APPCAST_URL = "https://shometrics.github.io/update/windows-appcast.xml";
const APPCAST_URL_PATTERN = /https?:\/\/[^"'\s]*appcast[^"'\s]*/giu;

if (!existsSync(PRODUCTION_BUNDLE_PATH)) {
    throw new Error(`Production bundle is missing: ${PRODUCTION_BUNDLE_PATH}. Run "npm run build" first.`);
}

const bundle = readFileSync(PRODUCTION_BUNDLE_PATH, "utf8");
const bundledAppcastUrls = [...new Set(bundle.match(APPCAST_URL_PATTERN) ?? [])];
const failures = [];

// Without this, deleting the update feed entirely would satisfy the check below
// and this script would report success on a bundle that no longer has the
// behavior it exists to guard.
if (!bundledAppcastUrls.includes(PRODUCTION_APPCAST_URL)) {
    failures.push(
        `Production bundle does not read the published feed ${PRODUCTION_APPCAST_URL}, `
        + "so the check below proved nothing.",
    );
}

for (const bundledAppcastUrl of bundledAppcastUrls) {
    if (bundledAppcastUrl !== PRODUCTION_APPCAST_URL) {
        failures.push(`Production bundle reads an unexpected update feed: ${bundledAppcastUrl}.`);
    }
}

if (failures.length > 0) {
    throw new Error(`Production bundle check failed:\n${failures.map(failure => `- ${failure}`).join("\n")}`);
}

process.stdout.write(`Production bundle check passed: reads only ${PRODUCTION_APPCAST_URL}\n`);
