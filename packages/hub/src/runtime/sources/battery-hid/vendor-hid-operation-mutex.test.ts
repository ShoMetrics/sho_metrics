import assert from "node:assert/strict";
import { test } from "vitest";
import { VendorHidOperationMutex } from "./vendor-hid-operation-mutex";

test("vendor HID operation mutex releases the queue after an operation throws", async () => {
    const mutex = new VendorHidOperationMutex();
    const events: string[] = [];

    await assert.rejects(
        mutex.run("throwing", () => {
            events.push("throwing");
            throw new Error("boom");
        }),
    );
    const result = await mutex.run("next", () => {
        events.push("next");
        return 42;
    });

    assert.equal(result, 42);
    assert.deepEqual(events, ["throwing", "next"]);
});
