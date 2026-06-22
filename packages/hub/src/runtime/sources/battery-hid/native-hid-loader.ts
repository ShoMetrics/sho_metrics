import { createRequire } from "node:module";

import {
    loadNativeHidModuleWithRequire,
    type NativeHidLoadResult,
} from "./native-hid-loader-internal";

// Anchor native package resolution to this module, not to the process entrypoint.
const requireNativeModule = createRequire(import.meta.url);

let cachedLoadResult: NativeHidLoadResult | undefined;

/** Loads the optional native HID addon on first use and caches the result for the plugin session. */
export function loadNativeHidModule(): NativeHidLoadResult {
    cachedLoadResult ??= loadNativeHidModuleWithRequire(requireNativeModule);
    return cachedLoadResult;
}
