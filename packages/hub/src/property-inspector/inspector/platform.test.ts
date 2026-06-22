import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizePropertyInspectorHostPlatform } from "./platform";

test("normalizes Property Inspector platform strings", () => {
    assert.equal(normalizePropertyInspectorHostPlatform("windows"), "win32");
    assert.equal(normalizePropertyInspectorHostPlatform("Win32"), "win32");
    assert.equal(normalizePropertyInspectorHostPlatform("mac"), "darwin");
    assert.equal(normalizePropertyInspectorHostPlatform("MacIntel"), "darwin");
    assert.equal(normalizePropertyInspectorHostPlatform("darwin"), "darwin");
    assert.equal(normalizePropertyInspectorHostPlatform("Linux x86_64"), "linux");
    assert.equal(normalizePropertyInspectorHostPlatform("freebsd"), "freebsd");
    assert.equal(normalizePropertyInspectorHostPlatform(undefined), "other");
});
