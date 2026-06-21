import {
    LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
} from "../hidpp-protocol";
import type { NativeLogitechHidppTransport } from "../logitech-hidpp-reader";
import {
    OPENLOGI_BOLT_MAX_RECEIVER_SLOTS,
} from "../openlogi-derived/hid/inventory";
import { parseOpenLogiHidpp10RegisterResponse } from "../openlogi-derived/protocol/v10";
import {
    buildOpenLogiBoltDevicePairingInformationRequest,
    parseOpenLogiBoltDevicePairingInformation,
} from "../openlogi-derived/receiver/bolt";
import type {
    LogitechReceiverDescriptor,
    LogitechReceiverSlotRoute,
} from "./receiver-routes";

/**
 * Logitech HID++ receiver facts cross-checked against OpenLogi.
 *
 * Source: OpenLogi
 * Files: `crates/openlogi-hid/src/transport.rs`,
 * `crates/openlogi-hid/src/route.rs`,
 * `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * Repository: https://github.com/AprilNEA/OpenLogi
 * Author: AprilNEA <dev@aprilnea.me>
 * Original license for cited OpenLogi HID files: MIT OR Apache-2.0
 * ShoMetrics integration is distributed under the project license.
 */
export const LOGITECH_OPENLOGI_RECEIVERS: readonly LogitechReceiverDescriptor[] = [
    {
        receiverKind: "bolt",
        productId: LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
        displayPrefix: "Logitech Bolt device",
    },
    {
        receiverKind: "unifying",
        productId: LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
        displayPrefix: "Logitech Unifying device",
    },
    {
        receiverKind: "unifying",
        productId: LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
        displayPrefix: "Logitech Unifying device",
    },
];

/** Discovers online Bolt slots through pairing registers. */
export function discoverOnlineBoltSlots(transport: NativeLogitechHidppTransport): readonly LogitechReceiverSlotRoute[] {
    const slots: LogitechReceiverSlotRoute[] = [];
    for (let receiverSlot = 1; receiverSlot <= OPENLOGI_BOLT_MAX_RECEIVER_SLOTS; receiverSlot += 1) {
        const request = buildOpenLogiBoltDevicePairingInformationRequest(receiverSlot);
        const result = transport.exchange(request);
        if (result.state !== "response") {
            continue;
        }

        const registerResponse = parseOpenLogiHidpp10RegisterResponse(result.report, request);
        if (registerResponse.state !== "register") {
            continue;
        }

        const parsed = parseOpenLogiBoltDevicePairingInformation(registerResponse.payload);
        if (parsed.state !== "pairingInformation" || !parsed.pairingInformation.online) {
            continue;
        }

        slots.push({
            receiverSlot,
            vendorUnitId: parsed.pairingInformation.unitId,
            wirelessProductId: parsed.pairingInformation.wirelessProductId,
            deviceKind: parsed.pairingInformation.deviceKind,
        });
    }

    return slots;
}

/** Discovers online Unifying slots through OpenLogi receiver arrival events. */
export function discoverOnlineUnifyingSlots(transport: NativeLogitechHidppTransport): readonly LogitechReceiverSlotRoute[] {
    const events = transport.drainReceiverConnectionEvents("unifying");
    if (events === undefined) {
        return [];
    }

    return events
        .filter(event => event.online)
        .map(event => ({
            receiverSlot: event.receiverSlot,
            wirelessProductId: event.wirelessProductId,
            deviceKind: event.deviceKind,
        }));
}
