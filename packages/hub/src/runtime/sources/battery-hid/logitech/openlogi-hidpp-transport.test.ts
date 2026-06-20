import assert from "node:assert/strict";
import test from "node:test";
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
} from "./hidpp-protocol";
import {
    buildOpenLogiDeviceRoute,
    isOpenLogiLogitechHidppLongCollection,
    isOpenLogiLongOnlyCollection,
    isOpenLogiReceiverChildSysfsPath,
    normalizeOpenLogiWindowsCollectionPath,
    openLogiDeviceIndexForRoute,
    shouldRetryOpenLogiOneShotEnumeration,
} from "./openlogi-hidpp-transport";

test("OpenLogi device route uses Unifying for canonical Unifying receiver PIDs", () => {
    for (const receiverProductId of [
        LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
        LOGITECH_UNIFYING_NANO_RECEIVER_PRODUCT_ID,
    ]) {
        assert.deepEqual(buildOpenLogiDeviceRoute({
            receiverUid: "A1B2",
            receiverProductId,
            receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
            receiverSlot: 2,
        }), {
            kind: "unifying",
            receiverUid: "A1B2",
            receiverSlot: 2,
        });
    }
});

test("OpenLogi device route defaults receiver UID routes to Bolt when PID is not Unifying", () => {
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
        receiverUid: "FUTURE",
        receiverProductId: 0xCAFE,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: 3,
    }), {
        kind: "bolt",
        receiverUid: "FUTURE",
        receiverSlot: 3,
    });
});

test("OpenLogi device route uses direct route only for self-index entries without receiver UID", () => {
    assert.deepEqual(buildOpenLogiDeviceRoute({
        receiverProductId: 0xB025,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: LOGITECH_HIDPP_DIRECT_DEVICE_SLOT,
    }), {
        kind: "direct",
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        productId: 0xB025,
    });
    assert.equal(buildOpenLogiDeviceRoute({
        receiverProductId: LOGITECH_UNIFYING_RECEIVER_PRODUCT_ID,
        receiverVendorId: LOGITECH_HIDPP_VENDOR_ID,
        receiverSlot: 1,
    }), undefined);
});

test("OpenLogi device index uses receiver slot except direct self-index", () => {
    assert.equal(openLogiDeviceIndexForRoute({
        kind: "unifying",
        receiverUid: "UID",
        receiverSlot: 4,
    }), 4);
    assert.equal(openLogiDeviceIndexForRoute({
        kind: "direct",
        vendorId: LOGITECH_HIDPP_VENDOR_ID,
        productId: 0xB025,
    }), LOGITECH_HIDPP_DIRECT_DEVICE_SLOT);
});

test("OpenLogi transport matches USB, BLE, and wired keyboard HID++ long collections", () => {
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
        usagePage: 0x0001,
        usageId: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    }), false);
});

test("OpenLogi transport treats only BLE long collection as long-only", () => {
    assert.equal(isOpenLogiLongOnlyCollection({
        usagePage: LOGITECH_HIDPP_GAMING_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_BLE_LONG_USAGE,
    }), true);
    assert.equal(isOpenLogiLongOnlyCollection({
        usagePage: LOGITECH_HIDPP_CLASSIC_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_CLASSIC_LONG_USAGE,
    }), false);
    assert.equal(isOpenLogiLongOnlyCollection({
        usagePage: LOGITECH_HIDPP_GAMING_USAGE_PAGE,
        usageId: LOGITECH_HIDPP_G_SERIES_WIRED_LONG_USAGE,
    }), false);
});

test("OpenLogi Windows short and long collections of one interface share a grouping key", () => {
    const short = normalizeOpenLogiWindowsCollectionPath(
        String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col01#7&348660ac&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}`,
    );
    const long = normalizeOpenLogiWindowsCollectionPath(
        String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col02#7&348660ac&0&0001#{4d1e55b2-f16f-11cf-88cb-001111000030}`,
    );

    assert.equal(short, long);
    assert.equal(short, "vid_046d&pid_c548&mi_02#7&348660ac&0");
});

test("OpenLogi Windows grouping keeps distinct interfaces and receivers separate", () => {
    const mi01 = normalizeOpenLogiWindowsCollectionPath(
        String.raw`\\?\HID#VID_046D&PID_C548&MI_01&Col02#7&1cc2d467&0&0001#{4d1e55b2-f16f-11cf-88cb-001111000030}`,
    );
    const mi02 = normalizeOpenLogiWindowsCollectionPath(
        String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col02#7&348660ac&0&0001#{4d1e55b2-f16f-11cf-88cb-001111000030}`,
    );
    const receiverB = normalizeOpenLogiWindowsCollectionPath(
        String.raw`\\?\HID#VID_046D&PID_C548&MI_02&Col01#7&9f1be20c&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}`,
    );
    const unifying = normalizeOpenLogiWindowsCollectionPath(
        String.raw`\\?\HID#VID_046D&PID_C52B&MI_02&Col02#7&1a2b3c4d&0&0001#{4d1e55b2-f16f-11cf-88cb-001111000030}`,
    );

    assert.notEqual(mi01, mi02);
    assert.notEqual(mi02, receiverB);
    assert.notEqual(mi02, unifying);
});

test("OpenLogi transport detects Linux receiver child sysfs paths", () => {
    assert.equal(isOpenLogiReceiverChildSysfsPath(
        "/sys/devices/pci0000:00/0000:00:14.0/usb3/3-5/3-5.4/3-5.4.3/" +
            "3-5.4.3:1.2/0003:046D:C52B.0009/0003:046D:4076.000A",
    ), true);
    assert.equal(isOpenLogiReceiverChildSysfsPath(
        "/sys/devices/pci0000:00/0000:00:14.0/usb3/3-5/3-5.4/3-5.4.3/" +
            "3-5.4.3:1.2/0003:046D:C52B.0009",
    ), false);
    assert.equal(isOpenLogiReceiverChildSysfsPath(
        "/sys/devices/pci0000:00/0000:00:14.0/usb3/3-5/" +
            "0003:046D:C548.0001/0003:046D:B037.0002",
    ), true);
    assert.equal(isOpenLogiReceiverChildSysfsPath(
        "/sys/devices/pci0000:00/0000:00:15.0/i2c-0/0018:06CB:CE67.0001",
    ), false);
});

test("OpenLogi one-shot enumeration retry gate stops after the fourth attempt or healthy pass", () => {
    assert.equal(shouldRetryOpenLogiOneShotEnumeration({
        allNodesHealthy: false,
        attempt: 1,
    }), true);
    assert.equal(shouldRetryOpenLogiOneShotEnumeration({
        allNodesHealthy: false,
        attempt: 4,
    }), false);
    assert.equal(shouldRetryOpenLogiOneShotEnumeration({
        allNodesHealthy: true,
        attempt: 1,
    }), false);
});
