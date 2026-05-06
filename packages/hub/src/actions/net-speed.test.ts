import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetSpeedMetricKeys } from "./net-speed-metric-keys";

test("network sparkline both mode subscribes to upload and download", () => {
    assert.deepEqual(resolveNetSpeedMetricKeys({
        graphicType: "dashed-line",
        networkDirection: "both",
    }), ["net.up", "net.down"]);
});

test("network sparkline single mode subscribes to one direction", () => {
    assert.deepEqual(resolveNetSpeedMetricKeys({
        graphicType: "dashed-line",
        networkDirection: "upload",
    }), ["net.up"]);
});

test("network circular both mode subscribes to upload and download", () => {
    assert.deepEqual(resolveNetSpeedMetricKeys({
        graphicType: "circular",
        networkDirection: "both",
    }), ["net.up", "net.down"]);
});
