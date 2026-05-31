import assert from "node:assert/strict";
import test from "node:test";
import { formatCompactHardwareModelLabel } from "./hardware-model-format";

test("hardware model format keeps recognizable CPU family and SKU", () => {
    assert.equal(
        formatCompactHardwareModelLabel("Intel(R) Core(TM) i7-12700K CPU @ 3.60GHz", "cpu"),
        "Core i7-12700K",
    );
    assert.equal(
        formatCompactHardwareModelLabel("AMD Ryzen 9 7950X 16-Core Processor", "cpu"),
        "Ryzen 9 7950X",
    );
});

test("hardware model format removes GPU vendor boilerplate", () => {
    assert.equal(
        formatCompactHardwareModelLabel("NVIDIA GeForce RTX 4090 Graphics", "gpu"),
        "RTX 4090",
    );
    assert.equal(
        formatCompactHardwareModelLabel("AMD Radeon RX 7900 XTX Graphics", "gpu"),
        "Radeon RX 7900 XTX",
    );
});

test("hardware model format ignores empty model labels after cleanup", () => {
    assert.equal(formatCompactHardwareModelLabel("CPU Graphics Processor", "gpu"), undefined);
    assert.equal(formatCompactHardwareModelLabel(undefined, "cpu"), undefined);
});
