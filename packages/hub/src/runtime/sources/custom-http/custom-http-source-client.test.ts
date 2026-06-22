import assert from "node:assert/strict";
import { test } from "vitest";
import type { ResolvedCustomHttpRequestAuth } from "../../../settings/resolved-settings";
import type {
    CustomHttpCredentialSettings,
    CustomHttpSecretCredential,
} from "../../../settings/storage/custom-http-credential-settings";
import { MetricUnit } from "../metric-source";
import type { SourceMetricPollingGroupResolution } from "../source-polling-groups";
import type { CustomHttpCredentialSettingsReader } from "./custom-http-auth";
import { CustomHttpDefinitionRegistry } from "./custom-http-definition-registry";
import type { CustomHttpFetchOptions, CustomHttpFetchResult, CustomHttpFetcher } from "./custom-http-fetcher";
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
            requestSettings: { timeoutSeconds: 10, retryCount: 2 },
            auth: defaultRequestAuth(),
        },
    });
    const fetcher = new FakeCustomHttpFetcher(JSON.stringify({ value: 42 }));
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: registry,
        fetcher,
        transformRunner: new FakeCustomHttpTransformRunner({
            metric: {
                label: "CPU",
                value: 42,
                unit: "percent",
                maximum: 100,
                suggestedLucideIconId: "cpu",
            },
        }),
        wallClockNow: () => 1234,
    });

    const result = await sourceClient.readSnapshot([identity.metricKey]);
    const metricValue = result.snapshot.metrics[identity.metricKey];

    assert.equal(metricValue?.value.case, "scalar");
    assert.deepEqual(fetcher.urlList, ["https://api.example.com/data"]);
    assert.deepEqual(fetcher.optionsList, [{ timeoutSeconds: 10, retryCount: 2 }]);
    assert.equal(metricValue?.value.value, 42);
    assert.equal(metricValue?.unit, MetricUnit.PERCENT);
    assert.deepEqual(result.unavailableMetrics, []);
    assert.deepEqual(result.valueMetadata, [{
        metricId: identity.metricKey,
        valueFreshness: "fresh",
        displayHint: {
            label: "CPU",
            unit: MetricUnit.PERCENT,
            maximum: 100,
            suggestedLucideIconId: "cpu",
        },
    }]);
    assert.deepEqual(sourceClient.getCachedStatus(), {
        state: "available",
        lastSuccessAtTimestampMilliseconds: 1234,
    });
    sourceClient.dispose();
});

test("CustomHttpSourceClient applies selected credentials before fetch", async () => {
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/data",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });
    const registry = new CustomHttpDefinitionRegistry();
    registry.register({
        identity,
        request: {
            url: "https://api.example.com/data?api_key=old",
            userIntent: undefined,
            jqTransform: ".",
            requestSettings: { timeoutSeconds: 5, retryCount: 0 },
            auth: {
                credentialId: "credential-1",
                allowPublicHttpCredentials: false,
            },
        },
    });
    const fetcher = new FakeCustomHttpFetcher(JSON.stringify({ value: 42 }));
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: registry,
        fetcher,
        credentialSettingsReader: new FakeCustomHttpCredentialSettingsReader(globalSettings(
            {
                id: "credential-1",
                authKind: "query",
                queryParameterName: "api_key",
                token: "secret",
            },
        )),
        transformRunner: new FakeCustomHttpTransformRunner({
            metric: {
                label: "CPU",
                value: 42,
                unit: "percent",
            },
        }),
    });

    const result = await sourceClient.readSnapshot([identity.metricKey]);

    assert.equal(result.snapshot.metrics[identity.metricKey]?.value.case, "scalar");
    assert.deepEqual(fetcher.urlList, ["https://api.example.com/data?api_key=secret"]);
    assert.deepEqual(fetcher.optionsList, [{ timeoutSeconds: 5, retryCount: 0 }]);
    sourceClient.dispose();
});

test("CustomHttpSourceClient passes header credentials through fetch options", async () => {
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
            requestSettings: { timeoutSeconds: 5, retryCount: 0 },
            auth: {
                credentialId: "credential-1",
                allowPublicHttpCredentials: false,
            },
        },
    });
    const fetcher = new FakeCustomHttpFetcher(JSON.stringify({ value: 42 }));
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: registry,
        fetcher,
        credentialSettingsReader: new FakeCustomHttpCredentialSettingsReader(globalSettings(
            {
                id: "credential-1",
                authKind: "bearer",
                token: "secret",
            },
        )),
        transformRunner: new FakeCustomHttpTransformRunner({
            metric: {
                label: "CPU",
                value: 42,
                unit: "percent",
            },
        }),
    });

    await sourceClient.readSnapshot([identity.metricKey]);

    assert.deepEqual(fetcher.optionsList, [{
        timeoutSeconds: 5,
        retryCount: 0,
        headers: {
            Authorization: "Bearer secret",
        },
    }]);
    sourceClient.dispose();
});

test("CustomHttpSourceClient reports missing credentials without fetching", async () => {
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
            requestSettings: { timeoutSeconds: 5, retryCount: 0 },
            auth: {
                credentialId: "missing",
                allowPublicHttpCredentials: false,
            },
        },
    });
    const fetcher = new FakeCustomHttpFetcher("{}");
    const sourceClient = new CustomHttpSourceClient({
        definitionRegistry: registry,
        fetcher,
        credentialSettingsReader: new FakeCustomHttpCredentialSettingsReader(globalSettings()),
        transformRunner: new FakeCustomHttpTransformRunner({}),
    });

    const result = await sourceClient.readSnapshot([identity.metricKey]);

    assert.deepEqual(result.snapshot.metrics, {});
    assert.deepEqual(result.unavailableMetrics, [{
        metricId: identity.metricKey,
        reason: "unknown",
    }]);
    assert.deepEqual(fetcher.urlList, []);
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
            requestSettings: { timeoutSeconds: 5, retryCount: 0 },
            auth: defaultRequestAuth(),
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
            requestSettings: { timeoutSeconds: 5, retryCount: 0 },
            auth: defaultRequestAuth(),
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

    readonly urlList: string[] = [];
    readonly optionsList: CustomHttpFetchOptions[] = [];

    async fetchJson(url: string, options?: CustomHttpFetchOptions): Promise<CustomHttpFetchResult> {
        this.urlList.push(url);
        this.optionsList.push(options ?? {});
        return {
            ok: true,
            responseText: this.responseText,
        };
    }
}

class FakeCustomHttpCredentialSettingsReader implements CustomHttpCredentialSettingsReader {
    constructor(private readonly credentialSettings: CustomHttpCredentialSettings) {}

    readCredentialSettings(): CustomHttpCredentialSettings {
        return this.credentialSettings;
    }
}

function globalSettings(
    ...customHttpCredentials: readonly CustomHttpSecretCredential[]
): CustomHttpCredentialSettings {
    return { customHttpCredentials };
}

function defaultRequestAuth(): ResolvedCustomHttpRequestAuth {
    return { credentialId: undefined, allowPublicHttpCredentials: false };
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
