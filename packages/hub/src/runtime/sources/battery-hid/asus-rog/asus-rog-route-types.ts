import type {
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../../settings/resolved-settings";
import type { AsusRogMouseBatteryParserKind } from "./asus-rog-protocol";

/**
 * Describes one ASUS keyboard HID collection accepted by the ShoMetrics allowlist.
 *
 * Route descriptors are not discovered from ASUS metadata at runtime. They are
 * curated facts from local probes or reference projects and are intentionally
 * narrow because ASUS battery reports are fixed-offset vendor messages.
 */
export interface AsusRogKeyboardRouteDescriptor {
    /** ASUS USB product id observed on the HID collection. */
    readonly productId: number;
    /** USB interface number that owns the vendor-defined battery collection. */
    readonly interfaceNumber: number;
    /** User-facing model label shown when this route becomes a candidate. */
    readonly displayName: string;
    /**
     * ShoMetrics canonical model key.
     *
     * This is not an ASUS protocol field. It is the stable product-family key
     * used for fallback identity and route coalescing.
     */
    readonly modelId: string;
    /** Transport represented by this PID in the current allowlist. */
    readonly transport: SystemPeripheralBindingTransport;
    /** Receiver family when the route is receiver-backed and known. */
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    /** Whether this exact battery route is locally verified or reference-backed. */
    readonly supportState: "supported" | "experimental";
}

/**
 * Describes one ASUS mouse HID collection with a known direct battery report shape.
 *
 * These are direct device PIDs from reference model files. Generic Omni mouse
 * receiver paths are excluded until paired-device lookup can prove the model.
 */
export interface AsusRogMouseRouteDescriptor {
    /** ASUS USB product id observed on the direct mouse HID collection. */
    readonly productId: number;
    /** Stable path fragment for the vendor collection endpoint, such as `mi_00`. */
    readonly endpointPathToken: string;
    /** User-facing model label shown when this route becomes a candidate. */
    readonly displayName: string;
    /**
     * ShoMetrics canonical model key.
     *
     * This is not an ASUS protocol field. It groups wired/receiver routes for
     * the same marketed device when no per-unit id is available.
     */
    readonly modelId: string;
    /** Transport represented by this PID in the current allowlist. */
    readonly transport: SystemPeripheralBindingTransport;
    /** Parser shape required by the reference model's battery report. */
    readonly parserKind: AsusRogMouseBatteryParserKind;
    /** HID report id used by this route's `12 07` battery GET request. */
    readonly reportId: number;
}
