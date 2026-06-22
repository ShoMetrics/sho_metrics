import assert from "node:assert/strict";
import { test } from "vitest";
import { buildCustomHttpJsonDigest } from "./custom-http-sample-digest";

test("Custom HTTP JSON digest keeps real keys and reports large array metadata separately", () => {
    const digest = buildCustomHttpJsonDigest({
        Children: [
            { Text: "Sensor", Value: "Value" },
            { Text: "CPU Package", Value: "44.2 °C", Type: "Temperature" },
            { Text: "Vcore", Value: "2.040 V", Type: "Voltage" },
            { Text: "Download Speed", Value: "0.0 KB/s", Type: "Throughput" },
        ],
    });

    const digestJson = JSON.parse(digest.sampleJson) as {
        readonly Children: readonly unknown[];
    };

    assert.equal(digestJson.Children.length, 3);
    assert.doesNotMatch(digest.sampleJson, /__summary|__distinct/u);
    assert.match(digest.arraySummaries.join("\n"), /\$\.Children: 4 items; first 3 shown/u);
});

test("Custom HTTP JSON digest truncates long strings without adding fake JSON fields", () => {
    const digest = buildCustomHttpJsonDigest({
        message: "x".repeat(200),
    });

    const digestJson = JSON.parse(digest.sampleJson) as {
        readonly message: string;
    };

    assert.equal(digestJson.message.length, 83);
    assert.equal(digestJson.message.endsWith("..."), true);
    assert.deepEqual(digest.arraySummaries, []);
});

test("Custom HTTP JSON digest caps the final digest text", () => {
    const wideObject = Object.fromEntries(
        Array.from({ length: 40 }, (_, groupIndex) => [
            `group${groupIndex}`,
            Object.fromEntries(
                Array.from({ length: 40 }, (_, itemIndex) => [
                    `item${itemIndex}`,
                    `value-${groupIndex}-${itemIndex}-${"x".repeat(80)}`,
                ]),
            ),
        ]),
    );

    const digest = buildCustomHttpJsonDigest(wideObject);

    assert.equal(digest.isTruncated, true);
    assert.equal(digest.sampleJson.endsWith("..."), true);
    assert.equal(digest.sampleJson.length <= 12_003, true);
});

test("Custom HTTP JSON digest caps array summaries", () => {
    const wideArrayObject = Object.fromEntries(
        Array.from({ length: 40 }, (_, groupIndex) => [
            `group${groupIndex}`,
            Object.fromEntries(
                Array.from({ length: 40 }, (_, itemIndex) => [
                    `item${itemIndex}`,
                    [1, 2, 3, 4],
                ]),
            ),
        ]),
    );

    const digest = buildCustomHttpJsonDigest(wideArrayObject);
    const summaryText = digest.arraySummaries.join("\n");

    assert.equal(summaryText.endsWith("..."), true);
    assert.equal(summaryText.length <= 12_003, true);
});
