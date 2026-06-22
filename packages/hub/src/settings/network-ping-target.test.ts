import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
    DEFAULT_NETWORK_PING_TARGET_HOST,
    normalizeNetworkPingTargetInput,
} from "./network-ping-target";

describe("network ping target normalization", () => {
    const normalizedCases: ReadonlyArray<{
        readonly input: string;
        readonly targetHost: string;
    }> = [
        { input: "8.8.8.8", targetHost: "8.8.8.8" },
        { input: " 1.1.1.1 ", targetHost: "1.1.1.1" },
        { input: "https://Example.COM/path?q=1", targetHost: "example.com" },
        { input: "example.com/path", targetHost: "example.com" },
        { input: "http://user:pass@example.com:8080/a#b", targetHost: "example.com" },
        { input: "[2606:4700:4700::1111]", targetHost: "2606:4700:4700::1111" },
        { input: "https://[2606:4700:4700::1111]/dns-query", targetHost: "2606:4700:4700::1111" },
        { input: "Router.", targetHost: "router" },
        { input: "nas", targetHost: "nas" },
    ];

    for (const testCase of normalizedCases) {
        it(`stores ${testCase.input} as ${testCase.targetHost}`, () => {
            assert.deepEqual(normalizeNetworkPingTargetInput(testCase.input), {
                targetHost: testCase.targetHost,
                status: "normalized",
            });
        });
    }

    const defaultedCases = [
        "",
        "bad host",
        "http://",
        "[invalid",
        "::",
        "bad_host",
        "-example.com",
        "example-.com",
        "8.8.0.8s",
        "999.8.0.8",
        "example.com/path with spaces",
        "example.com\tpath",
    ];

    for (const input of defaultedCases) {
        it(`defaults invalid input ${JSON.stringify(input)}`, () => {
            assert.deepEqual(normalizeNetworkPingTargetInput(input), {
                targetHost: DEFAULT_NETWORK_PING_TARGET_HOST,
                status: "defaulted",
            });
        });
    }
});
