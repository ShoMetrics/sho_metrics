/**
 * Implements the `DeviceTypeAndName` feature (ID `0x0005`) that provides some
 * information about the marketing type and name of a device.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/feature/device_type_and_name/mod.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

/**
 * Implements the `DeviceTypeAndName` / `0x0005` feature.
 *
 * Source: OpenLogi `feature/device_type_and_name/mod.rs:DeviceTypeAndNameFeature`.
 */
export const OPENLOGI_DEVICE_TYPE_AND_NAME_FEATURE_ID = 0x0005;
export const OPENLOGI_DEVICE_TYPE_AND_NAME_STARTING_VERSION = 0;
export const OPENLOGI_DEVICE_TYPE_AND_NAME_COUNT_FUNCTION_ID = 0x00;
export const OPENLOGI_DEVICE_TYPE_AND_NAME_CHUNK_FUNCTION_ID = 0x01;
export const OPENLOGI_DEVICE_TYPE_AND_NAME_TYPE_FUNCTION_ID = 0x02;

/**
 * Represents the type of a HID++2.0 device as returned by the
 * [`DeviceTypeAndNameFeature`] feature.
 *
 * Source: OpenLogi `feature/device_type_and_name/mod.rs:DeviceType`.
 */
export type OpenLogiDeviceType =
    | "keyboard"
    | "remoteControl"
    | "numpad"
    | "mouse"
    | "trackpad"
    | "trackball"
    | "presenter"
    | "receiver"
    | "headset"
    | "webcam"
    | "steeringWheel"
    | "joystick"
    | "gamepad"
    | "dock"
    | "speaker"
    | "microphone"
    | "illuminationLight"
    | "programmableController"
    | "carSimPedals"
    | "adapter";

/**
 * Builds the payload for retrieving the amount of characters in the marketing
 * name of the device.
 *
 * Derived glue: OpenLogi `feature/device_type_and_name/mod.rs:DeviceTypeAndNameFeature::get_device_name_count`
 * calls endpoint function `0` with `[0; 3]`.
 */
export function buildOpenLogiDeviceNameCountRequestPayload(): readonly number[] {
    return [0x00, 0x00, 0x00];
}

/**
 * Parses the amount of characters in the marketing name of the device.
 *
 * Source: OpenLogi `feature/device_type_and_name/mod.rs:DeviceTypeAndNameFeature::get_device_name_count`.
 */
export function parseOpenLogiDeviceNameCountPayload(payload: readonly number[]): number {
    return payload[0] ?? 0;
}

/**
 * Builds the payload for retrieving a chunk of characters of the marketing
 * name of the device, starting at a specific index (inclusive).
 *
 * Depending on the device and channel capabilities, this function will return
 * at most 3 or 16 characters of the device name.
 *
 * Use this function in conjunction with
 * `parseOpenLogiDeviceNameCountPayload` to retrieve the whole device name. A
 * convenience wrapper implementing this functionality lives in the ShoMetrics
 * reader because it performs multiple HID transactions.
 *
 * Derived glue: OpenLogi `feature/device_type_and_name/mod.rs:DeviceTypeAndNameFeature::get_device_name`
 * calls endpoint function `1` with `[index, 0x00, 0x00]`.
 */
export function buildOpenLogiDeviceNameChunkRequestPayload(index: number): readonly number[] {
    return [index & 0xFF, 0x00, 0x00];
}

/**
 * Parses a chunk of characters of the marketing name of the device.
 *
 * Source: OpenLogi `feature/device_type_and_name/mod.rs:DeviceTypeAndNameFeature::get_device_name`.
 */
export function parseOpenLogiDeviceNameChunkPayload(payload: readonly number[]): readonly number[] {
    return [...payload];
}

/**
 * Builds the payload for retrieving the marketing type of the device.
 *
 * Derived glue: OpenLogi `feature/device_type_and_name/mod.rs:DeviceTypeAndNameFeature::get_device_type`
 * calls endpoint function `2` with `[0; 3]`.
 */
export function buildOpenLogiDeviceTypeRequestPayload(): readonly number[] {
    return [0x00, 0x00, 0x00];
}

/**
 * Parses the marketing type of the device.
 *
 * Source: OpenLogi `feature/device_type_and_name/mod.rs:DeviceTypeAndNameFeature::get_device_type`.
 */
export function parseOpenLogiDeviceTypePayload(payload: readonly number[]): OpenLogiDeviceType | undefined {
    return parseOpenLogiDeviceType(payload[0] ?? 0);
}

/**
 * Decodes a raw HID++ device type.
 *
 * Source: OpenLogi `feature/device_type_and_name/mod.rs:DeviceType`.
 */
export function parseOpenLogiDeviceType(value: number): OpenLogiDeviceType | undefined {
    switch (value) {
        case 0:
            return "keyboard";
        case 1:
            return "remoteControl";
        case 2:
            return "numpad";
        case 3:
            return "mouse";
        case 4:
            return "trackpad";
        case 5:
            return "trackball";
        case 6:
            return "presenter";
        case 7:
            return "receiver";
        case 8:
            return "headset";
        case 9:
            return "webcam";
        case 10:
            return "steeringWheel";
        case 11:
            return "joystick";
        case 12:
            return "gamepad";
        case 13:
            return "dock";
        case 14:
            return "speaker";
        case 15:
            return "microphone";
        case 16:
            return "illuminationLight";
        case 17:
            return "programmableController";
        case 18:
            return "carSimPedals";
        case 19:
            return "adapter";
        default:
            return undefined;
    }
}
