import assert from "node:assert/strict";
import test from "node:test";
import {
    getDefaultDiskUsageMetricKey,
    getDiskVolumeMetricKey,
    resolveDiskUsageMetricKey,
} from "./disk-metric-keys";

test("resolveDiskUsageMetricKey empty volume id returns default usage key", () => {
    assert.equal(
        resolveDiskUsageMetricKey("used", undefined),
        getDefaultDiskUsageMetricKey("used"),
    );
    assert.equal(
        resolveDiskUsageMetricKey("available", ""),
        getDefaultDiskUsageMetricKey("available"),
    );
});

test("resolveDiskUsageMetricKey explicit volume id returns volume key", () => {
    assert.equal(
        resolveDiskUsageMetricKey("total", "E:\\"),
        getDiskVolumeMetricKey("total", "E:\\"),
    );
});
