import assert from "node:assert/strict";
import { test } from "vitest";
import { renderFreeCapacityIconFragment } from "./free-capacity-icon";

test("renders the free-capacity marker with the Lucide dashed-circle geometry", () => {
    const fragment = renderFreeCapacityIconFragment(30);

    assert.equal(fragment.match(/<path /gu)?.length, 8);
    assert.match(fragment, /stroke-width="2\.2"/u);
});
