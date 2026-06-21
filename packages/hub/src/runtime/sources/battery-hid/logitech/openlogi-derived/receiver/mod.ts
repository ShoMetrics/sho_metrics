/**
 * Logitech receiver family facts derived from OpenLogi's receiver module.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/receiver/mod.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: 0BSD
 * ShoMetrics adaptation is distributed under the project license.
 */

/** Identifies the receiver itself in HID++ register requests. */
export const OPENLOGI_RECEIVER_DEVICE_INDEX = 0xFF;

/** Names the receiver variants OpenLogi detects. */
export type OpenLogiReceiverKind = "bolt" | "unifying";

export type OpenLogiReceiverDeviceKind =
    | "unknown"
    | "keyboard"
    | "mouse"
    | "numpad"
    | "presenter"
    | "remote"
    | "trackball"
    | "touchpad"
    | "tablet"
    | "gamepad"
    | "joystick"
    | "headset";

export interface OpenLogiReceiverPairingInformation {
    readonly wirelessProductId: number;
    readonly deviceKind: OpenLogiReceiverDeviceKind;
    readonly encrypted: boolean;
    readonly online: boolean;
    /** Bolt pairing registers expose a non-zero per-device unit id. */
    readonly unitId?: string;
}

export type OpenLogiReceiverPairingInformationParseResult =
    | {
        readonly state: "pairingInformation";
        readonly pairingInformation: OpenLogiReceiverPairingInformation;
    }
    | {
        readonly state: "unsupported";
        readonly rawKind: number;
    }
    | {
        readonly state: "malformed";
    };

export interface OpenLogiReceiverDeviceConnection {
    readonly receiverSlot: number;
    readonly deviceKind: OpenLogiReceiverDeviceKind;
    readonly encrypted: boolean;
    readonly online: boolean;
    readonly wirelessProductId: number;
}

export type OpenLogiReceiverEventParseResult =
    | {
        readonly state: "deviceConnection";
        readonly connection: OpenLogiReceiverDeviceConnection;
    }
    | {
        readonly state: "unrelated";
    }
    | {
        readonly state: "unsupported";
        readonly rawKind: number;
    }
    | {
        readonly state: "malformed";
    };

/**
 * Parses device-kind values shared by Bolt and Unifying receiver code.
 *
 * Source: OpenLogi `receiver/bolt.rs:DeviceKind` and
 * `receiver/unifying.rs:DeviceKind`.
 */
export function parseOpenLogiCommonReceiverDeviceKind(rawKind: number): OpenLogiReceiverDeviceKind | undefined {
    switch (rawKind) {
        case 0x00:
            return "unknown";
        case 0x01:
            return "keyboard";
        case 0x02:
            return "mouse";
        case 0x03:
            return "numpad";
        case 0x04:
            return "presenter";
    }

    return undefined;
}
