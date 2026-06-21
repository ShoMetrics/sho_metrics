/**
 * Logitech receiver product-id facts cross-checked against Solaar.
 *
 * Source: Solaar `lib/logitech_receiver/base_usb.py`
 * Copyright (C) 2012-2013 Daniel Pavel
 * License: GPL-2.0-or-later according to the source file header.
 *
 * This file uses product-id facts only. No Solaar runtime code is copied.
 */

export interface SolaarLogitechReceiverRoute {
    readonly productId: number;
    readonly displayPrefix: string;
}

// Solaar keeps only Logitech receiver product ids that support HID++ in this
// receiver table. LIGHTSPEED receiver entries use USB interface 2 there; this
// ShoMetrics route still does not hard-filter interface because native HID
// enumeration can omit interface metadata on some platforms.
export const SOLAAR_LOGITECH_KNOWN_LIGHTSPEED_RECEIVER_ROUTES = [
    { productId: 0xC539, displayPrefix: "Logitech LIGHTSPEED device" },
    { productId: 0xC53A, displayPrefix: "Logitech LIGHTSPEED device" },
    { productId: 0xC53D, displayPrefix: "Logitech LIGHTSPEED device" },
    { productId: 0xC53F, displayPrefix: "Logitech LIGHTSPEED device" },
    { productId: 0xC541, displayPrefix: "Logitech LIGHTSPEED device" },
    { productId: 0xC545, displayPrefix: "Logitech LIGHTSPEED device" },
    { productId: 0xC547, displayPrefix: "Logitech LIGHTSPEED device" },
    { productId: 0xC54D, displayPrefix: "Logitech LIGHTSPEED device" },
] as const satisfies readonly SolaarLogitechReceiverRoute[];
