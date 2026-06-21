/**
 * Specific device feature implementations.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/feature/mod.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

/**
 * A bitfield describing some properties of a feature.
 *
 * Documentation is taken from <https://drive.google.com/file/d/1ULmw9uJL8b8iwwUo5xjSS9F5Zvno-86y/view>.
 *
 * Source: OpenLogi `feature/mod.rs:FeatureType`.
 */
export interface OpenLogiFeatureType {
    /**
     * An obsolete feature is a feature that has been replaced by a newer one,
     * but is advertised in order for older SWs to still be able to support the
     * feature (in case the old SW does not know yet the newer one).
     */
    readonly obsolete: boolean;

    /**
     * A SW hidden feature is a feature that should not be known/managed/used
     * by end user configuration SW. The host should ignore this type of
     * features.
     */
    readonly hidden: boolean;

    /**
     * A hidden feature that has been disabled for user software. Used for
     * internal testing and manufacturing.
     */
    readonly engineering: boolean;

    /**
     * A manufacturing feature that can be permanently deactivated. It is
     * usually also hidden and engineering.
     *
     * This field was added in feature version 2 and will be `false` for all
     * older versions.
     */
    readonly manufacturingDeactivatable: boolean;

    /**
     * A compliance feature that can be permanently deactivated. It is usually
     * also hidden and engineering.
     *
     * This field was added in feature version 2 and will be `false` for all
     * older versions.
     */
    readonly complianceDeactivatable: boolean;
}

/**
 * Decodes a raw HID++ feature type bitfield.
 *
 * Source: OpenLogi `feature/mod.rs:impl From<u8> for FeatureType`.
 */
export function parseOpenLogiFeatureType(value: number): OpenLogiFeatureType {
    return {
        obsolete: (value & (1 << 7)) !== 0,
        hidden: (value & (1 << 6)) !== 0,
        engineering: (value & (1 << 5)) !== 0,
        manufacturingDeactivatable: (value & (1 << 4)) !== 0,
        complianceDeactivatable: (value & (1 << 3)) !== 0,
    };
}

/**
 * Encodes a HID++ feature type bitfield.
 *
 * Source: OpenLogi `feature/mod.rs:impl From<FeatureType> for u8`.
 */
export function encodeOpenLogiFeatureType(value: OpenLogiFeatureType): number {
    let raw = 0;

    if (value.obsolete) {
        raw |= 1 << 7;
    }
    if (value.hidden) {
        raw |= 1 << 6;
    }
    if (value.engineering) {
        raw |= 1 << 5;
    }
    if (value.manufacturingDeactivatable) {
        raw |= 1 << 4;
    }
    if (value.complianceDeactivatable) {
        raw |= 1 << 3;
    }

    return raw;
}
