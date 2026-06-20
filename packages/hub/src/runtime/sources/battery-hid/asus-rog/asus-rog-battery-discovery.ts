import type {
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../../settings/resolved-settings";
import { logger } from "../../../../logging/logger";
import type {
    NativeHidDeviceInfo,
    NativeHidModule,
} from "../native-hid-loader-internal";
import type {
    BatteryDeviceDiscoverer,
    BatteryDeviceDiscoveryCandidate,
} from "../../battery/battery-device-discovery";
import {
    ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE,
    ASUS_ROG_OMNI_RECEIVER_PRODUCT_ID,
    ASUS_ROG_VENDOR_ID,
    buildAsusRogKeyboardOmniBatteryRequest,
    buildAsusRogKeyboardWiredBatteryRequest,
    buildAsusRogMouseBatteryRequest,
    parseAsusRogKeyboardOmniBatteryReport,
    parseAsusRogKeyboardWiredBatteryReport,
    parseAsusRogMouseBatteryReport,
    type AsusRogBatteryParser,
    type AsusRogBatteryRequest,
} from "./asus-rog-protocol";
import {
    NativeAsusRogHidTransport,
    openNativeAsusRogHidTransport,
    type AsusRogBatteryReadResult,
} from "./asus-rog-reader";
import { ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES } from "./asus-rog-keyboard-routes";
import { ASUS_ROG_KNOWN_MOUSE_DIRECT_PID_ROUTES } from "./asus-rog-mouse-routes";

const ASUS_MANUFACTURER = "ASUS";
const ASUS_ROG_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS = 60_000;
const log = logger.for("Source:BatteryHID:AsusROG");

/**
 * Discovers allowlisted ASUS ROG keyboard and theory-backed mouse battery paths.
 *
 * ASUS reports are fixed-offset vendor commands, not self-describing feature
 * tables. Every path here must be backed by local probes or a named reference
 * model file; unknown ASUS PIDs are skipped without opening the device.
 */
export class AsusRogBatteryDeviceDiscoverer implements BatteryDeviceDiscoverer {
    constructor(private readonly nativeHidModule: NativeHidModule) {}

    discoverBatteryDevices(): Promise<
        readonly BatteryDeviceDiscoveryCandidate[]
    > {
        const candidates: BatteryDeviceDiscoveryCandidate[] = [];
        const scanSummary = createAsusRogScanSummary();

        for (const deviceInfo of this.nativeHidModule.devices()) {
            const route = resolveAsusRogBatteryRoute(deviceInfo);
            if (route === undefined) {
                continue;
            }
            scanSummary.matchedRouteCount += 1;

            const transport = this.openBatteryRoute(
                deviceInfo,
                route,
                scanSummary,
            );
            if (transport === undefined) {
                continue;
            }

            try {
                const battery = transport.exchange(
                    route.request,
                    route.parseReport,
                );
                recordAsusRogBatteryRead(scanSummary, battery);
                if (battery.state !== "battery") {
                    continue;
                }

                candidates.push(
                    buildAsusRogBatteryCandidate(deviceInfo, route),
                );
            } finally {
                transport.close();
            }
        }

        logAsusRogScanSummary(scanSummary);
        return Promise.resolve(candidates);
    }

    private openBatteryRoute(
        deviceInfo: NativeHidDeviceInfo,
        route: AsusRogBatteryRoute,
        scanSummary: AsusRogScanSummary,
    ): NativeAsusRogHidTransport | undefined {
        try {
            return openNativeAsusRogHidTransport(
                deviceInfo,
                (path) =>
                    new this.nativeHidModule.HID(path, { nonExclusive: true }),
            );
        } catch (error) {
            void error;
            // Opening an allowlisted path can still fail when the device is
            // unplugged mid-scan or another ASUS tool owns the collection.
            // Treat it like a transient no-data tick rather than aborting the
            // whole vendor scan.
            scanSummary.noDataCounts.ioError += 1;
            logAsusRogRouteOpenFailure(route);
            return undefined;
        }
    }
}

interface AsusRogBatteryRoute {
    /** Stable log/test id for the allowlist route, not a hardware identifier. */
    readonly routeId: string;
    /** User-facing model label from local tests or the route reference source. */
    readonly displayName: string;
    /**
     * ShoMetrics canonical model key.
     *
     * ASUS does not provide this value through the battery report. It is owned
     * by our allowlist and is used only for fallback identity/coalescing.
     */
    readonly modelId: string;
    readonly transport: SystemPeripheralBindingTransport;
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    readonly supportState: "supported" | "experimental";
    readonly request: AsusRogBatteryRequest;
    readonly parseReport: AsusRogBatteryParser;
}

function resolveAsusRogBatteryRoute(
    deviceInfo: NativeHidDeviceInfo,
): AsusRogBatteryRoute | undefined {
    if (!isSafeAsusRogVendorCollection(deviceInfo)) {
        return undefined;
    }

    const path = deviceInfo.path.toLowerCase();
    if (isAsusRogOmniKeyboardCollection(deviceInfo, path)) {
        // Omni exposes a shared receiver PID rather than a keyboard PID. Local
        // probes verified this exact MI_02 Col02 collection for keyboard
        // battery reads, but it still cannot identify which keyboard model is
        // paired. Keep the display/model generic until a paired-device lookup
        // exists.
        return {
            routeId: "keyboard-omni",
            displayName: "ASUS ROG Omni keyboard",
            modelId: "asus-rog-keyboard:omni",
            transport: "usbReceiver",
            receiverKind: "rogOmni",
            supportState: "supported",
            request: buildAsusRogKeyboardOmniBatteryRequest(),
            parseReport: parseAsusRogKeyboardOmniBatteryReport,
        };
    }

    // Device-PID keyboard routes use the same 12 01 parser as locally tested
    // wired keyboards. OpenRGB-derived routes are still allowlisted by exact
    // PID/interface/usage and become no-data if the response shape disagrees.
    const keyboardRoute = ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES.find(
        (route) =>
            route.productId === deviceInfo.productId &&
            route.interfaceNumber === deviceInfo.interface &&
            path.includes(
                `mi_${route.interfaceNumber.toString(16).padStart(2, "0")}`,
            ) &&
            deviceInfo.usagePage === ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE,
    );
    if (keyboardRoute !== undefined) {
        return {
            routeId: `keyboard-${formatProductId(keyboardRoute.productId)}`,
            displayName: keyboardRoute.displayName,
            modelId: keyboardRoute.modelId,
            transport: keyboardRoute.transport,
            receiverKind: keyboardRoute.receiverKind,
            supportState: keyboardRoute.supportState,
            request: buildAsusRogKeyboardWiredBatteryRequest(),
            parseReport: parseAsusRogKeyboardWiredBatteryReport,
        };
    }

    // Mouse routes are direct device PIDs from G-Helper model facts. Generic
    // Omni mouse collections are intentionally absent until paired-device
    // lookup can narrow the receiver to a known mouse model.
    const mouseRoute = ASUS_ROG_KNOWN_MOUSE_DIRECT_PID_ROUTES.find(
        (route) =>
            route.productId === deviceInfo.productId &&
            path.includes(route.endpointPathToken) &&
            isVendorDefinedUsagePage(deviceInfo.usagePage),
    );
    if (mouseRoute !== undefined) {
        return {
            routeId: `mouse-${formatProductId(mouseRoute.productId)}`,
            displayName: mouseRoute.displayName,
            modelId: mouseRoute.modelId,
            transport: mouseRoute.transport,
            receiverKind:
                mouseRoute.transport === "usbReceiver"
                    ? "unknownReceiver"
                    : undefined,
            supportState: "experimental",
            request: buildAsusRogMouseBatteryRequest(mouseRoute.reportId),
            parseReport: (report) =>
                parseAsusRogMouseBatteryReport(report, {
                    reportId: mouseRoute.reportId,
                    parserKind: mouseRoute.parserKind,
                }),
        };
    }

    return undefined;
}

function isAsusRogOmniKeyboardCollection(
    deviceInfo: NativeHidDeviceInfo,
    path: string,
): boolean {
    // The Omni receiver PID is shared, so PID alone is not a device identity.
    // The tested keyboard battery collection is the vendor-defined MI_02 Col02
    // collection; other receiver collections may be mouse or input routes.
    return (
        deviceInfo.productId === ASUS_ROG_OMNI_RECEIVER_PRODUCT_ID &&
        deviceInfo.interface === 2 &&
        path.includes("mi_02&col02") &&
        deviceInfo.usagePage === ASUS_ROG_KEYBOARD_VENDOR_USAGE_PAGE
    );
}

function isSafeAsusRogVendorCollection(
    deviceInfo: NativeHidDeviceInfo,
): deviceInfo is NativeHidDeviceInfo & {
    readonly path: string;
} {
    if (
        deviceInfo.vendorId !== ASUS_ROG_VENDOR_ID ||
        deviceInfo.path === undefined
    ) {
        return false;
    }

    const path = deviceInfo.path.toLowerCase();
    return (
        !path.endsWith("\\kbd") &&
        !isStandardKeyboardCollection(deviceInfo) &&
        !isStandardMouseCollection(deviceInfo)
    );
}

function buildAsusRogBatteryCandidate(
    deviceInfo: NativeHidDeviceInfo,
    route: AsusRogBatteryRoute,
): BatteryDeviceDiscoveryCandidate {
    // Candidate identity intentionally preserves route diagnostics such as HID
    // interface and usage, but the stable descriptor key later ignores
    // route-local fields. ASUS HID serial strings are not upgraded to trusted
    // per-unit identity here because local stress runs observed unrelated ASUS
    // SDK traffic on the same queues.
    return {
        candidateId: `asus-rog-${route.routeId}-${sanitizeCandidateIdPart(deviceInfo.path ?? "no-path")}`,
        displayName: route.displayName,
        transport: route.transport,
        receiverKind: route.receiverKind,
        identity: {
            vendorId: ASUS_ROG_VENDOR_ID,
            productId: deviceInfo.productId,
            manufacturer: deviceInfo.manufacturer ?? ASUS_MANUFACTURER,
            productName: deviceInfo.product ?? route.displayName,
            serialNumber: deviceInfo.serialNumber,
            interfaceNumber: deviceInfo.interface,
            usagePage: deviceInfo.usagePage,
            usageId: deviceInfo.usage,
            bindingTransport: route.transport,
            receiverKind: route.receiverKind,
            vendorUnitId: undefined,
            modelId: route.modelId,
            receiverSlot: undefined,
        },
        supportState: route.supportState,
        isExperimental: true,
        batteryTelemetryFreshness: "fresh",
        diagnostics: {
            sourcePathId: deviceInfo.path,
        },
    };
}

type AsusRogNoDataReason = Extract<
    AsusRogBatteryReadResult,
    { readonly state: "noData" }
>["reason"];

interface AsusRogScanSummary {
    readonly noDataCounts: Record<AsusRogNoDataReason, number>;
    matchedRouteCount: number;
    batteryCandidateCount: number;
    unrelatedReportCount: number;
}

function createAsusRogScanSummary(): AsusRogScanSummary {
    return {
        matchedRouteCount: 0,
        batteryCandidateCount: 0,
        unrelatedReportCount: 0,
        noDataCounts: {
            knownNoData: 0,
            timeout: 0,
            malformed: 0,
            outOfRange: 0,
            ioError: 0,
        },
    };
}

function recordAsusRogBatteryRead(
    summary: AsusRogScanSummary,
    result: AsusRogBatteryReadResult,
): void {
    summary.unrelatedReportCount += result.unrelatedReportCount;
    if (result.state === "battery") {
        summary.batteryCandidateCount += 1;
        return;
    }

    summary.noDataCounts[result.reason] += 1;
}

function logAsusRogScanSummary(summary: AsusRogScanSummary): void {
    log.atDebug()
        .everyMs(
            "asus-rog-scan",
            ASUS_ROG_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() =>
            [
                "ASUS ROG battery scan",
                `matchedRoutes=${summary.matchedRouteCount}`,
                `candidates=${summary.batteryCandidateCount}`,
                `noData=${formatNoDataCounts(summary.noDataCounts)}`,
                `unrelatedReports=${summary.unrelatedReportCount}`,
            ].join(" "),
        );
}

function logAsusRogRouteOpenFailure(route: AsusRogBatteryRoute): void {
    log.atDebug()
        .everyMs(
            `asus-rog-open:${route.routeId}`,
            ASUS_ROG_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() =>
            [
                "ASUS ROG battery route open failed",
                `route=${route.routeId}`,
                `kind=${route.request.kind}`,
            ].join(" "),
        );
}

function formatNoDataCounts(
    counts: Record<AsusRogNoDataReason, number>,
): string {
    return (
        Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([reason, count]) => `${reason}:${count}`)
            .join(",") || "none"
    );
}

function isStandardKeyboardCollection(
    deviceInfo: NativeHidDeviceInfo,
): boolean {
    return deviceInfo.usagePage === 0x0001 && deviceInfo.usage === 0x0006;
}

function isStandardMouseCollection(deviceInfo: NativeHidDeviceInfo): boolean {
    return deviceInfo.usagePage === 0x0001 && deviceInfo.usage === 0x0002;
}

function isVendorDefinedUsagePage(usagePage: number | undefined): boolean {
    return usagePage !== undefined && (usagePage & 0xff00) === 0xff00;
}

function sanitizeCandidateIdPart(value: string): string {
    return (
        value
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/gu, "-")
            .replace(/-+/gu, "-")
            .replace(/^[-._]+|[-._]+$/gu, "")
            .slice(0, 96) || "unknown"
    );
}

function formatProductId(productId: number): string {
    return productId.toString(16).padStart(4, "0");
}
