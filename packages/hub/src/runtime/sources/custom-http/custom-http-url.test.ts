import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
    isCustomHttpLocalOrPrivateUrl,
    normalizeCustomHttpSourceUrlInput,
} from "./custom-http-url";

describe("Custom HTTP URL normalization", () => {
    it("keeps empty and absolute URLs unchanged except for whitespace", () => {
        assert.equal(normalizeCustomHttpSourceUrlInput("   "), "");
        assert.equal(
            normalizeCustomHttpSourceUrlInput(" https://api.example.com/current "),
            "https://api.example.com/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput(" http://api.example.com/current "),
            "http://api.example.com/current",
        );
    });

    it("defaults scheme-less URLs to HTTPS", () => {
        assert.equal(
            normalizeCustomHttpSourceUrlInput("api.open-meteo.com/v1/forecast"),
            "https://api.open-meteo.com/v1/forecast",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("httpbin.org/get"),
            "https://httpbin.org/get",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("httpsfoo.example.com/current"),
            "https://httpsfoo.example.com/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("example.com/proxy?target=https://internal.example.com/current"),
            "https://example.com/proxy?target=https://internal.example.com/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("192.0.2.10/current"),
            "https://192.0.2.10/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("11.0.0.1/current"),
            "https://11.0.0.1/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("172.15.0.1/current"),
            "https://172.15.0.1/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("172.32.0.1/current"),
            "https://172.32.0.1/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("192.169.0.1/current"),
            "https://192.169.0.1/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("localhost:8080@evil.example.com/current"),
            "https://localhost:8080@evil.example.com/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("//api.example.com/current"),
            "https://api.example.com/current",
        );
    });

    it("keeps broken HTTP scheme input unchanged instead of stacking another scheme", () => {
        assert.equal(normalizeCustomHttpSourceUrlInput("https:\\/\\/ht"), "https:\\/\\/ht");
        assert.equal(normalizeCustomHttpSourceUrlInput("https//ht"), "https//ht");
        assert.equal(normalizeCustomHttpSourceUrlInput("http:/localhost:8080/current"), "http:/localhost:8080/current");
    });

    it("defaults local and private scheme-less URLs to HTTP", () => {
        assert.equal(
            normalizeCustomHttpSourceUrlInput("localhost:8080/current"),
            "http://localhost:8080/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("dev.localhost/current"),
            "http://dev.localhost/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("sensor.local/current"),
            "http://sensor.local/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("127.0.0.1:8080/current"),
            "http://127.0.0.1:8080/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("10.0.0.5/current"),
            "http://10.0.0.5/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("172.16.0.5/current"),
            "http://172.16.0.5/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("172.31.255.255/current"),
            "http://172.31.255.255/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("192.168.1.10/current"),
            "http://192.168.1.10/current",
        );
        assert.equal(
            normalizeCustomHttpSourceUrlInput("[::1]:8080/current"),
            "http://[::1]:8080/current",
        );
    });

    it("detects local and private absolute URLs", () => {
        assert.equal(isCustomHttpLocalOrPrivateUrl(new URL("http://localhost:8080/current")), true);
        assert.equal(isCustomHttpLocalOrPrivateUrl(new URL("http://sensor.local/current")), true);
        assert.equal(isCustomHttpLocalOrPrivateUrl(new URL("http://192.168.1.10/current")), true);
        assert.equal(isCustomHttpLocalOrPrivateUrl(new URL("http://api.example.com/current")), false);
    });
});
