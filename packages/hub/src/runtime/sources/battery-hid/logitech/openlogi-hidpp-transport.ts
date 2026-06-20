/**
 * OpenLogi-isomorphic Logitech HID++ route and transport helpers.
 *
 * Source: OpenLogi
 * Files:
 * - `crates/openlogi-hid/src/transport.rs`
 * - `crates/openlogi-hid/src/route.rs`
 * - `crates/openlogi-hid/src/inventory.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 */

import {
    LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
    LOGITECH_HIDPP_BLE_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
    LOGITECH_HIDPP_GAMING_USAGE_PAGE,
    LOGITECH_HIDPP_G_SERIES_WIRED_LONG_USAGE,
    LOGITECH_HIDPP_VENDOR_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
    type LogitechReceiverSlot,
} from "./hidpp-protocol";

// A fresh one-shot enumerator has no node-ledger history to replay. OpenLogi
// retries the same enumerator so channels and caches can warm up before giving
// up on a transiently unhealthy device.
export const OPENLOGI_HIDPP_ONESHOT_ATTEMPTS = 4;
export const OPENLOGI_HIDPP_ONESHOT_RETRY_DELAY_MILLISECONDS = 300;

// Bound the full feature walk so one dead node cannot wedge the whole receiver.
// OpenLogi's Bolt arrival-event drain already consumes 1.5s of this budget.
export const OPENLOGI_HIDPP_PROBE_BUDGET_MILLISECONDS = 5_000;

// Unifying wireless round trips can be slower than Bolt. OpenLogi caps each
// slot independently so one slow device does not block the rest of the receiver.
export const OPENLOGI_HIDPP_UNIFYING_SLOT_PROBE_MILLISECONDS = 3_500;

export type OpenLogiHidppRoute =
    | {
        readonly kind: "bolt";
        readonly receiverUid: string;
        readonly receiverSlot: LogitechReceiverSlot;
    }
    | {
        readonly kind: "unifying";
        readonly receiverUid: string;
        readonly receiverSlot: LogitechReceiverSlot;
    }
    | {
        readonly kind: "direct";
        readonly vendorId: number;
        readonly productId: number;
    };

export function buildOpenLogiDeviceRoute(input: {
    readonly receiverUid?: string;
    readonly receiverProductId: number;
    readonly receiverVendorId: number;
    readonly receiverSlot: LogitechReceiverSlot;
}): OpenLogiHidppRoute | undefined {
    // Receiver-backed routes carry a receiver uid and slot; direct Bluetooth,
    // USB-C, and wired nodes are addressed at HID++ device index `0xff`.
    if (input.receiverUid !== undefined) {
        return isOpenLogiUnifyingReceiverProductId(input.receiverProductId)
            ? {
                kind: "unifying",
                receiverUid: input.receiverUid,
                receiverSlot: input.receiverSlot,
            }
            : {
                kind: "bolt",
                receiverUid: input.receiverUid,
                receiverSlot: input.receiverSlot,
            };
    }

    return input.receiverSlot === LOGITECH_HIDPP_DIRECT_DEVICE_SLOT
        ? {
            kind: "direct",
            vendorId: input.receiverVendorId,
            productId: input.receiverProductId,
        }
        : undefined;
}

export function openLogiDeviceIndexForRoute(route: OpenLogiHidppRoute): LogitechReceiverSlot {
    return route.kind === "direct"
        ? LOGITECH_HIDPP_DIRECT_DEVICE_SLOT
        : route.receiverSlot;
}

export function isOpenLogiLogitechHidppLongCollection(input: {
    readonly vendorId: number;
    readonly usagePage: number;
    readonly usageId: number;
}): boolean {
    return input.vendorId === LOGITECH_HIDPP_VENDOR_ID &&
        openLogiLongCollection(input.usagePage, input.usageId) !== undefined;
}

export function isOpenLogiLongOnlyCollection(input: {
    readonly usagePage: number;
    readonly usageId: number;
}): boolean {
    return openLogiLongCollection(input.usagePage, input.usageId)?.longOnly === true;
}

export function normalizeOpenLogiWindowsCollectionPath(path: string): string {
    // Windows exposes short and long HID++ collections as sibling paths. Dropping
    // `ColXX` and the collection-specific instance suffix lets the enumerator
    // pair them into one native node.
    const lowerPath = path.toLowerCase();
    const pathSegments = lowerPath.split("#");
    const hardwareIdSegment = pathSegments[1];
    const instanceIdSegment = pathSegments[2];
    if (hardwareIdSegment === undefined || instanceIdSegment === undefined) {
        return lowerPath;
    }

    const hardwareKey = hardwareIdSegment
        .split("&")
        .filter(segment => !segment.startsWith("col"))
        .join("&");
    const instanceKey = instanceIdSegment.includes("&")
        ? instanceIdSegment.slice(0, instanceIdSegment.lastIndexOf("&"))
        : instanceIdSegment;

    return `${hardwareKey}#${instanceKey}`;
}

/**
 * Detects Linux hid-logitech-dj child nodes that OpenLogi skips.
 *
 * OpenLogi checks whether a known receiver PID appears as a parent sysfs path
 * component. The receiver node itself is not a child; it must have another
 * component after the receiver marker.
 */
export function isOpenLogiReceiverChildSysfsPath(path: string): boolean {
    return [
        LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
        LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
        LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    ].some(productId => {
        const marker = `:${LOGITECH_HIDPP_VENDOR_ID.toString(16).padStart(4, "0").toUpperCase()}:` +
            `${productId.toString(16).padStart(4, "0").toUpperCase()}.`;
        const markerIndex = path.indexOf(marker);
        return markerIndex >= 0 && path.slice(markerIndex + marker.length).includes("/");
    });
}

export function shouldRetryOpenLogiOneShotEnumeration(input: {
    readonly allNodesHealthy: boolean;
    readonly attempt: number;
}): boolean {
    return !input.allNodesHealthy && input.attempt < OPENLOGI_HIDPP_ONESHOT_ATTEMPTS;
}

function isOpenLogiUnifyingReceiverProductId(productId: number): boolean {
    return productId === LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID ||
        productId === LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID;
}

function openLogiLongCollection(
    usagePage: number,
    usageId: number,
): { readonly longOnly: boolean } | undefined {
    if (usagePage === LOGITECH_HIDPP_CLASSIC_USAGE_PAGE && usageId === LOGITECH_HIDPP_CLASSIC_LONG_USAGE) {
        return { longOnly: false };
    }

    if (usagePage === LOGITECH_HIDPP_GAMING_USAGE_PAGE && usageId === LOGITECH_HIDPP_BLE_LONG_USAGE) {
        return { longOnly: true };
    }

    if (usagePage === LOGITECH_HIDPP_GAMING_USAGE_PAGE && usageId === LOGITECH_HIDPP_G_SERIES_WIRED_LONG_USAGE) {
        return { longOnly: false };
    }

    return undefined;
}
