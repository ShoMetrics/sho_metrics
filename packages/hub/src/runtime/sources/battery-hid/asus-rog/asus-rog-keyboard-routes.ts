import type { AsusRogKeyboardRouteDescriptor } from "./asus-rog-route-types";

/**
 * Keyboard battery routes verified by local ShoMetrics HID probes.
 *
 * These PIDs are known to answer the `12 01` wired-style keyboard battery
 * query or the equivalent device-PID wireless path with the parser used by
 * ShoMetrics.
 */
const ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES_FROM_LOCAL_PROBES: readonly AsusRogKeyboardRouteDescriptor[] =
    [
        {
            productId: 0x1b78,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope II 96 RX",
            modelId: "asus-rog-keyboard:strix-scope-ii-96-rx",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "supported",
        },
        {
            productId: 0x1b04,
            interfaceNumber: 1,
            displayName: "ROG Falchion RX Low Profile",
            modelId: "asus-rog-keyboard:falchion-rx-low-profile",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "supported",
        },
        {
            productId: 0x1a83,
            interfaceNumber: 1,
            displayName: "ROG Azoth",
            modelId: "asus-rog-keyboard:azoth",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "supported",
        },
        {
            productId: 0x1a85,
            interfaceNumber: 1,
            displayName: "ROG Azoth",
            modelId: "asus-rog-keyboard:azoth",
            transport: "usbReceiver",
            receiverKind: "unknownReceiver",
            supportState: "supported",
        },
    ];

/**
 * Keyboard route facts from OpenRGB's ASUS Aura USB detector.
 *
 * Source: OpenRGB
 * File: Controllers/AsusAuraUSBController/AsusAuraUSBControllerDetect.cpp
 * Commit: e7f8bc013694c04463266f48683324cede067b09
 * License: GPL-2.0-or-later
 *
 * Only product name, PID, interface, and usage-page facts are used here.
 * OpenRGB does not implement ASUS keyboard battery reads, so these routes stay
 * experimental until confirmed by local hardware or another battery reference.
 *
 * TUF keyboard PIDs are intentionally excluded from the ROG battery surface.
 * Do not include them in this route list unless the product scope and physical
 * battery tests are extended beyond ROG keyboards.
 */
const ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES_FROM_OPENRGB: readonly AsusRogKeyboardRouteDescriptor[] =
    [
        {
            productId: 0x190c,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope TKL",
            modelId: "asus-rog-keyboard:strix-scope-tkl",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x1a05,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope RX TKL Wireless Deluxe",
            modelId: "asus-rog-keyboard:strix-scope-rx-tkl-wireless-deluxe",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x1954,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope TKL PNK LTD",
            modelId: "asus-rog-keyboard:strix-scope-tkl-pnk-ltd",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x184d,
            interfaceNumber: 1,
            displayName: "ROG Claymore",
            modelId: "asus-rog-keyboard:claymore",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x193c,
            interfaceNumber: 1,
            displayName: "ROG Falchion",
            modelId: "asus-rog-keyboard:falchion",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x193e,
            interfaceNumber: 1,
            displayName: "ROG Falchion",
            modelId: "asus-rog-keyboard:falchion",
            transport: "usbReceiver",
            receiverKind: "unknownReceiver",
            supportState: "experimental",
        },
        {
            productId: 0x1875,
            interfaceNumber: 1,
            displayName: "ROG Strix Flare",
            modelId: "asus-rog-keyboard:strix-flare",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x18cf,
            interfaceNumber: 1,
            displayName: "ROG Strix Flare PNK LTD",
            modelId: "asus-rog-keyboard:strix-flare-pnk-ltd",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x18af,
            interfaceNumber: 1,
            displayName: "ROG Strix Flare CoD Black Ops 4 Edition",
            modelId: "asus-rog-keyboard:strix-flare-cod-black-ops-4-edition",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x19fc,
            interfaceNumber: 1,
            displayName: "ROG Strix Flare II Animate",
            modelId: "asus-rog-keyboard:strix-flare-ii-animate",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x19fe,
            interfaceNumber: 1,
            displayName: "ROG Strix Flare II",
            modelId: "asus-rog-keyboard:strix-flare-ii",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x18f8,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope",
            modelId: "asus-rog-keyboard:strix-scope",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x1951,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope RX",
            modelId: "asus-rog-keyboard:strix-scope-rx",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x1b12,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope RX EVA-02 Edition",
            modelId: "asus-rog-keyboard:strix-scope-rx-eva-02-edition",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x19f6,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope NX Wireless Deluxe",
            modelId: "asus-rog-keyboard:strix-scope-nx-wireless-deluxe",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x19f8,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope NX Wireless Deluxe",
            modelId: "asus-rog-keyboard:strix-scope-nx-wireless-deluxe",
            transport: "usbReceiver",
            receiverKind: "unknownReceiver",
            supportState: "experimental",
        },
        {
            productId: 0x1ab3,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope II",
            modelId: "asus-rog-keyboard:strix-scope-ii",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x1ab5,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope II RX",
            modelId: "asus-rog-keyboard:strix-scope-ii-rx",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
        {
            productId: 0x1aae,
            interfaceNumber: 1,
            displayName: "ROG Strix Scope II 96 Wireless",
            modelId: "asus-rog-keyboard:strix-scope-ii-96-wireless",
            transport: "usbWired",
            receiverKind: undefined,
            supportState: "experimental",
        },
    ];

/** Known ASUS ROG keyboard device-PID routes accepted by ShoMetrics. */
export const ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES: readonly AsusRogKeyboardRouteDescriptor[] =
    [
        ...ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES_FROM_LOCAL_PROBES,
        ...ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES_FROM_OPENRGB,
    ];
