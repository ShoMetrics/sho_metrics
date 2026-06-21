/**
 * Implements the `Root` feature (ID `0x0000`) that every device supports by
 * default.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/feature/root.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

import {
    parseOpenLogiFeatureType,
    type OpenLogiFeatureType,
} from "./mod";

/**
 * Implements the `Root` / `0x0000` feature that every HID++2.0 device
 * supports by default.
 *
 * This implementation is added automatically to any OpenLogi `Device`
 * created using `Device::new`.
 *
 * Source: OpenLogi `feature/root.rs:RootFeature`.
 */
export const OPENLOGI_ROOT_FEATURE_ID = 0x0000;

/**
 * The endpoint this feature talks to. The root feature always lives at
 * feature index 0.
 *
 * Source: OpenLogi `feature/root.rs:RootFeature::endpoint`.
 */
export const OPENLOGI_ROOT_FEATURE_INDEX = 0x00;
export const OPENLOGI_ROOT_STARTING_VERSION = 0;
export const OPENLOGI_ROOT_GET_FEATURE_FUNCTION_ID = 0x00;
export const OPENLOGI_ROOT_PING_FUNCTION_ID = 0x01;

/**
 * Represents information about a specific feature as returned by the
 * `RootFeature::get_feature` function.
 *
 * Source: OpenLogi `feature/root.rs:FeatureInformation`.
 */
export interface OpenLogiRootFeatureInformation {
    /**
     * The index of the feature in the version table.
     * This is used for invocations of functions of that feature.
     */
    readonly index: number;

    /**
     * The type of the feature.
     */
    readonly typ: OpenLogiFeatureType;

    /**
     * The latest supported version of the feature.
     *
     * Multi-version features are always backwards compatible as long as the
     * feature ID does not change, meaning functions implemented for an older
     * version of the same feature will behave as expected for every later
     * version.
     *
     * This field was added in feature version 1 and will be `0` for all older
     * versions.
     */
    readonly version: number;
}

/**
 * Builds the payload for retrieving information about a specific feature ID,
 * including its index in the feature table, its type and its version.
 *
 * Derived glue: OpenLogi `feature/root.rs:RootFeature::get_feature` calls
 * endpoint function `0` with `[(id >> 8) as u8, id as u8, 0x00]`.
 */
export function buildOpenLogiRootGetFeatureRequestPayload(featureId: number): readonly number[] {
    return [(featureId >> 8) & 0xFF, featureId & 0xFF, 0x00];
}

/**
 * Retrieves information about a specific feature ID, including its index
 * in the feature table, its type and its version.
 *
 * If the feature is not supported by the device, `undefined` is returned.
 *
 * If the device only supports the root feature version 1, the
 * `OpenLogiRootFeatureInformation.version` field will be `0` for all features.
 *
 * Source: OpenLogi `feature/root.rs:RootFeature::get_feature`.
 */
export function parseOpenLogiRootGetFeatureResponsePayload(
    payload: readonly number[],
): OpenLogiRootFeatureInformation | undefined {
    if (payload[0] === 0) {
        return undefined;
    }

    return {
        index: payload[0] ?? 0,
        typ: parseOpenLogiFeatureType(payload[1] ?? 0),
        version: payload[2] ?? 0,
    };
}

/**
 * Builds the payload for pinging the device with an arbitrary data byte. The
 * device will respond with the same data if communication succeeds.
 *
 * The underlying function, as described in the protocol specification, will
 * also look up the protocol version supported by the device.
 * This is not implemented here, as the
 * `crate::protocol::determine_version` function does so in a more
 * general manner.
 *
 * Derived glue: OpenLogi `feature/root.rs:RootFeature::ping` calls endpoint
 * function `1` with `[0x00, 0x00, data]`.
 *
 * Unused by ShoMetrics; kept for 1:1 `feature/root.rs` fact parity.
 */
export function buildUnusedOpenLogiRootPingRequestPayloadForParity(data: number): readonly number[] {
    return [0x00, 0x00, data & 0xFF];
}

/**
 * Parses the data byte returned by the Root ping function.
 *
 * Source: OpenLogi `feature/root.rs:RootFeature::ping`.
 *
 * Unused by ShoMetrics; kept for 1:1 `feature/root.rs` fact parity.
 */
export function parseUnusedOpenLogiRootPingResponsePayloadForParity(payload: readonly number[]): number {
    return payload[2] ?? 0;
}
