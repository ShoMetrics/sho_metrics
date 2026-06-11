import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { CUSTOM_HTTP_TRANSFORM_WORKER_THREAD_ENTRY } from "./custom-http-transform-worker-thread";
import { CustomHttpTransformWorkerPool } from "./custom-http-transform-worker-pool";

const TEST_WORKER_SCRIPT_URL = pathToFileURL(path.resolve(
    ".test-dist/src/runtime/sources/custom-http/custom-http-transform-worker-thread.js",
));

test("Custom HTTP transform worker test entry stays linked into test output", () => {
    assert.equal(CUSTOM_HTTP_TRANSFORM_WORKER_THREAD_ENTRY, "custom-http-transform-worker");
});

test("CustomHttpTransformWorkerPool runs jq transforms in a reusable bounded worker", async () => {
    const pool = new CustomHttpTransformWorkerPool({
        poolSize: 1,
        workerScriptUrl: TEST_WORKER_SCRIPT_URL,
    });

    try {
        assert.deepEqual(await pool.runTransform({
            inputJson: { value: 42 },
            jqTransform: "{ metric: { label: \"TEMP\", value: .value, unit: \"celsius\" } }",
        }), {
            ok: true,
            output: {
                metric: {
                    label: "TEMP",
                    value: 42,
                    unit: "celsius",
                },
            },
        });
        assert.deepEqual(await pool.runTransform({
            inputJson: { value: 7 },
            jqTransform: "{ metric: { label: \"CPU\", value: .value, unit: \"percent\" } }",
        }), {
            ok: true,
            output: {
                metric: {
                    label: "CPU",
                    value: 7,
                    unit: "percent",
                },
            },
        });
    } finally {
        pool.dispose();
    }
});

test("CustomHttpTransformWorkerPool rejects multi-output jq transforms deterministically", async () => {
    const pool = new CustomHttpTransformWorkerPool({
        poolSize: 1,
        workerScriptUrl: TEST_WORKER_SCRIPT_URL,
    });

    try {
        assert.deepEqual(await pool.runTransform({
            inputJson: [1, 2],
            jqTransform: ".[]",
        }), {
            ok: false,
            reason: "malformedOutput",
            detail: "jq transform must emit exactly one JSON value.",
        });
    } finally {
        pool.dispose();
    }
});

test("CustomHttpTransformWorkerPool rejects output before schema validation when output is too large", async () => {
    const pool = new CustomHttpTransformWorkerPool({
        outputLimitBytes: 8,
        poolSize: 1,
        workerScriptUrl: TEST_WORKER_SCRIPT_URL,
    });

    try {
        assert.deepEqual(await pool.runTransform({
            inputJson: { value: 1 },
            jqTransform: "{ metric: { label: \"TEMP\", value: .value, unit: \"celsius\" } }",
        }), {
            ok: false,
            reason: "outputTooLarge",
            detail: "Transform output exceeded byte limit.",
        });
    } finally {
        pool.dispose();
    }
});

test("CustomHttpTransformWorkerPool terminates a timed-out worker and keeps the pool usable", async () => {
    const pool = new CustomHttpTransformWorkerPool({
        poolSize: 1,
        timeoutMilliseconds: 500,
        workerScriptUrl: TEST_WORKER_SCRIPT_URL,
    });

    try {
        assert.deepEqual(await pool.runTransform({
            inputJson: { value: 1 },
            jqTransform: "def spin: spin; spin",
        }), {
            ok: false,
            reason: "timeout",
            detail: "jq transform exceeded 500 ms.",
        });

        assert.deepEqual(await pool.runTransform({
            inputJson: { value: 2 },
            jqTransform: "{ metric: { label: \"CPU\", value: .value, unit: \"percent\" } }",
        }), {
            ok: true,
            output: {
                metric: {
                    label: "CPU",
                    value: 2,
                    unit: "percent",
                },
            },
        });
    } finally {
        pool.dispose();
    }
});

test("CustomHttpTransformWorkerPool absorbs the workerpool replacement race after timeout", async () => {
    const pool = new CustomHttpTransformWorkerPool({
        poolSize: 1,
        timeoutMilliseconds: 500,
        workerScriptUrl: TEST_WORKER_SCRIPT_URL,
    });

    try {
        const timedOutTransform = pool.runTransform({
            inputJson: { value: 1 },
            jqTransform: "def spin: spin; spin",
        });
        const queuedTransform = pool.runTransform({
            inputJson: { value: 3 },
            jqTransform: "{ metric: { label: \"CPU\", value: .value, unit: \"percent\" } }",
        });

        assert.deepEqual(await timedOutTransform, {
            ok: false,
            reason: "timeout",
            detail: "jq transform exceeded 500 ms.",
        });
        assert.deepEqual(await queuedTransform, {
            ok: true,
            output: {
                metric: {
                    label: "CPU",
                    value: 3,
                    unit: "percent",
                },
            },
        });
    } finally {
        pool.dispose();
    }
});
