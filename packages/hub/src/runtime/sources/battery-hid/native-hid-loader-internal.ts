import type { Device as NodeHidDeviceInfo, HID as NodeHidDevice } from "node-hid";

export type NativeHidDeviceInfo = NodeHidDeviceInfo;

/** Exposes the read/write HID handle methods needed for short battery transactions. */
export type NativeHidDevice = Pick<
    NodeHidDevice,
    "close" | "getFeatureReport" | "readTimeout" | "sendFeatureReport" | "write"
>;

/** Defines the narrow `node-hid` surface owned by the battery HID runtime. */
export interface NativeHidModule {
    readonly HID: new(path: string, options?: { readonly nonExclusive?: boolean }) => NativeHidDevice;
    devices(): NativeHidDeviceInfo[];
}

/** Reports whether the optional native HID addon is available in this runtime. */
export type NativeHidLoadResult =
    | {
        readonly state: "loaded";
        readonly module: NativeHidModule;
    }
    | {
        readonly state: "unavailable";
        readonly error: unknown;
    };

export type NativeHidRequire = (id: "node-hid") => unknown;

/**
 * Loads `node-hid` through an injected require function without throwing to callers.
 *
 * @internal Callers outside the loader boundary should use `loadNativeHidModule()`
 * so package resolution and session caching stay in one place.
 */
export function loadNativeHidModuleWithRequire(requireModule: NativeHidRequire): NativeHidLoadResult {
    try {
        return {
            state: "loaded",
            module: parseNativeHidModule(requireModule("node-hid")),
        };
    } catch (error) {
        return {
            state: "unavailable",
            error,
        };
    }
}

function parseNativeHidModule(value: unknown): NativeHidModule {
    if (!isRecord(value)) {
        throw new TypeError("node-hid did not export an object.");
    }

    const nativeHidConstructor = value.HID;
    if (typeof nativeHidConstructor !== "function") {
        throw new TypeError("node-hid did not export HID.");
    }

    const readDeviceList = value.devices;
    if (typeof readDeviceList !== "function") {
        throw new TypeError("node-hid did not export devices().");
    }

    return {
        HID: nativeHidConstructor as NativeHidModule["HID"],
        devices: readDeviceList as NativeHidModule["devices"],
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
