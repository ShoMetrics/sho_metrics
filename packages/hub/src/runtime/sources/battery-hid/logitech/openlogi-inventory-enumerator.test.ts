import assert from "node:assert/strict";
import test from "node:test";
import {
    enumerateOpenLogiInventoryOnce,
    type OpenLogiInventoryEnumerationResult,
    type OpenLogiInventoryEnumerationRuntime,
} from "./openlogi-inventory-enumerator";
import {
    OPENLOGI_HIDPP_ONESHOT_ATTEMPTS,
    OPENLOGI_HIDPP_ONESHOT_RETRY_DELAY_MILLISECONDS,
} from "./openlogi-hidpp-transport";

test("OpenLogi one-shot inventory returns the first healthy enumeration", async () => {
    const runtime = new ScriptedOpenLogiInventoryRuntime([
        {
            inventories: ["mouse"],
            allNodesHealthy: true,
        },
    ]);

    const inventories = await enumerateOpenLogiInventoryOnce(runtime);

    assert.deepEqual(inventories, ["mouse"]);
    assert.equal(runtime.enumerationCount, 1);
    assert.deepEqual(runtime.sleepDurations, []);
});

test("OpenLogi one-shot inventory retries unhealthy probes before returning", async () => {
    const runtime = new ScriptedOpenLogiInventoryRuntime([
        {
            inventories: [],
            allNodesHealthy: false,
        },
        {
            inventories: ["mouse"],
            allNodesHealthy: true,
        },
    ]);

    const inventories = await enumerateOpenLogiInventoryOnce(runtime);

    assert.deepEqual(inventories, ["mouse"]);
    assert.equal(runtime.enumerationCount, 2);
    assert.deepEqual(runtime.sleepDurations, [OPENLOGI_HIDPP_ONESHOT_RETRY_DELAY_MILLISECONDS]);
});

test("OpenLogi one-shot inventory returns the last unhealthy result at the attempt limit", async () => {
    const runtime = new ScriptedOpenLogiInventoryRuntime(
        Array.from({ length: OPENLOGI_HIDPP_ONESHOT_ATTEMPTS }, (_, index) => ({
            inventories: [`partial-${index + 1}`],
            allNodesHealthy: false,
        })),
    );

    const inventories = await enumerateOpenLogiInventoryOnce(runtime);

    assert.deepEqual(inventories, [`partial-${OPENLOGI_HIDPP_ONESHOT_ATTEMPTS}`]);
    assert.equal(runtime.enumerationCount, OPENLOGI_HIDPP_ONESHOT_ATTEMPTS);
    assert.deepEqual(
        runtime.sleepDurations,
        Array.from(
            { length: OPENLOGI_HIDPP_ONESHOT_ATTEMPTS - 1 },
            () => OPENLOGI_HIDPP_ONESHOT_RETRY_DELAY_MILLISECONDS,
        ),
    );
});

class ScriptedOpenLogiInventoryRuntime implements OpenLogiInventoryEnumerationRuntime<string> {
    readonly sleepDurations: number[] = [];
    private nextResultIndex = 0;

    constructor(private readonly results: readonly OpenLogiInventoryEnumerationResult<string>[]) {}

    get enumerationCount(): number {
        return this.nextResultIndex;
    }

    enumerateReportingHealth(): Promise<OpenLogiInventoryEnumerationResult<string>> {
        const result = this.results[Math.min(this.nextResultIndex, this.results.length - 1)];
        this.nextResultIndex += 1;
        return Promise.resolve(result);
    }

    sleep(milliseconds: number): Promise<void> {
        this.sleepDurations.push(milliseconds);
        return Promise.resolve();
    }
}
