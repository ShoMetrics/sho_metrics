import { SOLAAR_LOGITECH_KNOWN_LIGHTSPEED_RECEIVER_ROUTES } from "../solaar-derived/solaar-logitech-receiver-routes";
import type {
    LogitechReceiverDescriptor,
    LogitechReceiverSlotRoute,
} from "./receiver-routes";

export const LOGITECH_LIGHTSPEED_RECEIVERS: readonly LogitechReceiverDescriptor[] =
    SOLAAR_LOGITECH_KNOWN_LIGHTSPEED_RECEIVER_ROUTES.map(route => ({
        receiverKind: "lightspeed" as const,
        productId: route.productId,
        displayPrefix: route.displayPrefix,
    }));

/** Returns the single LIGHTSPEED receiver route to probe. */
export function discoverLightspeedSlotsToProbe(): readonly LogitechReceiverSlotRoute[] {
    // Solaar models LIGHTSPEED as a receiver family, but most LIGHTSPEED
    // dongles are single-device routes. Probe slot 1 only and let the HID++2
    // battery read decide whether a device is online and supported.
    return [{ receiverSlot: 1 }];
}
