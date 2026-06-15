import assert from "node:assert/strict";
import test from "node:test";
import { create } from "@bufbuild/protobuf";
import type {
    DidReceiveSettingsEvent,
    SendToPluginEvent,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import {
    buildCustomMetricViewOptions,
    CustomMetric,
} from "./custom-metric";
import type { MetricCollectionBinding } from "./metric-action";
import type { MetricStoreReader, MetricWidgetDataReadResult } from "../runtime/metric-store";
import type {
    CustomHttpFetcher,
    CustomHttpFetchOptions,
    CustomHttpFetchResult,
} from "../runtime/sources/custom-http/custom-http-fetcher";
import type { CustomHttpCredentialSettingsReader } from "../runtime/sources/custom-http/custom-http-auth";
import {
    CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
    type CustomHttpSourceEditorResponse,
} from "../runtime/sources/custom-http/custom-http-source-editor-messages";
import { listMetricReadPlanKeys, normalizeMetricReadPlan } from "../runtime/source-routing/metric-read-plan";
import { CustomHttpDefinitionRegistry } from "../runtime/sources/custom-http/custom-http-definition-registry";
import {
    buildCustomHttpRuntimeIdentity,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../runtime/sources/custom-http/custom-http-metric-key";
import { MetricUnit } from "../runtime/sources/metric-source";
import type {
    CustomHttpTransformOutputMode,
    CustomHttpTransformResult,
    CustomHttpTransformRunner,
} from "../runtime/sources/custom-http/custom-http-transform-worker-pool";
import type { MetricValueDisplayHint } from "../runtime/sources/source-client";
import { CUSTOM_HTTP_SOURCE_ID } from "../runtime/sources/source-ids";
import { composeMetricViewFrame } from "../view-rendering/metric-view-frame";
import type { WidgetData } from "../view-rendering/widget-data";
import {
    getCustomMetricIconFragment,
    getDefaultCustomMetricIconFragment,
} from "../widgets/icons/custom-metric-icons";
import { resolveInitialActionSettings } from "./settings/action-settings-resolver";
import { writeStoredWidgetSettingsPatch } from "../settings/storage/patch/widget-settings-patch";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import {
    CustomHttpCredentialSchema,
    StoredGlobalSettingsSchema,
    type StoredGlobalSettings,
} from "../generated/proto/shometrics/v1/settings_pb";

test("Custom Metric without configured HTTP does not register collection or runtime definition", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-empty-action");

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));

        assert.equal(action.bindings.length, 0);
        assert.deepEqual(registry.list(), []);
        assert.equal(action.metricsUpdateCallCount, 1);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("Custom Metric registers configured HTTP definition and routes through custom-http source", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-configured-action");
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, rawSettings));

        const identity = buildCustomHttpRuntimeIdentity({
            url: "https://api.example.com/data",
            actionId: streamDeckAction.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });
        assert.deepEqual(registry.read(identity.metricKey), {
            identity,
            request: {
                url: "https://api.example.com/data",
                userIntent: "show CPU",
                jqTransform: ".",
                requestSettings: { timeoutSeconds: 5, retryCount: 0 },
                auth: {
                    credentialId: undefined,
                    allowPublicHttpCredentials: false,
                },
            },
        });
        assert.equal(action.bindings.length, 1);
        const readPlan = normalizeMetricReadPlan(action.bindings[0].refreshOptionsList[0].readPlan);
        assert.deepEqual(listMetricReadPlanKeys(readPlan), [identity.metricKey]);
        assert.deepEqual(readPlan.metrics[0]?.sourceCandidates, [{ sourceId: CUSTOM_HTTP_SOURCE_ID }]);
        assert.equal(readPlan.metrics[0]?.sourceScopeId, identity.sourceScopeId);
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("Custom Metric honors long HTTP polling frequencies", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-long-polling-action");
    const rawSettings = writeStoredWidgetSettingsPatch(buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show flight",
        jqTransform: ".",
    }), {
        preferences: { pollingFrequencySeconds: 86400 },
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, rawSettings));

        assert.equal(action.bindings[0].refreshOptionsList[0].pollingIntervalMilliseconds, 86_400_000);
        assert.equal(action.bindings[0].refreshOptionsList[0].maximumSampleAgeMilliseconds, 86_405_000);
        assert.equal(
            action.bindings[0].refreshOptionsList[0].metricSubscriptions[0]?.intervalMilliseconds,
            86_400_000,
        );
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("Custom Metric replaces runtime definition when settings change", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-replace-action");
    const firstSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/first",
        userIntent: "show CPU",
        jqTransform: ".cpu",
    });
    const secondSettings = buildCustomMetricWidgetSettings({
        url: "https://api2.example.com/second",
        userIntent: "show RAM",
        jqTransform: ".ram",
    });

    try {
        action.onWillAppear(buildWillAppearEvent(streamDeckAction, firstSettings));
        const firstIdentity = buildCustomHttpRuntimeIdentity({
            url: "https://api.example.com/first",
            actionId: streamDeckAction.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });

        action.onDidReceiveSettings(buildDidReceiveSettingsEvent(streamDeckAction, secondSettings));

        const secondIdentity = buildCustomHttpRuntimeIdentity({
            url: "https://api2.example.com/second",
            actionId: streamDeckAction.id,
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        });
        assert.equal(registry.read(firstIdentity.metricKey), undefined);
        assert.equal(registry.read(secondIdentity.metricKey)?.request.jqTransform, ".ram");
    } finally {
        action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));
    }
});

test("Custom Metric unregisters runtime definition on disappear", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const action = new TestCustomMetric(registry);
    const streamDeckAction = new FakeStreamDeckAction("custom-disappear-action");
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, rawSettings));
    action.onWillDisappear(buildWillDisappearEvent(streamDeckAction));

    assert.deepEqual(registry.list(), []);
});

test("Custom Metric view renders Configure for unconfigured settings", () => {
    const rawSettings = buildCustomMetricWidgetSettings();
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-configure-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
    });

    assert.equal(viewOptions.metricKey, "custom-http.configure");
    assert.equal(viewOptions.noticeText, "Configure");
});

test("Custom Metric view renders pending copy before the first configured sample", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-pending-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: new CapturingMetricStoreReader({}),
    });

    assert.equal(viewOptions.widgetData.unavailableDisplayValue, "...");
});

test("Custom Metric view keeps N/A path after runtime failure", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-failed-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: new CapturingMetricStoreReader({
            unavailableMetric: true,
        }),
    });

    assert.equal(viewOptions.widgetData.unavailableDisplayValue, undefined);
});

test("Custom Metric view uses source display hints for label, unit, and maximum", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show CPU",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;
    const metricReader = new CapturingMetricStoreReader({
        current: 42,
        sampleTimestampMilliseconds: 1234,
        displayHint: {
            label: "CPU",
            unit: MetricUnit.PERCENT,
            maximum: 84,
        },
    });

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-hint-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: metricReader,
    });

    assert.equal(viewOptions.widgetData.label, "CPU");
    assert.equal(viewOptions.widgetData.unit, "%");
    assert.equal(viewOptions.widgetData.current, 42);
    assert.equal(viewOptions.widgetData.progress, 0.5);
    assert.deepEqual(viewOptions.widgetData.sparklineScale, {
        mode: "fixed",
        minimumValue: 0,
        maximumValue: 84,
    });
});

test("Custom Metric view uses source suggested icon when no manual icon is selected", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show temperature",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-suggested-icon-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: new CapturingMetricStoreReader({
            current: 21,
            sampleTimestampMilliseconds: 1234,
            displayHint: {
                label: "TEMP",
                unit: MetricUnit.CELSIUS,
                suggestedLucideIconId: "thermometer",
            },
        }),
    });

    assert.equal(viewOptions.centerIconFragment, getCustomMetricIconFragment("thermometer"));
});

test("Custom Metric view uses manual icon before source suggested icon", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show temperature",
        jqTransform: ".",
        iconId: "cloud-sun",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-manual-icon-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: new CapturingMetricStoreReader({
            current: 21,
            sampleTimestampMilliseconds: 1234,
            displayHint: {
                label: "TEMP",
                unit: MetricUnit.CELSIUS,
                suggestedLucideIconId: "thermometer",
            },
        }),
    });

    assert.equal(viewOptions.centerIconFragment, getCustomMetricIconFragment("cloud-sun"));
});

test("Custom Metric view uses non-question default icon without manual or suggested icon", () => {
    const rawSettings = buildCustomMetricWidgetSettings();
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-default-icon-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
    });

    assert.equal(viewOptions.centerIconFragment, getDefaultCustomMetricIconFragment());
    assert.doesNotMatch(viewOptions.centerIconFragment, /question/iu);
});

test("Custom Metric view preserves custom unit text without catalog unit formatting", () => {
    const rawSettings = buildCustomMetricWidgetSettings({
        url: "https://api.example.com/data",
        userIntent: "show wind",
        jqTransform: ".",
    });
    const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;
    const metricReader = new CapturingMetricStoreReader({
        current: 18,
        sampleTimestampMilliseconds: 1234,
        displayHint: {
            label: "Wind",
            unit: MetricUnit.UNSPECIFIED,
            customUnit: "km/h",
        },
    });

    const viewOptions = buildCustomMetricViewOptions({
        event: buildWillAppearEvent(new FakeStreamDeckAction("custom-unit-render-action"), rawSettings),
        settings,
        target: readCustomMetricTarget(settings),
        metrics: metricReader,
    });

    assert.equal(viewOptions.widgetData.label, "Wind");
    assert.equal(viewOptions.widgetData.unit, "km/h");
    assert.equal(viewOptions.widgetData.displayValue, undefined);
});

test("Custom Metric circle variants compact long source labels before rendering", () => {
    for (const circleVariant of ["full-ring", "gauge"] as const) {
        const rawSettings = writeStoredWidgetSettingsPatch(buildCustomMetricWidgetSettings({
            url: "https://api.example.com/data",
            userIntent: "show custom latency",
            jqTransform: ".",
        }), {
            appearance: {
                view: {
                    selectedView: "circle",
                    circleVariant,
                },
            },
        });
        const settings = resolveInitialActionSettings(rawSettings, "customMetric").resolvedSettings;

        const viewOptions = buildCustomMetricViewOptions({
            event: buildWillAppearEvent(new FakeStreamDeckAction(`custom-circle-${circleVariant}`), rawSettings),
            settings,
            target: readCustomMetricTarget(settings),
            metrics: new CapturingMetricStoreReader({
                current: 211.28,
                sampleTimestampMilliseconds: 1234,
                displayHint: {
                    label: "Aether",
                    unit: MetricUnit.UNSPECIFIED,
                    customUnit: "ms",
                    maximum: 300,
                },
            }),
        });

        assert.equal(viewOptions.widgetData.label, "AETH");
        assert.doesNotThrow(() => composeMetricViewFrame({ viewOptions, renderTarget: "key" }));
    }
});

test("Custom Metric PI sample fetch returns bounded preview through the action boundary", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: "{\"temp\":23.5}",
    });
    const action = new TestCustomMetric(registry, { fetcher });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-fetch-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/weather",
        requestSettings: { timeoutSeconds: 10, retryCount: 2 },
        auth: defaultSourceEditorAuthReference(),
    }));

    await waitForAsyncWork();

    assert.equal(fetcher.urlList[0], "https://api.example.com/weather");
    assert.deepEqual(fetcher.optionsList[0], {
        timeoutSeconds: 10,
        retryCount: 2,
        includeFailureResponsePreview: true,
    });
    const response = action.customMetricSourceEditorResponses[0];
    assert.equal(response?.type, CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE);
    assert.equal(response?.command, "fetchSample");
    assert.equal(response?.requestId, "fetch-1");
    assert.equal(response?.result.ok, true);
    if (response?.result.ok === true) {
        assert.equal(response.result.responseBytes, 13);
        assert.equal(Number.isInteger(response.result.elapsedMilliseconds), true);
        assert.equal(response.result.samplePreview, "{\"temp\":23.5}");
        assert.equal(response.result.isSamplePreviewTruncated, false);
        assert.deepEqual(response.result.promptSample, {
            kind: "jsonSample",
            text: "{\"temp\":23.5}",
        });
    }
});

for (const authCase of [
    {
        name: "Basic",
        credential: create(CustomHttpCredentialSchema, {
            id: "credential-basic",
            nickname: "LHM",
            auth: {
                case: "basic",
                value: {
                    username: "111111",
                    password: "111111",
                },
            },
        }),
        credentialId: "credential-basic",
        requestUrl: "http://127.0.0.1:8085/data.json",
        expectedUrl: "http://127.0.0.1:8085/data.json",
        expectedHeaders: {
            Authorization: "Basic MTExMTExOjExMTExMQ==",
        },
    },
    {
        name: "Bearer",
        credential: create(CustomHttpCredentialSchema, {
            id: "credential-bearer",
            nickname: "Bearer",
            auth: {
                case: "bearer",
                value: { token: "bearer-token" },
            },
        }),
        credentialId: "credential-bearer",
        requestUrl: "https://api.example.com/data",
        expectedUrl: "https://api.example.com/data",
        expectedHeaders: {
            Authorization: "Bearer bearer-token",
        },
    },
    {
        name: "API key header",
        credential: create(CustomHttpCredentialSchema, {
            id: "credential-header",
            nickname: "Header",
            auth: {
                case: "header",
                value: {
                    headerName: "X-API-Key",
                    token: "header-token",
                },
            },
        }),
        credentialId: "credential-header",
        requestUrl: "https://api.example.com/data",
        expectedUrl: "https://api.example.com/data",
        expectedHeaders: {
            "X-API-Key": "header-token",
        },
    },
    {
        name: "API key query",
        credential: create(CustomHttpCredentialSchema, {
            id: "credential-query",
            nickname: "Query",
            auth: {
                case: "query",
                value: {
                    queryParameterName: "api_key",
                    token: "query-token",
                },
            },
        }),
        credentialId: "credential-query",
        requestUrl: "https://api.example.com/data?api_key=old&mode=current",
        expectedUrl: "https://api.example.com/data?api_key=query-token&mode=current",
        expectedHeaders: undefined,
    },
] as const) {
    test(`Custom Metric PI sample fetch applies selected ${authCase.name} credential`, async () => {
        const registry = new CustomHttpDefinitionRegistry();
        const fetcher = new FakeCustomHttpFetcher({
            ok: true,
            responseText: "{\"temp\":23.5}",
        });
        const action = new TestCustomMetric(registry, {
            fetcher,
            credentialSettingsReader: new FakeCustomHttpCredentialSettingsReader(create(StoredGlobalSettingsSchema, {
                customHttpCredentials: [authCase.credential],
            })),
        });
        const streamDeckAction = new FakeStreamDeckAction(`custom-pi-fetch-${authCase.name}-action`);

        action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));
        action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
            type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
            command: "fetchSample",
            requestId: "fetch-1",
            consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
            url: authCase.requestUrl,
            requestSettings: { timeoutSeconds: 5, retryCount: 0 },
            auth: { credentialId: authCase.credentialId, allowPublicHttpCredentials: false },
        }));

        await waitForAsyncWork();

        assert.equal(fetcher.urlList[0], authCase.expectedUrl);
        assert.deepEqual(fetcher.optionsList[0]?.headers, authCase.expectedHeaders);
        assert.equal(action.customMetricSourceEditorResponses[0]?.result.ok, true);
    });
}

test("Custom Metric PI sample fetch redacts echoed credential secrets from preview and prompt sample", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: JSON.stringify({
            links: {
                self: "https://api.example.com/data?api_key=query-token&page=1",
            },
            token: "query-token",
            sensor: {
                Text: "GPU Core",
                Value: "55 °C",
            },
        }, null, 2),
    });
    const action = new TestCustomMetric(registry, {
        fetcher,
        credentialSettingsReader: new FakeCustomHttpCredentialSettingsReader(create(StoredGlobalSettingsSchema, {
            customHttpCredentials: [create(CustomHttpCredentialSchema, {
                id: "credential-query",
                nickname: "Query",
                auth: {
                    case: "query",
                    value: {
                        queryParameterName: "api_key",
                        token: "query-token",
                    },
                },
            })],
        })),
    });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-fetch-redacted-success-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/data?api_key=old&page=1",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: { credentialId: "credential-query", allowPublicHttpCredentials: false },
    }));

    await waitForAsyncWork();

    const fetchResponse = action.customMetricSourceEditorResponses[0];
    assert.equal(fetchResponse?.command, "fetchSample");
    assert.equal(fetchResponse?.result.ok, true);
    if (fetchResponse?.command === "fetchSample" && fetchResponse.result.ok === true) {
        assert.doesNotMatch(fetchResponse.result.samplePreview, /query-token/);
        assert.match(fetchResponse.result.samplePreview, /api_key=\[redacted\]/);
        assert.match(fetchResponse.result.samplePreview, /"token": "REDACTED"/);
        assert.doesNotMatch(JSON.stringify(fetchResponse.result.promptSample), /query-token/);
    }
});

test("Custom Metric PI sample fetch does not guess-redact blocked redirect URLs", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const fetcher = new FakeCustomHttpFetcher({
        ok: false,
        reason: "redirectBlocked",
        detail: "Cross-origin redirect blocked while credentials are attached.",
        blockedRedirect: {
            fromOrigin: "https://api.example.com",
            toOrigin: "https://login.example.net",
            redirectedUrl: "http://127.0.0.1:8092/data.json",
        },
    });
    const action = new TestCustomMetric(registry, {
        fetcher,
        credentialSettingsReader: new FakeCustomHttpCredentialSettingsReader(create(StoredGlobalSettingsSchema, {
            customHttpCredentials: [create(CustomHttpCredentialSchema, {
                id: "credential-header",
                nickname: "Header",
                auth: {
                    case: "header",
                    value: {
                        headerName: "X-API-Key",
                        token: "header-token",
                    },
                },
            })],
        })),
    });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-fetch-redirect-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/data",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: { credentialId: "credential-header", allowPublicHttpCredentials: false },
    }));

    await waitForAsyncWork();

    assert.deepEqual(action.customMetricSourceEditorResponses.at(-1), {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        result: {
            ok: false,
            stage: "redirectBlocked",
            detail: "Cross-origin redirect blocked while credentials are attached.",
            blockedRedirect: {
                fromOrigin: "https://api.example.com",
                toOrigin: "https://login.example.net",
                redirectedUrl: "http://127.0.0.1:8092/data.json",
            },
        },
    });
});

test("Custom Metric PI sample fetch builds a digest for large JSON prompts", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const largeResponseText = JSON.stringify({
        Children: [
            { Text: "Sensor", Value: "Value" },
            { Text: "CPU Package", Value: "44.2 °C", Type: "Temperature" },
            { Text: "Vcore", Value: "2.040 V", Type: "Voltage" },
            { Text: "Download Speed", Value: "0.0 KB/s", Type: "Throughput" },
        ],
        Padding: "x".repeat(4096),
    });
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: largeResponseText,
    });
    const action = new TestCustomMetric(registry, { fetcher });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-fetch-digest-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/sensors",
        requestSettings: { timeoutSeconds: 10, retryCount: 2 },
        auth: defaultSourceEditorAuthReference(),
    }));

    await waitForAsyncWork();

    const response = action.customMetricSourceEditorResponses[0];
    assert.equal(response?.command, "fetchSample");
    assert.equal(response?.result.ok, true);
    if (response?.command === "fetchSample" && response.result.ok === true) {
        const result = response.result;
        assert.equal(result.isSamplePreviewTruncated, true);
        assert.equal(result.promptSample.kind, "jsonDigest");
        if (result.promptSample.kind === "jsonDigest") {
            assert.doesNotThrow(() => JSON.parse(result.promptSample.text));
            assert.match(result.promptSample.arraySummaries.join("\n"), /\$\.Children: 4 items/);
        }
    }
});

test("Custom Metric PI transform test returns exploration output when jq succeeds without a metric", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: "{\"sensors\":[{\"Text\":\"GPU Core\",\"Value\":\"55 °C\"}]}",
    });
    const transformRunner = new FakeCustomHttpTransformRunner({
        ok: true,
        output: [
            { Text: "GPU Core", Value: "55 °C" },
        ],
    });
    const action = new TestCustomMetric(registry, { fetcher, transformRunner });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-exploration-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings({
        url: "https://api.example.com/sensors",
        userIntent: "show GPU temp",
        jqTransform: ".",
    })));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/sensors",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));
    await waitForAsyncWork();

    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "transform-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/sensors",
        jqTransform: "[.. | objects | select(.Text?)]",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));
    await waitForAsyncWork();

    assert.deepEqual(action.customMetricSourceEditorResponses.at(-1), {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "transform-1",
        result: {
            ok: true,
            explorationOutput: JSON.stringify([{ Text: "GPU Core", Value: "55 °C" }], null, 2),
            schemaFailureDetail: "Output must be an object.",
        },
    });
    assert.deepEqual(transformRunner.outputModeList, ["rawStdout"]);
});

test("Custom Metric PI transform test returns multi-output jq as exploration output", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: "{\"sensors\":[{\"Text\":\"GPU Core\",\"Value\":\"55 °C\"},{\"Text\":\"CPU Package\",\"Value\":\"65 °C\"}]}",
    });
    const transformRunner = new FakeCustomHttpTransformRunner({
        ok: true,
        output: "{\"Text\":\"GPU Core\",\"Value\":\"55 °C\"}\n{\"Text\":\"CPU Package\",\"Value\":\"65 °C\"}\n",
    });
    const action = new TestCustomMetric(registry, { fetcher, transformRunner });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-multi-output-exploration-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings({
        url: "https://api.example.com/sensors",
        userIntent: "show GPU temp",
        jqTransform: ".",
    })));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/sensors",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));
    await waitForAsyncWork();

    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "transform-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/sensors",
        jqTransform: ".. | objects | select(.Text?)",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));
    await waitForAsyncWork();

    assert.deepEqual(action.customMetricSourceEditorResponses.at(-1), {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "transform-1",
        result: {
            ok: true,
            explorationOutput: "{\"Text\":\"GPU Core\",\"Value\":\"55 °C\"}\n{\"Text\":\"CPU Package\",\"Value\":\"65 °C\"}",
            schemaFailureDetail: "jq emitted exploration output instead of one final metric JSON value.",
        },
    });
    assert.deepEqual(transformRunner.outputModeList, ["rawStdout"]);
});

test("Custom Metric PI sample fetch includes HTTP failure response previews", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const fetcher = new FakeCustomHttpFetcher({
        ok: false,
        reason: "httpFailure",
        detail: "HTTP status 429.",
        responseTextPreview: "{\"reason\":\"Daily API request limit exceeded. Please try again tomorrow.\",\"token\":\"abc123\",\"error\":true}",
        isResponseTextPreviewTruncated: false,
    });
    const action = new TestCustomMetric(registry, { fetcher });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-fetch-error-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/weather",
        requestSettings: { timeoutSeconds: 10, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));

    await waitForAsyncWork();

    assert.deepEqual(action.customMetricSourceEditorResponses[0], {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        result: {
            ok: false,
            stage: "httpFailure",
            detail: [
                "HTTP status 429.",
                "",
                "Response body preview:",
                "{\"reason\":\"Daily API request limit exceeded. Please try again tomorrow.\",\"token\":\"REDACTED\",\"error\":true}",
            ].join("\n"),
        },
    });
});

test("Custom Metric PI sample fetch caps HTTP failure response previews", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const responseTextPreview = "x".repeat(4097);
    const fetcher = new FakeCustomHttpFetcher({
        ok: false,
        reason: "httpFailure",
        detail: "HTTP status 500.",
        responseTextPreview,
        isResponseTextPreviewTruncated: false,
    });
    const action = new TestCustomMetric(registry, { fetcher });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-fetch-large-error-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings()));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/weather",
        requestSettings: { timeoutSeconds: 10, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));

    await waitForAsyncWork();

    const response = action.customMetricSourceEditorResponses[0];
    assert.equal(response?.result.ok, false);
    if (response?.result.ok === false) {
        assert.match(response.result.detail, /^HTTP status 500\.\n\nResponse body preview \(truncated\):\n/);
        assert.equal(response.result.detail.endsWith("..."), true);
        assert.equal(response.result.detail.includes(responseTextPreview), false);
    }
});

test("Custom Metric PI transform test uses cached sample without storing it in settings", async () => {
    const registry = new CustomHttpDefinitionRegistry();
    const fetcher = new FakeCustomHttpFetcher({
        ok: true,
        responseText: "{\"temp\":23.5}",
    });
    const transformRunner = new FakeCustomHttpTransformRunner({
        ok: true,
        output: {
            metric: {
                label: "TEMP",
                value: 23.5,
                unit: "celsius",
                maximum: 100,
            },
        },
    });
    const action = new TestCustomMetric(registry, { fetcher, transformRunner });
    const streamDeckAction = new FakeStreamDeckAction("custom-pi-transform-action");

    action.onWillAppear(buildWillAppearEvent(streamDeckAction, buildCustomMetricWidgetSettings({
        url: "https://api.example.com/weather",
        userIntent: "show temp",
        jqTransform: ".",
    })));
    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: "fetch-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/weather",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));
    await waitForAsyncWork();

    action.onSendToPlugin(buildSendToPluginEvent(streamDeckAction, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "transform-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        url: "https://api.example.com/weather",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\", maximum: 100 } }",
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
        auth: defaultSourceEditorAuthReference(),
    }));
    await waitForAsyncWork();

    assert.deepEqual(transformRunner.inputJsonList[0], { temp: 23.5 });
    assert.equal(
        transformRunner.jqTransformList[0],
        "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\", maximum: 100 } }",
    );
    assert.deepEqual(action.customMetricSourceEditorResponses.at(-1), {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: "transform-1",
        result: {
            ok: true,
            metric: {
                label: "TEMP",
                value: 23.5,
                unitText: "C",
                maximum: 100,
            },
        },
    });
});

class TestCustomMetric extends CustomMetric {
    readonly bindings: FakeMetricCollectionBinding[] = [];
    readonly customMetricSourceEditorResponses: CustomHttpSourceEditorResponse[];
    metricsUpdateCallCount = 0;

    constructor(
        definitionRegistry: CustomHttpDefinitionRegistry,
        options: {
            readonly fetcher?: CustomHttpFetcher;
            readonly transformRunner?: CustomHttpTransformRunner;
            readonly credentialSettingsReader?: CustomHttpCredentialSettingsReader;
        } = {},
    ) {
        const sourceEditorResponses: CustomHttpSourceEditorResponse[] = [];
        super({
            customHttpDefinitionRegistry: definitionRegistry,
            ...options,
            sendCustomHttpSourceEditorResponse: (_event, response) => {
                sourceEditorResponses.push(response);
                return Promise.resolve();
            },
        });
        this.customMetricSourceEditorResponses = sourceEditorResponses;
    }

    protected override createMetricCollectionBinding(): MetricCollectionBinding {
        const binding = new FakeMetricCollectionBinding();
        this.bindings.push(binding);
        return binding;
    }

    protected override onMetricsUpdate(): void {
        this.metricsUpdateCallCount += 1;
    }

    protected override updateRuntimeCache(): Promise<void> {
        return Promise.resolve();
    }

}

class FakeCustomHttpCredentialSettingsReader implements CustomHttpCredentialSettingsReader {
    constructor(private readonly settings: StoredGlobalSettings) {}

    readStoredGlobalSettings(): StoredGlobalSettings {
        return this.settings;
    }
}

class FakeMetricCollectionBinding implements MetricCollectionBinding {
    readonly refreshOptionsList: Parameters<MetricCollectionBinding["refresh"]>[0][] = [];
    disposed = false;

    refresh(options: Parameters<MetricCollectionBinding["refresh"]>[0]): void {
        this.refreshOptionsList.push(options);
    }

    dispose(): void {
        this.disposed = true;
    }
}

class CapturingMetricStoreReader implements MetricStoreReader {
    constructor(private readonly options: {
        readonly current?: number;
        readonly sampleTimestampMilliseconds?: number;
        readonly unavailableMetric?: boolean;
        readonly displayHint?: MetricValueDisplayHint;
    }) {}

    getWidgetData(metricKey: string, label: string, unit: string, maxValue?: number): WidgetData {
        return this.getWidgetDataWithAttribution(metricKey, label, unit, maxValue).widgetData;
    }

    getWidgetDataWithAttribution(
        metricKey: string,
        label: string,
        unit: string,
        maxValue = 100,
    ): MetricWidgetDataReadResult {
        const current = this.options.current ?? 0;
        const widgetData: WidgetData = {
            current,
            progress: Math.min(Math.max(current / maxValue, 0), 1),
            history: this.options.sampleTimestampMilliseconds === undefined ? [] : [current],
            label,
            unit,
            sampleTimestampMilliseconds: this.options.sampleTimestampMilliseconds,
        };

        return {
            widgetData,
            selectedSourceId: this.options.sampleTimestampMilliseconds === undefined
                ? undefined
                : "custom-http",
            ...(this.options.sampleTimestampMilliseconds === undefined
                ? {}
                : {
                    valueAttribution: {
                        metricId: metricKey,
                        valueFreshness: "fresh",
                        ...(this.options.displayHint === undefined ? {} : { displayHint: this.options.displayHint }),
                    },
                }),
            ...(this.options.unavailableMetric === true
                ? {
                    unavailableMetric: {
                        metricId: metricKey,
                        reason: "unknown",
                    },
                }
                : {}),
        };
    }

    getTextValue(): string | undefined {
        return undefined;
    }
}

class FakeCustomHttpFetcher implements CustomHttpFetcher {
    readonly urlList: string[] = [];
    readonly optionsList: CustomHttpFetchOptions[] = [];

    constructor(private readonly result: CustomHttpFetchResult) {}

    fetchJson(url: string, options?: CustomHttpFetchOptions): Promise<CustomHttpFetchResult> {
        this.urlList.push(url);
        this.optionsList.push(options ?? {});
        return Promise.resolve(this.result);
    }
}

function defaultSourceEditorAuthReference() {
    return {
        credentialId: undefined,
        allowPublicHttpCredentials: false,
    };
}

class FakeCustomHttpTransformRunner implements CustomHttpTransformRunner {
    readonly inputJsonList: unknown[] = [];
    readonly jqTransformList: string[] = [];
    readonly outputModeList: (CustomHttpTransformOutputMode | undefined)[] = [];

    constructor(private readonly result: CustomHttpTransformResult) {}

    runTransform(options: {
        readonly inputJson: unknown;
        readonly jqTransform: string;
        readonly outputMode?: CustomHttpTransformOutputMode;
    }): Promise<CustomHttpTransformResult> {
        this.inputJsonList.push(options.inputJson);
        this.jqTransformList.push(options.jqTransform);
        this.outputModeList.push(options.outputMode);
        return Promise.resolve(this.result);
    }

    dispose(): void {
        return;
    }
}

class FakeStreamDeckAction {
    constructor(readonly id: string) {}

    readonly device = { id: "device-1" };

    isDial(): boolean {
        return false;
    }

    isKey(): boolean {
        return true;
    }

    setSettings(): Promise<void> {
        return Promise.resolve();
    }
}

function buildCustomMetricWidgetSettings(patch: {
    readonly url?: string;
    readonly userIntent?: string;
    readonly jqTransform?: string;
    readonly iconId?: string;
    readonly timeoutSeconds?: number;
    readonly retryCount?: number;
} = {}): unknown {
    const settings = resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings;
    return writeStoredWidgetSettingsPatch(settings, {
        customMetric: patch,
    });
}

function readCustomMetricTarget(settings: ReturnType<typeof resolveInitialActionSettings>["resolvedSettings"]) {
    const widget = settings.widget;
    if (widget.widgetKind !== "singleMetric" || widget.slot.metric.target.domain !== "customMetric") {
        throw new Error("Expected Custom Metric settings.");
    }

    return widget.slot.metric.target;
}

function buildWillAppearEvent(action: FakeStreamDeckAction, settings: unknown): WillAppearEvent {
    return {
        action,
        payload: {
            settings,
        },
    } as unknown as WillAppearEvent;
}

function buildDidReceiveSettingsEvent(action: FakeStreamDeckAction, settings: unknown): DidReceiveSettingsEvent {
    return {
        action,
        payload: {
            settings,
        },
    } as unknown as DidReceiveSettingsEvent;
}

function buildSendToPluginEvent(action: FakeStreamDeckAction, payload: unknown): SendToPluginEvent<never, Record<string, never>> {
    return {
        action,
        payload,
    } as unknown as SendToPluginEvent<never, Record<string, never>>;
}

function buildWillDisappearEvent(action: FakeStreamDeckAction): WillDisappearEvent {
    return { action } as unknown as WillDisappearEvent;
}

async function waitForAsyncWork(): Promise<void> {
    await new Promise(resolve => setImmediate(resolve));
}
