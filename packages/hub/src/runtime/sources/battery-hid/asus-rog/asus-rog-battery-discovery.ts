import type {
    ResolvedSystemPeripheralIdentity,
    SystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind,
} from "../../../../settings/resolved-settings";
import { logger } from "../../../../logging/logger";
import { monotonicNowMilliseconds } from "../../../../shared/clock";
import { buildBatteryMetricKeyFromIdentity } from "../../battery/battery-metric-key";
import type {
    NativeHidDevice,
    NativeHidDeviceInfo,
    NativeHidModule,
} from "../native-hid-loader-internal";
import type { BatteryDeviceDiscoveryCandidate } from "../../battery/battery-device-discovery";
import type { VendorHidBatteryReader } from "../../battery/vendor-hid-battery-reader";
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
import {
    ASUS_ROG_KNOWN_KEYBOARD_DEVICE_PID_ROUTES,
    ASUS_ROG_KNOWN_OMNI_KEYBOARD_PRODUCT_ROUTES,
} from "./asus-rog-keyboard-routes";
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
export class AsusRogBatteryReader implements VendorHidBatteryReader {
    private readonly bindingByMetricKey = new Map<string, AsusRogBatteryRouteBinding>();

    constructor(private readonly nativeHidModule: NativeHidModule) {}

    discoverBatteryDevices(
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ): Promise<readonly BatteryDeviceDiscoveryCandidate[]> {
        const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        const candidates: BatteryDeviceDiscoveryCandidate[] = [];
        const scanSummary = createAsusRogScanSummary();
        scanSummary.enumeratedDeviceCount = deviceInfoList.length;
        const omniPairingByReceiverInstanceKey = readAsusRogOmniPairingByReceiverInstanceKey(
            deviceInfoList,
            (path) =>
                new this.nativeHidModule.HID(path, { nonExclusive: true }),
        );

        for (const deviceInfo of deviceInfoList) {
            const route = resolveAsusRogBatteryRoute(deviceInfo, omniPairingByReceiverInstanceKey);
            if (route === undefined) {
                continue;
            }
            scanSummary.matchedRouteCount += 1;
            recordAsusRogRouteDiagnostic(scanSummary, route, deviceInfo, "matched");

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
                recordAsusRogRouteDiagnostic(
                    scanSummary,
                    route,
                    deviceInfo,
                    battery.state === "battery" ? "battery" : battery.reason,
                );
                if (battery.state !== "battery") {
                    continue;
                }

                const candidate = buildAsusRogBatteryCandidate(deviceInfo, route, battery.reading.percent);
                candidates.push(candidate);
                this.bindingByMetricKey.set(buildBatteryMetricKeyFromIdentity(candidate.identity), {
                    deviceInfo,
                    route,
                });
            } finally {
                transport.close();
            }
        }

        logAsusRogScanSummary(scanSummary, monotonicNowMilliseconds() - startedAtMonotonicMilliseconds);
        return Promise.resolve(candidates);
    }

    readBatteryDevice(metricKey: string): Promise<BatteryDeviceDiscoveryCandidate | undefined> {
        const binding = this.bindingByMetricKey.get(metricKey);
        if (binding === undefined) {
            return Promise.resolve(undefined);
        }

        const scanSummary = createAsusRogScanSummary();
        const transport = this.openBatteryRoute(binding.deviceInfo, binding.route, scanSummary);
        if (transport === undefined) {
            return Promise.resolve(undefined);
        }

        try {
            const candidate = this.readBatteryCandidateFromTransport(binding.deviceInfo, binding.route, transport);
            if (candidate === undefined) {
                return Promise.resolve(undefined);
            }

            // ASUS battery reports do not expose a live per-unit identity. Stale-binding protection here is the
            // exact cached HID path/VID/PID/interface route plus the ASUS battery report parser rejecting unrelated
            // responses, not a second identity read. Do not add a cached identity self-compare; it looks safer than
            // it is and cannot detect that the live device changed.
            return Promise.resolve(candidate);
        } finally {
            transport.close();
        }
    }

    readBatteryDeviceFromIdentity(
        metricKey: string,
        identity: ResolvedSystemPeripheralIdentity,
        deviceInfoList: readonly NativeHidDeviceInfo[],
    ): Promise<BatteryDeviceDiscoveryCandidate | undefined> {
        if (identity.vendorId !== ASUS_ROG_VENDOR_ID) {
            return Promise.resolve(undefined);
        }

        for (const deviceInfo of deviceInfoList) {
            const route = resolveAsusRogSelectedBatteryRoute(deviceInfo, identity);
            if (route === undefined) {
                continue;
            }

            const scanSummary = createAsusRogScanSummary();
            const transport = this.openBatteryRoute(deviceInfo, route, scanSummary);
            if (transport === undefined) {
                continue;
            }

            try {
                const candidate = this.readBatteryCandidateFromTransport(deviceInfo, route, transport);
                if (candidate === undefined) {
                    continue;
                }
                if (buildBatteryMetricKeyFromIdentity(candidate.identity) !== metricKey) {
                    continue;
                }

                this.bindingByMetricKey.set(metricKey, { deviceInfo, route });
                return Promise.resolve(candidate);
            } finally {
                transport.close();
            }
        }

        return Promise.resolve(undefined);
    }

    private readBatteryCandidateFromTransport(
        deviceInfo: NativeHidDeviceInfo,
        route: AsusRogBatteryRoute,
        transport: NativeAsusRogHidTransport,
    ): BatteryDeviceDiscoveryCandidate | undefined {
        const battery = transport.exchange(route.request, route.parseReport);
        return battery.state === "battery"
            ? buildAsusRogBatteryCandidate(deviceInfo, route, battery.reading.percent)
            : undefined;
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
            recordAsusRogRouteDiagnostic(scanSummary, route, deviceInfo, "openError");
            logAsusRogRouteOpenFailure(route);
            return undefined;
        }
    }
}

function readAsusRogOmniPairingByReceiverInstanceKey(
    deviceInfoList: readonly NativeHidDeviceInfo[],
    openDevice: (path: string) => NativeHidDevice,
): ReadonlyMap<string, readonly number[]> {
    const pairingByReceiverInstanceKey = new Map<string, readonly number[]>();
    const omniPairingCollections = deviceInfoList.filter((deviceInfo): deviceInfo is NativeHidDeviceInfo & { readonly path: string } =>
        deviceInfo.vendorId === ASUS_ROG_VENDOR_ID &&
        deviceInfo.productId === ASUS_ROG_OMNI_RECEIVER_PRODUCT_ID &&
        deviceInfo.path !== undefined &&
        deviceInfo.path.toLowerCase().includes("mi_02&col01"));

    for (const [index, deviceInfo] of omniPairingCollections.entries()) {
        let device: NativeHidDevice | undefined;
        const startedAtMonotonicMilliseconds = monotonicNowMilliseconds();
        try {
            device = openDevice(deviceInfo.path);
            device.write(padAsusRogDiagnosticReport([0x01, 0xa0, 0x00, 0x00]));
            const report = device.readTimeout(500);
            const pairedProductIds = readAsusRogOmniPairedProductIds(report);
            pairingByReceiverInstanceKey.set(
                formatAsusRogReceiverInstanceKey(deviceInfo.path),
                pairedProductIds,
            );
            log.atInfo()
                .everyMs(`asus-rog-omni-pairing-probe:${index}`, ASUS_ROG_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS)
                .log(() => [
                    "asusRogOmniPairingProbe",
                    `index=${index}`,
                    `pathKey=${formatAsusRogPathKey(deviceInfo.path)}`,
                    `outcome=${report.length === 0 ? "timeout" : "response"}`,
                    `pairedPids=${formatAsusRogProductIds(pairedProductIds)}`,
                    `durationMs=${monotonicNowMilliseconds() - startedAtMonotonicMilliseconds}`,
                ].join(" "));
        } catch {
            log.atInfo()
                .everyMs(`asus-rog-omni-pairing-probe:${index}`, ASUS_ROG_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS)
                .log(() => [
                    "asusRogOmniPairingProbe",
                    `index=${index}`,
                    `pathKey=${formatAsusRogPathKey(deviceInfo.path)}`,
                    "outcome=ioError",
                    `durationMs=${monotonicNowMilliseconds() - startedAtMonotonicMilliseconds}`,
                ].join(" "));
        } finally {
            device?.close();
        }
    }

    return pairingByReceiverInstanceKey;
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
     * by our allowlist and is used only for fallback identity and duplicate
     * detection.
     */
    readonly modelId: string;
    readonly transport: SystemPeripheralBindingTransport;
    readonly receiverKind: SystemPeripheralReceiverKind | undefined;
    readonly supportState: "supported" | "experimental";
    readonly request: AsusRogBatteryRequest;
    readonly parseReport: AsusRogBatteryParser;
}

interface AsusRogBatteryRouteBinding {
    readonly deviceInfo: NativeHidDeviceInfo;
    readonly route: AsusRogBatteryRoute;
}

function resolveAsusRogBatteryRoute(
    deviceInfo: NativeHidDeviceInfo,
    omniPairingByReceiverInstanceKey: ReadonlyMap<string, readonly number[]>,
): AsusRogBatteryRoute | undefined {
    if (!isSafeAsusRogVendorCollection(deviceInfo)) {
        return undefined;
    }

    const path = deviceInfo.path.toLowerCase();
    if (isAsusRogOmniKeyboardCollection(deviceInfo, path)) {
        const pairedProductId = omniPairingByReceiverInstanceKey
            .get(formatAsusRogReceiverInstanceKey(deviceInfo.path))?.[0];
        const pairedProduct = pairedProductId === undefined
            ? undefined
            : ASUS_ROG_KNOWN_OMNI_KEYBOARD_PRODUCT_ROUTES.find(route => route.productId === pairedProductId);
        const formattedPairedProductId = pairedProductId === undefined
            ? undefined
            : formatProductId(pairedProductId);
        return {
            routeId: `keyboard-omni-${formattedPairedProductId ?? "generic"}`,
            displayName: pairedProduct?.displayName
                ?? (formattedPairedProductId === undefined
                    ? "Generic ROG Omni Keyboard"
                    : `Generic ROG Omni Keyboard ${formattedPairedProductId}`),
            modelId: pairedProduct?.modelId
                ?? `asus-rog-keyboard:omni-${formattedPairedProductId ?? "generic"}`,
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

function resolveAsusRogSelectedBatteryRoute(
    deviceInfo: NativeHidDeviceInfo,
    identity: ResolvedSystemPeripheralIdentity,
): AsusRogBatteryRoute | undefined {
    if (
        identity.productId !== undefined &&
        deviceInfo.productId !== identity.productId
    ) {
        return undefined;
    }
    if (
        identity.interfaceNumber !== undefined &&
        deviceInfo.interface !== identity.interfaceNumber
    ) {
        return undefined;
    }
    if (
        identity.usagePage !== undefined &&
        deviceInfo.usagePage !== identity.usagePage
    ) {
        return undefined;
    }
    if (
        identity.usageId !== undefined &&
        deviceInfo.usage !== identity.usageId
    ) {
        return undefined;
    }
    if (!isSafeAsusRogVendorCollection(deviceInfo)) {
        return undefined;
    }

    const path = deviceInfo.path.toLowerCase();
    if (
        identity.bindingTransport === "usbReceiver" &&
        identity.receiverKind === "rogOmni" &&
        isAsusRogOmniKeyboardCollection(deviceInfo, path)
    ) {
        const formattedProductId = identity.productId === undefined
            ? undefined
            : formatProductId(identity.productId);
        return {
            routeId: `keyboard-omni-selected-${formattedProductId ?? "generic"}`,
            displayName: identity.productName ?? "Generic ROG Omni Keyboard",
            modelId: identity.modelId ?? `asus-rog-keyboard:omni-${formattedProductId ?? "generic"}`,
            transport: "usbReceiver",
            receiverKind: "rogOmni",
            supportState: "supported",
            request: buildAsusRogKeyboardOmniBatteryRequest(),
            parseReport: parseAsusRogKeyboardOmniBatteryReport,
        };
    }

    const route = resolveAsusRogBatteryRoute(deviceInfo, new Map());
    if (route === undefined) {
        return undefined;
    }

    if (
        identity.bindingTransport !== undefined &&
        route.transport !== identity.bindingTransport
    ) {
        return undefined;
    }
    if (
        identity.receiverKind !== undefined &&
        route.receiverKind !== identity.receiverKind
    ) {
        return undefined;
    }
    if (
        identity.modelId !== undefined &&
        route.modelId !== identity.modelId
    ) {
        return undefined;
    }

    return route;
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
    batteryPercent: number,
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
        batteryPercent,
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
    readonly routeDiagnostics: Map<string, AsusRogRouteDiagnostic>;
    enumeratedDeviceCount: number;
    matchedRouteCount: number;
    batteryCandidateCount: number;
    unrelatedReportCount: number;
}

interface AsusRogRouteDiagnostic {
    readonly routeId: string;
    readonly displayName: string;
    readonly supportState: string;
    readonly transport: string;
    readonly collectionSummaries: Set<string>;
    readonly outcomes: Map<string, number>;
}

function createAsusRogScanSummary(): AsusRogScanSummary {
    return {
        enumeratedDeviceCount: 0,
        matchedRouteCount: 0,
        batteryCandidateCount: 0,
        unrelatedReportCount: 0,
        routeDiagnostics: new Map(),
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

function recordAsusRogRouteDiagnostic(
    summary: AsusRogScanSummary,
    route: AsusRogBatteryRoute,
    deviceInfo: NativeHidDeviceInfo,
    outcome: string,
): void {
    const existing = summary.routeDiagnostics.get(route.routeId);
    const diagnostic = existing ?? {
        routeId: route.routeId,
        displayName: route.displayName,
        supportState: route.supportState,
        transport: route.transport,
        collectionSummaries: new Set<string>(),
        outcomes: new Map<string, number>(),
    };
    diagnostic.collectionSummaries.add(formatAsusRogCollectionSummary(deviceInfo));
    diagnostic.outcomes.set(outcome, (diagnostic.outcomes.get(outcome) ?? 0) + 1);
    summary.routeDiagnostics.set(route.routeId, diagnostic);
}

function logAsusRogScanSummary(summary: AsusRogScanSummary, durationMilliseconds: number): void {
    log.atInfo()
        .everyMs(
            "asus-rog-scan",
            ASUS_ROG_DISCOVERY_DEBUG_LOG_INTERVAL_MILLISECONDS,
        )
        .log(() =>
            [
                "asusRogBatteryScan",
                `enumeratedDevices=${summary.enumeratedDeviceCount}`,
                `matchedRoutes=${summary.matchedRouteCount}`,
                `candidates=${summary.batteryCandidateCount}`,
                `noData=${formatNoDataCounts(summary.noDataCounts)}`,
                `unrelatedReports=${summary.unrelatedReportCount}`,
                `durationMs=${durationMilliseconds}`,
                `routes=${formatRouteDiagnostics(summary.routeDiagnostics)}`,
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

function formatRouteDiagnostics(routeDiagnostics: ReadonlyMap<string, AsusRogRouteDiagnostic>): string {
    return [...routeDiagnostics.values()]
        .sort((left, right) => left.routeId.localeCompare(right.routeId))
        .slice(0, 12)
        .map(diagnostic => [
            diagnostic.routeId,
            diagnostic.transport,
            diagnostic.supportState,
            diagnostic.displayName,
            [...diagnostic.collectionSummaries].sort().slice(0, 4).join("&"),
            formatStringCounts(diagnostic.outcomes),
        ].join("/"))
        .join("|") || "none";
}

function formatAsusRogCollectionSummary(deviceInfo: NativeHidDeviceInfo): string {
    return [
        `pid=${formatProductId(deviceInfo.productId ?? 0)}`,
        `interface=${deviceInfo.interface ?? "none"}`,
        `usagePage=${formatProductId(deviceInfo.usagePage ?? 0)}`,
        `usage=${formatProductId(deviceInfo.usage ?? 0)}`,
        `product=${deviceInfo.product ?? "none"}`,
        `pathKey=${formatAsusRogPathKey(deviceInfo.path)}`,
    ].join(",");
}

function formatStringCounts(counts: ReadonlyMap<string, number>): string {
    return [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, count]) => `${key}:${count}`)
        .join(",") || "none";
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

function padAsusRogDiagnosticReport(bytes: readonly number[]): number[] {
    return [
        ...bytes,
        ...Array.from({ length: Math.max(0, 64 - bytes.length) }, () => 0x00),
    ];
}

function readAsusRogOmniPairedProductIds(report: readonly number[]): readonly number[] {
    if (report.length === 0) {
        return [];
    }

    const productIds: number[] = [];
    for (let offset = 5; offset + 1 < report.length && productIds.length < 8; offset += 4) {
        const productId = report[offset] | (report[offset + 1] << 8);
        if (productId === 0) {
            break;
        }

        productIds.push(productId);
    }

    return productIds;
}

function formatAsusRogProductIds(productIds: readonly number[]): string {
    return productIds.map(formatProductId).join(",") || "none";
}

function formatAsusRogPathKey(path: string | undefined): string {
    if (path === undefined) {
        return "none";
    }

    const normalizedPath = path.toLowerCase();
    const match = /mi_[0-9a-f]{2}&col[0-9a-f]{2}#([^#]+)/u.exec(normalizedPath);
    return match?.[1]?.replace(/[^a-z0-9&_-]+/gu, "-").slice(0, 48) ?? "unknown";
}

function formatAsusRogReceiverInstanceKey(path: string | undefined): string {
    return formatAsusRogPathKey(path).replace(/&[0-9a-f]{4}$/u, "");
}

function formatProductId(productId: number): string {
    return productId.toString(16).padStart(4, "0");
}
