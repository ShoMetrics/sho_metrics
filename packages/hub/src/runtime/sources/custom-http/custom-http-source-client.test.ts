import assert from "node:assert/strict";
import test from "node:test";
import { MetricUnit } from "../metric-source";
import type { SourceMetricPollingGroupResolution } from "../source-polling-groups";
import { CustomHttpDefinitionRegistry } from "./custom-http-definition-registry";
import type { CustomHttpFetchResult, CustomHttpFetcher } from "./custom-http-fetcher";
import {
    buildCustomHttpRuntimeIdentity,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "./custom-http-metric-key";
import { CustomHttpSourceClient } from "./custom-http-source-client";
import type { CustomHttpTransformResult, CustomHttpTransformRunner } from "./custom-http-transform-worker-pool";

test("CustomHttpSourceClient reads configured definitions into metric snapshots", async () => {
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/data",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });
    const registry = new CustomHttpDefinitionRegistry();
    registry.register({
        identity,
        request: {
            url: "https://api.example.com/data",
            userIntent: "show CPU",
            jqTransform: ".",
        },
    });
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: registry,
        fetcher: new FakeCustomHttpFetcher(JSON.stringify({ value: 42 })),
        transformRunner: new FakeCustomHttpTransformRunner({
            metric: {
                label: "CPU",
                value: 42,
                unit: "percent",
                maximum: 100,
            },
        }),
        wallClockNow: () => 1234,
    });

    const result = await sourceClient.readSnapshot([identity.metricKey]);
    const metricValue = result.snapshot.metrics[identity.metricKey];

    assert.equal(metricValue?.value.case, "scalar");
    assert.equal(metricValue?.value.value, 42);
    assert.equal(metricValue?.unit, MetricUnit.PERCENT);
    assert.deepEqual(result.unavailableMetrics, []);
    assert.deepEqual(result.valueAttributions, [{
        metricId: identity.metricKey,
        valueFreshness: "fresh",
        displayHint: {
            label: "CPU",
            unit: MetricUnit.PERCENT,
            maximum: 100,
        },
        rawSensorIdentity: {
            sourceSensorId: identity.metricKey,
            hardwareId: "custom-http",
            hardwareName: "Custom HTTP",
            hardwareType: "HTTP",
            sensorName: "CPU",
            sourceSensorType: "percent",
        },
    }]);
    assert.deepEqual(sourceClient.getCachedStatus(), {
        state: "available",
        lastSuccessAtTimestampMilliseconds: 1234,
    });
    sourceClient.dispose();
});

test("CustomHttpSourceClient returns unavailable reports for missing runtime definitions", async () => {
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/data",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: new CustomHttpDefinitionRegistry(),
        fetcher: new FakeCustomHttpFetcher("{}"),
        transformRunner: new FakeCustomHttpTransformRunner({}),
        wallClockNow: () => 1234,
    });

    const result = await sourceClient.readSnapshot([identity.metricKey]);

    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.unavailableMetrics, [{
        metricId: identity.metricKey,
        reason: "unknown",
    }]);
    assert.deepEqual(sourceClient.getCachedStatus(), {
        state: "unavailable",
        reason: "sourceError",
        lastFailureAtTimestampMilliseconds: 1234,
    });
    sourceClient.dispose();
});

test("CustomHttpSourceClient returns invalidValue for schema failures", async () => {
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/data",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });
    const registry = new CustomHttpDefinitionRegistry();
    registry.register({
        identity,
        request: {
            url: "https://api.example.com/data",
            userIntent: undefined,
            jqTransform: ".",
        },
    });
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: registry,
        fetcher: new FakeCustomHttpFetcher("{}"),
        transformRunner: new FakeCustomHttpTransformRunner({
            metric: {
                label: "CPU",
                value: "not-a-number",
                unit: "percent",
            },
        }),
    });

    const result = await sourceClient.readSnapshot([identity.metricKey]);

    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.unavailableMetrics, [{
        metricId: identity.metricKey,
        reason: "invalidValue",
    }]);
    sourceClient.dispose();
});

test("CustomHttpSourceClient contains unexpected metric read failures to one metric", async () => {
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/data",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });
    const registry = new CustomHttpDefinitionRegistry();
    registry.register({
        identity,
        request: {
            url: "https://api.example.com/data",
            userIntent: undefined,
            jqTransform: ".",
        },
    });
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: registry,
        fetcher: new ThrowingCustomHttpFetcher(),
        transformRunner: new FakeCustomHttpTransformRunner({}),
    });

    const result = await sourceClient.readSnapshot([identity.metricKey]);

    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.unavailableMetrics, [{
        metricId: identity.metricKey,
        reason: "unknown",
    }]);
    assert.deepEqual(sourceClient.getCachedStatus().state, "unavailable");
    sourceClient.dispose();
});

test("CustomHttpSourceClient owns only custom-http metric keys", () => {
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/data",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: new CustomHttpDefinitionRegistry(),
        fetcher: new FakeCustomHttpFetcher("{}"),
        transformRunner: new FakeCustomHttpTransformRunner({}),
    });

    assert.deepEqual(
        [...sourceClient.resolveMetricPollingGroups([
            identity.metricKey,
            "cpu.usage_percent",
        ])],
        [
            [identity.metricKey, {
                state: "owned",
                pollingGroupId: identity.metricKey,
            } satisfies SourceMetricPollingGroupResolution],
            ["cpu.usage_percent", {
                state: "unsupported",
            } satisfies SourceMetricPollingGroupResolution],
        ],
    );
    sourceClient.dispose();
});

class FakeCustomHttpFetcher implements CustomHttpFetcher {
    constructor(private readonly responseText: string) {}

    async fetchJson(): Promise<CustomHttpFetchResult> {
        return {
            ok: true,
            responseText: this.responseText,
        };
    }
}

class ThrowingCustomHttpFetcher implements CustomHttpFetcher {
    async fetchJson(): Promise<CustomHttpFetchResult> {
        throw new Error("unexpected fetcher failure");
    }
}

class FakeCustomHttpTransformRunner implements CustomHttpTransformRunner {
    constructor(private readonly output: unknown) {}

    async runTransform(): Promise<CustomHttpTransformResult> {
        return {
            ok: true,
            output: this.output,
        };
    }

    dispose(): void {}
}
