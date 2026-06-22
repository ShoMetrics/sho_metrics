import assert from "node:assert/strict";
import { test } from "vitest";
import {
    buildOpenLogiRootGetFeatureRequestPayload,
    buildUnusedOpenLogiRootPingRequestPayloadForParity,
    parseOpenLogiRootGetFeatureResponsePayload,
    parseUnusedOpenLogiRootPingResponsePayloadForParity,
} from "./root";

test("OpenLogi Root get_feature request uses big-endian feature id plus padding", () => {
    assert.deepEqual(buildOpenLogiRootGetFeatureRequestPayload(0x1004), [0x10, 0x04, 0x00]);
});

test("OpenLogi Root get_feature response returns undefined for unsupported features", () => {
    assert.equal(parseOpenLogiRootGetFeatureResponsePayload([0x00, 0x00, 0x00]), undefined);
});

test("OpenLogi Root get_feature response parses feature index type and version", () => {
    assert.deepEqual(parseOpenLogiRootGetFeatureResponsePayload([0x09, 0x40, 0x02]), {
        index: 0x09,
        typ: {
            obsolete: false,
            hidden: true,
            engineering: false,
            manufacturingDeactivatable: false,
            complianceDeactivatable: false,
        },
        version: 0x02,
    });
});

test("OpenLogi Root ping request and response carry the arbitrary data byte", () => {
    assert.deepEqual(buildUnusedOpenLogiRootPingRequestPayloadForParity(0xAB), [0x00, 0x00, 0xAB]);
    assert.equal(parseUnusedOpenLogiRootPingResponsePayloadForParity([0x00, 0x00, 0xAB]), 0xAB);
});
