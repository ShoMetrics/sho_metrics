import assert from "node:assert/strict";
import test from "node:test";
import {
    LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
    LOGITECH_HIDPP_BLE_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
    LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
    LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
    LOGITECH_HIDPP_GAMING_USAGE_PAGE,
    LOGITECH_HIDPP_G_SERIES_WIRED_LONG_USAGE,
    LOGITECH_HIDPP_SHORT_USAGE,
    LOGITECH_HIDPP_VENDOR_ID,
    LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
    LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
} from "./hidpp-protocol";
import {
    OPENLOGI_HIDPP_RESPONSE_TIMEOUT_MILLISECONDS,
    OpenLogiHidppBatterySession,
    buildOpenLogiCapabilities,
    matchesOpenLogiExpectedResponse,
    normalizeOpenLogiOutgoingRequest,
    openLogiBatteryFeatureIndex,
    parseOpenLogiDeviceErrorCode,
    parseOpenLogiProtocolVersionResponse,
    type OpenLogiHidppExchangeResult,
    type OpenLogiHidppRequest,
    type OpenLogiHidppTransport,
} from "./openlogi-hidpp-battery-reader";
import {
    OpenLogiHidppBatteryProbeCache,
    isOpenLogiCachedProbeStale,
} from "./openlogi-hidpp-battery-cache";
import {
    buildOpenLogiDeviceRoute,
    isOpenLogiLogitechHidppLongCollection,
    isOpenLogiLongOnlyCollection,
    isOpenLogiReceiverChildSysfsPath,
    normalizeOpenLogiWindowsCollectionPath,
    openLogiDeviceIndexForRoute,
    shouldRetryOpenLogiOneShotEnumeration,
} from "./openlogi-hidpp-transport";

test("OpenLogi battery feature index is one-based in the enumerated FeatureSet table", () => {
    assert.equal(openLogiBatteryFeatureIndex([0x0001, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID, 0x2201]), 2);
    assert.equal(openLogiBatteryFeatureIndex([LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID]), 1);
    assert.equal(openLogiBatteryFeatureIndex([0x0001, 0x2201, 0x1B04]), undefined);
    assert.equal(openLogiBatteryFeatureIndex([]), undefined);
});

test("OpenLogi cached probe refresh window matches inventory ticks", () => {
    assert.equal(isOpenLogiCachedProbeStale({ probedTick: 10 }, 10), false);
    assert.equal(isOpenLogiCachedProbeStale({ probedTick: 10 }, 24), false);
    assert.equal(isOpenLogiCachedProbeStale({ probedTick: 10 }, 25), true);
});

test("OpenLogi capabilities are derived from the same driving feature ids", () => {
    assert.deepEqual(buildOpenLogiCapabilities([0x0003, 0x1B04, 0x2202, 0x2110]), {
        buttons: true,
        pointer: true,
        lighting: false,
    });
    assert.deepEqual(buildOpenLogiCapabilities([0x0001, 0x8080]), {
        buttons: false,
        pointer: false,
        lighting: true,
    });
    assert.deepEqual(buildOpenLogiCapabilities([0x0000, 0x0003]), {
        buttons: false,
        pointer: false,
        lighting: false,
    });
});

test("OpenLogi route builder mirrors Bolt, Unifying, and direct addressing", () => {
    assert.deepEqual(buildOpenLogiDeviceRoute({
        receiverUid: "A1B2",
        receiverProductId: LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: 2,
    }), {
        kind: "unifying",
        receiverUid: "A1B2",
        receiverSlot: 2,
    });
    assert.deepEqual(buildOpenLogiDeviceRoute({
        receiverUid: "A1B2",
        receiverProductId: LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: 3,
    }), {
        kind: "unifying",
        receiverUid: "A1B2",
        receiverSlot: 3,
    });
    assert.deepEqual(buildOpenLogiDeviceRoute({
        receiverUid: "UID",
        receiverProductId: LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: 1,
    }), {
        kind: "bolt",
        receiverUid: "UID",
        receiverSlot: 1,
    });
    assert.deepEqual(buildOpenLogiDeviceRoute({
        receiverUid: "UID",
        receiverProductId: 0xBEEF,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: 4,
    }), {
        kind: "bolt",
        receiverUid: "UID",
        receiverSlot: 4,
    });

    const direct = buildOpenLogiDeviceRoute({
        receiverProductId: 0xC539,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
    });
    assert.deepEqual(direct, {
        kind: "direct",
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        productId: 0xC539,
    });
    if (direct === undefined) {
        throw new Error("Expected direct route.");
    }

    assert.equal(openLogiDeviceIndexForRoute(direct), LOGITECH_HIDPP_DIRECT_DEVICE_SLOT);
    assert.equal(buildOpenLogiDeviceRoute({
        receiverProductId: LOGITECH_BOLT_RECEIVER_PRODUCT_ID,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: 2,
    }), undefined);
});

test("OpenLogi HID++ collection matcher accepts the reference long-report usage pairs", () => {
    assert.equal(isOpenLogiLogitechHidppLongCollection({
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        usagePage: LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    }), true);
    assert.equal(isOpenLogiLogitechHidppLongCollection({
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        usagePage: LOGITECH_HIDPP_GAMING_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_BLE_LONG_USAGE,
    }), true);
    assert.equal(isOpenLogiLogitechHidppLongCollection({
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        usagePage: LOGITECH_HIDPP_GAMING_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_G_SERIES_WIRED_LONG_USAGE,
    }), true);
    assert.equal(isOpenLogiLogitechHidppLongCollection({
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        usagePage: LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_SHORT_USAGE,
    }), false);
    assert.equal(isOpenLogiLongOnlyCollection({
        usagePage: LOGITECH_HIDPP_GAMING_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_BLE_LONG_USAGE,
    }), true);
    assert.equal(isOpenLogiLongOnlyCollection({
        usagePage: LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    }), false);
});

test("OpenLogi Windows collection path grouping pairs short and long siblings only", () => {
    const shortPath = "\\\\?\\HID#VID_046D&PID_C548&MI_02&Col01#7&348660ac&0&0000#{00000000-0000-0000-0000-000000000000}";
    const longPath = "\\\\?\\HID#VID_046D&PID_C548&MI_02&Col02#7&348660ac&0&0001#{00000000-0000-0000-0000-000000000000}";
    const otherInterfacePath = "\\\\?\\HID#VID_046D&PID_C548&MI_01&Col02#7&348660ac&0&0001#{00000000-0000-0000-0000-000000000000}";
    const otherReceiverPath = "\\\\?\\HID#VID_046D&PID_C548&MI_02&Col02#8&348660ac&0&0001#{00000000-0000-0000-0000-000000000000}";

    assert.equal(
        normalizeOpenLogiWindowsCollectionPath(shortPath),
        normalizeOpenLogiWindowsCollectionPath(longPath),
    );
    assert.notEqual(
        normalizeOpenLogiWindowsCollectionPath(longPath),
        normalizeOpenLogiWindowsCollectionPath(otherInterfacePath),
    );
    assert.notEqual(
        normalizeOpenLogiWindowsCollectionPath(longPath),
        normalizeOpenLogiWindowsCollectionPath(otherReceiverPath),
    );
});

test("OpenLogi Linux receiver child sysfs path detection mirrors transport filtering", () => {
    const unifyingChild = "/sys/devices/pci0000:00/0000:00:14.0/usb3/3-5/3-5.4/3-5.4.3/" +
        "3-5.4.3:1.2/0003:046D:C52B.0009/0003:046D:4076.000A";
    const unifyingReceiver = "/sys/devices/pci0000:00/0000:00:14.0/usb3/3-5/3-5.4/3-5.4.3/" +
        "3-5.4.3:1.2/0003:046D:C52B.0009";
    const boltChild = "/sys/devices/pci0000:00/0000:00:14.0/usb3/3-5/" +
        "0003:046D:C548.0001/0003:046D:B037.0002";
    const unrelated = "/sys/devices/pci0000:00/0000:00:15.0/i2c-0/0018:06CB:CE67.0001";

    assert.equal(isOpenLogiReceiverChildSysfsPath(unifyingChild), true);
    assert.equal(isOpenLogiReceiverChildSysfsPath(unifyingReceiver), false);
    assert.equal(isOpenLogiReceiverChildSysfsPath(boltChild), true);
    assert.equal(isOpenLogiReceiverChildSysfsPath(unrelated), false);
});

test("OpenLogi one-shot retry gate stops after the bounded attempt count", () => {
    assert.equal(shouldRetryOpenLogiOneShotEnumeration({ allNodesHealthy: true, attempt: 1 }), false);
    assert.equal(shouldRetryOpenLogiOneShotEnumeration({ allNodesHealthy: false, attempt: 1 }), true);
    assert.equal(shouldRetryOpenLogiOneShotEnumeration({ allNodesHealthy: false, attempt: 3 }), true);
    assert.equal(shouldRetryOpenLogiOneShotEnumeration({ allNodesHealthy: false, attempt: 4 }), false);
});

test("OpenLogi session walks FeatureSet then reads UnifiedBattery info", () => {
    const transport = new OpenLogiScriptedTransport();
    const session = new OpenLogiHidppBatterySession(transport);

    const result = session.probeFeatures(0x02);

    assert.equal(result.state, "probe");
    if (result.state !== "probe") {
        throw new Error("Expected probe.");
    }

    assert.deepEqual(result.probe.featureIds, [0x0001, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID, 0x2201]);
    assert.equal(result.probe.batteryFeatureIndex, 2);
    assert.deepEqual(result.probe.battery, {
        percentage: 90,
        level: "full",
        status: "discharging",
    });
    assert.deepEqual(result.probe.capabilities, {
        buttons: false,
        pointer: true,
        lighting: false,
    });
    assert.deepEqual(transport.requestFunctions(), [
        "root-ping",
        "root-get-feature:0001",
        "feature-set-count",
        "feature-set-get:1",
        "feature-set-get:2",
        "feature-set-get:3",
        "unified-battery-info",
    ]);
    assert.deepEqual(transport.requestedFeatureIds(), [0x0001]);
    assert.equal(transport.requests.every(request =>
        request.timeoutMilliseconds === OPENLOGI_HIDPP_RESPONSE_TIMEOUT_MILLISECONDS,
    ), true);
});

test("OpenLogi session bounds each feature-walk request by the remaining probe budget", () => {
    let monotonicNow = 100;
    const transport = new OpenLogiScriptedTransport({
        afterExchange: () => {
            monotonicNow += 10;
        },
    });
    const session = new OpenLogiHidppBatterySession(transport, () => monotonicNow);

    const result = session.probeFeatures(0x02, 25);

    assert.deepEqual(result, {
        state: "noData",
        reason: "timeout",
    });
    assert.deepEqual(transport.requestFunctions(), [
        "root-ping",
        "root-get-feature:0001",
        "feature-set-count",
    ]);
    assert.deepEqual(transport.requests.map(request => request.timeoutMilliseconds), [25, 15, 5]);
});

test("OpenLogi session uses software id 1 for all HID++2 feature requests", () => {
    const transport = new OpenLogiScriptedTransport({
        features: [
            0x0001,
            LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID,
            0x0005,
            LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID,
        ],
        serialCapability: true,
    });
    const session = new OpenLogiHidppBatterySession(transport);

    session.probeFeatures(0x02);

    assert.equal(transport.requests.every(request => (request.bytes[3] & 0x0F) === 0x01), true);
});

test("OpenLogi session reads DeviceInformation serial only when capability says it exists", () => {
    const transport = new OpenLogiScriptedTransport({
        features: [0x0001, LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID],
        serialCapability: true,
        serialPayload: bytesForAscii("SN-42\0\0\0\0\0\0\0"),
    });
    const session = new OpenLogiHidppBatterySession(transport);

    const result = session.probeFeatures(0x02);

    assert.equal(result.state, "probe");
    if (result.state !== "probe") {
        throw new Error("Expected probe.");
    }

    assert.deepEqual(result.probe.deviceInformation, {
        entityCount: 2,
        serialNumber: "SN-42",
        unitId: [0x12, 0x34, 0x56, 0x78],
        transportFlags: 0x0F,
        modelIds: [0x1A83, 0x1A85, 0x0000],
        extendedModelId: 0x01,
    });
    assert.deepEqual(transport.requestFunctions(), [
        "root-ping",
        "root-get-feature:0001",
        "feature-set-count",
        "feature-set-get:1",
        "feature-set-get:2",
        "feature-set-get:3",
        "unified-battery-info",
        "device-info",
        "device-serial",
    ]);
});

test("OpenLogi session trims leading and trailing NUL bytes from DeviceInformation serial", () => {
    const transport = new OpenLogiScriptedTransport({
        features: [0x0001, LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID],
        serialCapability: true,
        serialPayload: bytesForAscii("\0\0SN-42\0\0\0\0\0"),
    });
    const session = new OpenLogiHidppBatterySession(transport);

    const result = session.probeFeatures(0x02);

    assert.equal(result.state, "probe");
    if (result.state !== "probe") {
        throw new Error("Expected probe.");
    }

    assert.equal(result.probe.deviceInformation?.serialNumber, "SN-42");
});

test("OpenLogi session reads DeviceTypeAndName marketing type when feature 0x0005 is present", () => {
    const transport = new OpenLogiScriptedTransport({
        features: [0x0001, 0x0005, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID],
        deviceTypeByte: 0x03,
    });
    const session = new OpenLogiHidppBatterySession(transport);

    const result = session.probeFeatures(0x02);

    assert.equal(result.state, "probe");
    if (result.state !== "probe") {
        throw new Error("Expected probe.");
    }

    assert.equal(result.probe.deviceKind, "mouse");
    assert.deepEqual(transport.requestFunctions(), [
        "root-ping",
        "root-get-feature:0001",
        "feature-set-count",
        "feature-set-get:1",
        "feature-set-get:2",
        "feature-set-get:3",
        "unified-battery-info",
        "device-type",
    ]);
});

test("OpenLogi session drops invalid DeviceTypeAndName values", () => {
    const transport = new OpenLogiScriptedTransport({
        features: [0x0001, 0x0005, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID],
        deviceTypeByte: 0xFF,
    });
    const session = new OpenLogiHidppBatterySession(transport);

    const result = session.probeFeatures(0x02);

    assert.equal(result.state, "probe");
    if (result.state !== "probe") {
        throw new Error("Expected probe.");
    }

    assert.equal(result.probe.deviceKind, undefined);
});

test("OpenLogi session treats unknown UnifiedBattery level or status as no battery", () => {
    const transport = new OpenLogiScriptedTransport({
        batteryPayloads: [[0x5A, 0x03, 0x00]],
    });
    const session = new OpenLogiHidppBatterySession(transport);

    const result = session.probeFeatures(0x02);

    assert.equal(result.state, "probe");
    if (result.state !== "probe") {
        throw new Error("Expected probe.");
    }

    assert.equal(result.probe.battery, undefined);
});

test("OpenLogi transport helpers widen short requests for long-only routes", () => {
    const transport = new OpenLogiScriptedTransport();
    const session = new OpenLogiHidppBatterySession(transport);

    session.probeFeatures(0x02);

    const [firstRequest] = transport.requests;
    if (firstRequest === undefined) {
        throw new Error("Expected root ping request.");
    }

    const normalized = normalizeOpenLogiOutgoingRequest({
        request: firstRequest,
        supportsShortReports: false,
        supportsLongReports: true,
    });
    assert.equal(normalized.bytes[0], 0x11);
    assert.equal(normalized.bytes.length, 20);
    assert.deepEqual(normalized.bytes.slice(1, firstRequest.bytes.length), firstRequest.bytes.slice(1));
});

test("OpenLogi transport helpers match HID++2.0 success and error responses", () => {
    const transport = new OpenLogiScriptedTransport();
    const session = new OpenLogiHidppBatterySession(transport);

    session.probeFeatures(0x02);

    const request = transport.requests.find(candidate =>
        describeOpenLogiRequest(candidate) === "unified-battery-info",
    );
    if (request === undefined) {
        throw new Error("Expected UnifiedBattery request.");
    }

    assert.equal(matchesOpenLogiExpectedResponse(
        buildResponse(request, [0x5A, 0x08, 0x00]),
        request.expectedResponse,
    ), true);
    assert.equal(parseOpenLogiDeviceErrorCode([
        0x11,
        request.expectedResponse.receiverSlot,
        0xFF,
        request.expectedResponse.featureIndex,
        request.expectedResponse.functionByte,
        0x07,
        ...Array.from({ length: 14 }, () => 0x00),
    ], request.expectedResponse), 0x07);
});

test("OpenLogi protocol version parser accepts HID++1.0 invalid-sub-id fallback", () => {
    const transport = new OpenLogiScriptedTransport();
    const session = new OpenLogiHidppBatterySession(transport);

    session.probeFeatures(0x02);

    const rootPing = transport.requests.find(candidate =>
        describeOpenLogiRequest(candidate) === "root-ping",
    );
    if (rootPing === undefined) {
        throw new Error("Expected root ping request.");
    }

    assert.equal(parseOpenLogiProtocolVersionResponse(
        buildResponse(rootPing, [0x04, 0x02, 0x00]),
        rootPing.expectedResponse,
    ), "v20");
    assert.equal(parseOpenLogiProtocolVersionResponse([
        0x10,
        rootPing.expectedResponse.receiverSlot,
        0x8F,
        0x00,
        rootPing.expectedResponse.functionByte,
        0x01,
        0x00,
    ], rootPing.expectedResponse), "v10");
});

test("OpenLogi cache reuses immutable probe data and refreshes only battery on a cache hit", () => {
    const transport = new OpenLogiScriptedTransport();
    const session = new OpenLogiHidppBatterySession(transport);
    const cache = new OpenLogiHidppBatteryProbeCache();

    const fresh = cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: true,
        tick: 1,
    });
    const cached = cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: true,
        tick: 2,
    });

    assert.equal(fresh.state, "probe");
    assert.equal(cached.state, "probe");
    if (cached.state !== "probe") {
        throw new Error("Expected cached probe.");
    }

    assert.deepEqual(cached.probe.battery, {
        percentage: 88,
        level: "full",
        status: "discharging",
    });
    assert.deepEqual(transport.requestFunctions(), [
        "root-ping",
        "root-get-feature:0001",
        "feature-set-count",
        "feature-set-get:1",
        "feature-set-get:2",
        "feature-set-get:3",
        "unified-battery-info",
        "unified-battery-info",
    ]);
});

test("OpenLogi cache passes the caller probe budget to cache-hit battery refreshes", () => {
    const monotonicNow = 100;
    const transport = new OpenLogiScriptedTransport();
    const session = new OpenLogiHidppBatterySession(transport, () => monotonicNow);
    const cache = new OpenLogiHidppBatteryProbeCache();

    cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: true,
        tick: 1,
    });
    transport.requests.length = 0;

    const cached = cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: true,
        tick: 2,
        timeoutMilliseconds: 123,
    });

    assert.equal(cached.state, "probe");
    assert.deepEqual(transport.requestFunctions(), ["unified-battery-info"]);
    assert.deepEqual(transport.requests.map(request => request.timeoutMilliseconds), [123]);
});

test("OpenLogi cache keeps a missing entry through the grace window then evicts it", () => {
    const session = new OpenLogiHidppBatterySession(new OpenLogiScriptedTransport());
    const cache = new OpenLogiHidppBatteryProbeCache();

    cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: true,
        tick: 1,
    });
    for (let missCount = 0; missCount < 3; missCount += 1) {
        cache.evictUnseen(new Set());
    }

    const retained = cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: false,
        tick: 2,
    });
    assert.equal(retained.state, "probe");
    if (retained.state !== "probe") {
        throw new Error("Expected retained probe.");
    }
    assert.equal(retained.probe.battery?.percentage, 90);

    cache.evictUnseen(new Set());
    const evicted = cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: false,
        tick: 3,
    });
    assert.deepEqual(evicted, {
        state: "probe",
        probe: {},
    });
});

test("OpenLogi cache resets the miss counter when a key is seen again", () => {
    const session = new OpenLogiHidppBatterySession(new OpenLogiScriptedTransport());
    const cache = new OpenLogiHidppBatteryProbeCache();

    cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: true,
        tick: 1,
    });
    cache.evictUnseen(new Set());
    cache.evictUnseen(new Set(["unit:1234"]));
    for (let missCount = 0; missCount < 3; missCount += 1) {
        cache.evictUnseen(new Set());
    }

    const retained = cache.readBattery({
        session,
        cacheKey: "unit:1234",
        receiverSlot: 0x02,
        online: false,
        tick: 2,
    });

    assert.equal(retained.state, "probe");
    if (retained.state !== "probe") {
        throw new Error("Expected retained probe.");
    }

    assert.equal(retained.probe.battery?.percentage, 90);
});

interface OpenLogiScriptedTransportOptions {
    readonly features?: readonly number[];
    readonly serialCapability?: boolean;
    readonly serialPayload?: readonly number[];
    readonly batteryPayloads?: readonly (readonly number[])[];
    readonly deviceTypeByte?: number;
    readonly afterExchange?: () => void;
}

class OpenLogiScriptedTransport implements OpenLogiHidppTransport {
    readonly requests: OpenLogiHidppRequest[] = [];
    private batteryReadCount = 0;

    constructor(private readonly options: OpenLogiScriptedTransportOptions = {}) {}

    exchange(request: OpenLogiHidppRequest): OpenLogiHidppExchangeResult {
        this.requests.push(request);
        this.options.afterExchange?.();
        return {
            state: "response",
            report: this.responseForRequest(request),
        };
    }

    requestFunctions(): readonly string[] {
        return this.requests.map(request => this.describeRequest(request));
    }

    requestedFeatureIds(): readonly number[] {
        return this.requests.flatMap(request =>
            this.describeRequest(request).startsWith("root-get-feature:")
                ? [readRootFeatureLookupId(request)]
                : [],
        );
    }

    private responseForRequest(request: OpenLogiHidppRequest): readonly number[] {
        const featureList = this.featureList();
        const functionName = this.describeRequest(request);
        if (functionName === "root-ping") {
            return buildResponse(request, [0x04, 0x02, 0x00]);
        }

        if (functionName === "root-get-feature:0001") {
            return buildResponse(request, [0x01, 0x00, 0x00]);
        }

        if (functionName === "feature-set-count") {
            return buildResponse(request, [featureList.length, 0x00, 0x00]);
        }

        if (functionName.startsWith("feature-set-get:")) {
            const featureIndex = Number(functionName.slice("feature-set-get:".length));
            const featureId = featureList[featureIndex - 1] ?? 0x0000;
            return buildResponse(request, [(featureId >> 8) & 0xFF, featureId & 0xFF, 0x00, 0x02]);
        }

        if (functionName === "unified-battery-info") {
            this.batteryReadCount += 1;
            const scriptedPayload = this.options.batteryPayloads?.[this.batteryReadCount - 1];
            return buildResponse(request, scriptedPayload ?? [this.batteryReadCount === 1 ? 0x5A : 0x58, 0x08, 0x00]);
        }

        if (functionName === "device-info") {
            return buildResponse(request, [
                0x02,
                0x12, 0x34, 0x56, 0x78,
                0x00,
                0x0F,
                0x1A, 0x83, 0x1A, 0x85, 0x00, 0x00,
                0x01,
                this.options.serialCapability === true ? 0x01 : 0x00,
            ]);
        }

        if (functionName === "device-serial") {
            return buildResponse(request, this.options.serialPayload ?? bytesForAscii("SERIAL123456"));
        }

        if (functionName === "device-type") {
            return buildResponse(request, [this.options.deviceTypeByte ?? 0x07, 0x00, 0x00]);
        }

        return buildResponse(request, [0x00, 0x00, 0x00]);
    }

    private describeRequest(request: OpenLogiHidppRequest): string {
        return describeOpenLogiRequest(request, this.featureList());
    }

    private featureList(): readonly number[] {
        return this.options.features ?? [0x0001, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID, 0x2201];
    }
}

function describeOpenLogiRequest(
    request: OpenLogiHidppRequest,
    featureList: readonly number[] = [0x0001, LOGITECH_HIDPP_UNIFIED_BATTERY_FEATURE_ID, 0x2201],
): string {
    if (request.bytes[2] === 0x00 && request.bytes[3] === 0x11) {
        return "root-ping";
    }

    if (request.bytes[2] === 0x00 && request.bytes[3] === 0x01) {
        return `root-get-feature:${readRootFeatureLookupId(request).toString(16).padStart(4, "0")}`;
    }

    if (request.bytes[2] === 0x01 && request.bytes[3] === 0x01) {
        return "feature-set-count";
    }

    if (request.bytes[2] === 0x01 && request.bytes[3] === 0x11) {
        return `feature-set-get:${request.bytes[4]}`;
    }

    if (request.bytes[3] === 0x11) {
        return "unified-battery-info";
    }

    if (request.bytes[3] === 0x01) {
        return "device-info";
    }

    if (featureList[request.bytes[2] - 1] === LOGITECH_HIDPP_DEVICE_INFORMATION_FEATURE_ID &&
        request.bytes[3] === 0x21) {
        return "device-serial";
    }

    if (featureList[request.bytes[2] - 1] === 0x0005 && request.bytes[3] === 0x21) {
        return "device-type";
    }

    return "unknown";
}

function readRootFeatureLookupId(request: OpenLogiHidppRequest): number {
    return (request.bytes[4] << 8) | request.bytes[5];
}

function buildResponse(request: OpenLogiHidppRequest, payload: readonly number[]): readonly number[] {
    const report = [
        0x11,
        request.expectedResponse.receiverSlot,
        request.expectedResponse.featureIndex,
        request.expectedResponse.functionByte,
        ...payload,
    ];

    return report.length > 7
        ? [...report, ...Array.from({ length: 20 - report.length }, () => 0x00)]
        : [...report, ...Array.from({ length: 7 - report.length }, () => 0x00)];
}

function bytesForAscii(value: string): readonly number[] {
    return [...value].map(character => character.charCodeAt(0));
}
