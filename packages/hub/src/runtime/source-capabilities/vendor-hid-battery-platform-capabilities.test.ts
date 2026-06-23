import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldEnableVendorHidBatterySupport } from "./vendor-hid-battery-platform-capabilities";

test("vendor HID battery support is Windows-only", () => {
    assert.equal(shouldEnableVendorHidBatterySupport("win32"), true);
    assert.equal(shouldEnableVendorHidBatterySupport("darwin"), false);
    assert.equal(shouldEnableVendorHidBatterySupport("linux"), false);
    assert.equal(shouldEnableVendorHidBatterySupport(undefined), false);
});
