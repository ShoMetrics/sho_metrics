import { createRequire } from "node:module";

import { loadNativeHidModuleWithRequire } from "./native-hid-loader-internal";

// Anchor native package resolution to this module, not to the process entrypoint.
const requireNativeModule = createRequire(import.meta.url);

let cachedLoadResult;

/** Loads `node-hid` on first use and caches the result for the plugin session. */
export function loadNativeHidModule() {
    cachedLoadResult ??= loadNativeHidModuleWithRequire(requireNativeModule);
    return cachedLoadResult;
}
