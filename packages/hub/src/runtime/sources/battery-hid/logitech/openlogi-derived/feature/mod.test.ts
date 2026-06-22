import assert from "node:assert/strict";
import { test } from "vitest";
import {
    encodeOpenLogiFeatureType,
    parseOpenLogiFeatureType,
} from "./mod";

test("OpenLogi FeatureType decodes feature type bitfields", () => {
    assert.deepEqual(parseOpenLogiFeatureType(0xF8), {
        obsolete: true,
        hidden: true,
        engineering: true,
        manufacturingDeactivatable: true,
        complianceDeactivatable: true,
    });
    assert.deepEqual(parseOpenLogiFeatureType(0x07), {
        obsolete: false,
        hidden: false,
        engineering: false,
        manufacturingDeactivatable: false,
        complianceDeactivatable: false,
    });
});

test("OpenLogi FeatureType encodes feature type bitfields", () => {
    assert.equal(encodeOpenLogiFeatureType({
        obsolete: true,
        hidden: false,
        engineering: true,
        manufacturingDeactivatable: false,
        complianceDeactivatable: true,
    }), 0xA8);
});
