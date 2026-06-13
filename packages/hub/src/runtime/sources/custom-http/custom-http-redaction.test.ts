import assert from "node:assert/strict";
import test from "node:test";
import {
    redactSecretLikeJsonText,
    redactSecretLikeSourceUrl,
} from "./custom-http-redaction";

test("redactSecretLikeSourceUrl redacts secret-like query parameter values", () => {
    assert.deepEqual(redactSecretLikeSourceUrl("https://api.example.com/data?token=abc123&city=tokyo"), {
        text: "https://api.example.com/data?token=REDACTED&city=tokyo",
        hasSecretLikeQueryParameter: true,
    });
});

test("redactSecretLikeJsonText redacts nested secret-like JSON properties", () => {
    assert.equal(
        redactSecretLikeJsonText(JSON.stringify({
            status: "failed",
            author: "Open-Meteo",
            signal_quality: "good",
            token_count: 12,
            auth: {
                accessToken: "abc123",
            },
            items: [
                { client_secret: "secret-value" },
            ],
        })),
        "{\"status\":\"failed\",\"author\":\"Open-Meteo\",\"signal_quality\":\"good\",\"token_count\":12,\"auth\":\"REDACTED\",\"items\":[{\"client_secret\":\"REDACTED\"}]}",
    );
});

test("redactSecretLikeJsonText redacts secret-like fields in invalid JSON previews", () => {
    assert.equal(
        redactSecretLikeJsonText("{\"token\":\"abc123\",\"author\":\"Open-Meteo\",\"reason\":\"truncated\""),
        "{\"token\":\"REDACTED\",\"author\":\"Open-Meteo\",\"reason\":\"truncated\"",
    );
});
