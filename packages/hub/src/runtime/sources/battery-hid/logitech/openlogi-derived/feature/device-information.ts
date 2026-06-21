/**
 * Implements the `DeviceInformation` feature (ID `0x0003`) that provides some
 * general information about the device.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/feature/device_information/mod.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

/**
 * Implements the `DeviceInformation` / `0x0003` feature.
 *
 * Source: OpenLogi `feature/device_information/mod.rs:DeviceInformationFeature`.
 */
export const OPENLOGI_DEVICE_INFORMATION_FEATURE_ID = 0x0003;
export const OPENLOGI_DEVICE_INFORMATION_STARTING_VERSION = 0;
export const OPENLOGI_DEVICE_INFORMATION_DEVICE_INFO_FUNCTION_ID = 0x00;

/**
 * Represents information about the device as reported by
 * [`DeviceInformationFeature::get_device_info`].
 *
 * Source: OpenLogi `feature/device_information/mod.rs:DeviceInformation`.
 */
export interface OpenLogiDeviceInformation {
    /**
     * The amount of entities in the device from which version information can
     * be retrieved using [`DeviceInformationFeature::get_fw_info`].
     */
    readonly entityCount: number;

    /**
     * A 4-byte random value serving as a unique identifier (among all devices
     * with the same [`Self::model_id`]) for the unit.
     *
     * This field was added in feature version 1 and will always be `0` for
     * older versions.
     */
    readonly unitId: readonly [number, number, number, number];

    /**
     * A bitfield about which transport protocols the device supports.
     *
     * This field was added in feature version 1 and will always be `0` for
     * older versions.
     */
    readonly transport: OpenLogiDeviceTransport;

    /**
     * The raw bitfield about which transport protocols the device supports.
     *
     * Derived glue: OpenLogi immediately decodes this byte into
     * `DeviceTransport`; ShoMetrics also preserves the raw byte for existing
     * diagnostics.
     */
    readonly transportByte: number;

    /**
     * A 6-byte array serving as the identifier for the device model.
     *
     * This array will consist of the application PIDs of the different
     * transport protocols supported by the device, as stated in
     * [`Self::transport`].
     * The 16-bit PID for every supported transport protocol will be appended
     * into this array, limiting the total amount of supported transport
     * protocols to three.
     *
     * This field was added in feature version 1 and will always be `0` for
     * older versions.
     */
    readonly modelId: readonly [number, number, number];

    /**
     * An 8-bit value representing an additional configurable attribute for a
     * given [`Self::model_id`], set on the production line. This could be the
     * color of the device.
     *
     * This field was added in feature version 2 and will always be `0` for
     * older versions.
     */
    readonly extendedModelId: number;

    /**
     * Additional capability flags of this feature.
     *
     * This field was added in feature version 4 together with the serial
     * number retrieval function. All capabilities will be flagged as
     * unsupported for older versions.
     */
    readonly capabilities: OpenLogiDeviceInformationCapabilities;
}

/**
 * Represents the bitfield stating which transport protocols a device supports.
 *
 * One given device can only support up to three transport protocols at a time.
 *
 * Source: OpenLogi `feature/device_information/mod.rs:DeviceTransport`.
 */
export interface OpenLogiDeviceTransport {
    /**
     * Whether the device supports USB.
     */
    readonly usb: boolean;

    /**
     * Whether the device supports eQuad, the protocol used by the Unifying
     * Receiver.
     */
    readonly eQuad: boolean;

    /**
     * Whether the device supports Bluetooth Low Energy as used by the Bolt
     * Receiver.
     */
    readonly btle: boolean;

    /**
     * Whether the device supports Bluetooth.
     */
    readonly bluetooth: boolean;
}

/**
 * Represents the bitfield stating which additional capabilities this feature
 * supports.
 *
 * Source: OpenLogi `feature/device_information/mod.rs:DeviceInformationCapabilities`.
 */
export interface OpenLogiDeviceInformationCapabilities {
    /**
     * Whether serial number retrieval is supported.
     *
     * This field was added in feature version 4 and will always be `false` for
     * older versions.
     */
    readonly serialNumber: boolean;
}

/**
 * Builds the payload for retrieving general information about the device and
 * its capabilities.
 *
 * Derived glue: OpenLogi `feature/device_information/mod.rs:DeviceInformationFeature::get_device_info`
 * calls endpoint function `0` with `[0; 3]`.
 */
export function buildOpenLogiDeviceInformationGetDeviceInfoRequestPayload(): readonly number[] {
    return [0x00, 0x00, 0x00];
}

/**
 * Parses general information about the device and its capabilities.
 *
 * Source: OpenLogi `feature/device_information/mod.rs:DeviceInformationFeature::get_device_info`.
 */
export function parseOpenLogiDeviceInformationPayload(payload: readonly number[]): OpenLogiDeviceInformation {
    const transportByte = payload[6] ?? 0;
    return {
        entityCount: payload[0] ?? 0,
        unitId: [
            payload[1] ?? 0,
            payload[2] ?? 0,
            payload[3] ?? 0,
            payload[4] ?? 0,
        ],
        transport: parseOpenLogiDeviceTransport(transportByte),
        transportByte,
        modelId: [
            readOpenLogiBigEndianUint16(payload[7] ?? 0, payload[8] ?? 0),
            readOpenLogiBigEndianUint16(payload[9] ?? 0, payload[10] ?? 0),
            readOpenLogiBigEndianUint16(payload[11] ?? 0, payload[12] ?? 0),
        ],
        extendedModelId: payload[13] ?? 0,
        capabilities: parseOpenLogiDeviceInformationCapabilities(payload[14] ?? 0),
    };
}

/**
 * Builds the payload for retrieving the serial number of the device.
 *
 * This function was added in feature version 4 and will likely result in
 * an [`v20::ErrorType::InvalidFunctionId`](crate::protocol::v20::ErrorType::InvalidFunctionId)
 * error for older versions, so
 * [`DeviceInformationCapabilities::serial_number`] should be verified
 * before calling.
 *
 * Derived glue: OpenLogi `feature/device_information/mod.rs:DeviceInformationFeature::get_serial_number`
 * calls endpoint function `2` with `[0; 3]`.
 *
 * Unused by ShoMetrics; kept for 1:1 `feature/device_information/mod.rs`
 * fact parity.
 */
export function buildUnusedOpenLogiDeviceInformationSerialNumberRequestPayloadForParity(): readonly number[] {
    return [0x00, 0x00, 0x00];
}

/**
 * Parses the serial number of the device.
 *
 * Source: OpenLogi `feature/device_information/mod.rs:DeviceInformationFeature::get_serial_number`.
 *
 * Unused by ShoMetrics; kept for 1:1 `feature/device_information/mod.rs`
 * fact parity.
 */
export function parseUnusedOpenLogiDeviceInformationSerialNumberPayloadForParity(
    payload: readonly number[],
): string | undefined {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(payload.slice(0, 12)));
    } catch {
        return undefined;
    }
}

// OpenLogi `feature/device_information/mod.rs:DeviceInformationFeature::get_fw_info`
// is not ported because the unused function depends on `bcd.rs`; by migration
// rule, unused functions that cascade into another OpenLogi file are left out
// until ShoMetrics consumes them.

/**
 * Decodes the bitfield stating which transport protocols a device supports.
 *
 * Source: OpenLogi `feature/device_information/mod.rs:impl From<u8> for DeviceTransport`.
 */
export function parseOpenLogiDeviceTransport(value: number): OpenLogiDeviceTransport {
    return {
        usb: (value & (1 << 3)) !== 0,
        eQuad: (value & (1 << 2)) !== 0,
        btle: (value & (1 << 1)) !== 0,
        bluetooth: (value & 1) !== 0,
    };
}

/**
 * Decodes the bitfield stating which additional capabilities this feature
 * supports.
 *
 * Source: OpenLogi `feature/device_information/mod.rs:impl From<u8> for DeviceInformationCapabilities`.
 */
export function parseOpenLogiDeviceInformationCapabilities(
    value: number,
): OpenLogiDeviceInformationCapabilities {
    return {
        serialNumber: (value & 1) !== 0,
    };
}

/**
 * Reads a big-endian 16-bit integer.
 *
 * Derived glue: OpenLogi `feature/device_information/mod.rs:DeviceInformationFeature::get_device_info`
 * uses `u16::from_be_bytes` for each model ID PID.
 */
function readOpenLogiBigEndianUint16(highByte: number, lowByte: number): number {
    return (highByte << 8) | lowByte;
}
