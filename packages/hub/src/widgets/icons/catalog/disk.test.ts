import assert from "node:assert/strict";
import { test } from "vitest";
import { renderDiskThroughputDirectionIconFragment } from "./disk";

test("disk throughput direction icons render read as up and write as down", () => {
    const readIconFragment = renderDiskThroughputDirectionIconFragment({
        direction: "read",
        size: 30,
    });
    const writeIconFragment = renderDiskThroughputDirectionIconFragment({
        direction: "write",
        size: 30,
    });

    assert.match(readIconFragment, /m16 6-4-4-4 4/);
    assert.match(writeIconFragment, /m16 6-4 4-4-4/);
});
