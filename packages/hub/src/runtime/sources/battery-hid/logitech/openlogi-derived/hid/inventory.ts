/**
 * Receiver online-discovery requests derived from OpenLogi inventory flow.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license: MIT OR Apache-2.0
 * ShoMetrics adaptation is distributed under the project license.
 */

import type { LogitechHidppRequest } from "../../logitech-hidpp-frame";
import {
    buildOpenLogiHidpp10SetRegisterRequest,
} from "../protocol/v10";
import { OPENLOGI_RECEIVER_DEVICE_INDEX } from "../receiver/mod";

export const OPENLOGI_BOLT_MAX_RECEIVER_SLOTS = 6;
export const OPENLOGI_RECEIVER_ARRIVAL_DRAIN_TIMEOUT_MILLISECONDS = 1500;

const RECEIVER_CONNECTIONS_REGISTER = 0x02;

/**
 * Builds the receiver register write that makes Unifying/Bolt emit online-device events.
 *
 * Source: OpenLogi `receiver/bolt.rs:trigger_device_arrival` and
 * `receiver/unifying.rs:trigger_device_arrival`; used by `inventory.rs`.
 */
export function buildOpenLogiTriggerDeviceArrivalRequest(): LogitechHidppRequest {
    return buildOpenLogiHidpp10SetRegisterRequest({
        receiverSlot: OPENLOGI_RECEIVER_DEVICE_INDEX,
        registerAddress: RECEIVER_CONNECTIONS_REGISTER,
        parameters: [0x02, 0x00, 0x00],
    });
}
