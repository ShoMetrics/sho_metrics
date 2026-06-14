import assert from "node:assert/strict";
import { test } from "node:test";
import type { SendToPluginEvent } from "@elgato/streamdeck";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import {
    buildDenseCustomHttpConsumerSlug,
    buildStackedCustomHttpConsumerSlug,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../../runtime/sources/custom-http/custom-http-metric-key";
import {
    CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
    readCustomHttpSourceEditorRequest,
    type CustomHttpSourceEditorRequest,
    type CustomHttpSourceEditorResponse,
} from "../../runtime/sources/custom-http/custom-http-source-editor-messages";
import {
    type CustomHttpFetcher,
    type CustomHttpFetchOptions,
    type CustomHttpFetchResult,
} from "../../runtime/sources/custom-http/custom-http-fetcher";
import type {
    CustomHttpTransformResult,
    CustomHttpTransformRunner,
} from "../../runtime/sources/custom-http/custom-http-transform-worker-pool";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/patch/widget-settings-patch";
import { STREAM_DECK_ACTION_UUID_BY_KIND, type ActionKind } from "../../shared/stream-deck-actions";
import { CustomHttpSourceEditorRequestHandler } from "../../actions/custom-metric/source-editor-request-handler";
import { StreamDeckClientProvider } from "../stream-deck/stream-deck-client-context";
import {
    readPropertyInspectorScrollTopForTest,
    setPropertyInspectorScrollTopForTest,
} from "../testing/scroll-position";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import {
    readTestSettingsRecord,
    TestPropertyInspectorClient,
    type SentStreamDeckMessage,
} from "../testing/test-property-inspector-client";
import { WidgetSettingsTab } from "./WidgetSettingsTab";

const CONTRACT_URL = "https://api.example.com/weather";
const CONTRACT_SECONDARY_URL = "https://api.example.com/humidity";
const CONTRACT_UPDATED_URL = "https://api.example.com/updated-weather";
const CONTRACT_JQ_TRANSFORM = "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\", maximum: 100 } }";
const CONTRACT_REQUEST_SETTINGS = {
    timeoutSeconds: 30,
    retryCount: 3,
} as const;

interface CustomHttpSourceEditorContractCase {
    readonly name: string;
    readonly actionKind: ActionKind;
    readonly actionUuid: string;
    readonly expectedConsumerSlug: string;
    buildSettings(): InspectorTestSettings;
    openSourceEditor(user: ReturnType<typeof userEvent.setup>): Promise<void>;
    readCustomMetricUrls(settings: InspectorTestSettings): readonly string[];
}

const customHttpSourceEditorContractCases = [
    {
        name: "single",
        actionKind: "customMetric",
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
        expectedConsumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        buildSettings: () => buildSingleCustomMetricSettings(),
        openSourceEditor: async (user) => {
            await user.click(screen.getByRole("button", { name: "Edit" }));
        },
        readCustomMetricUrls: readCustomMetricUrls,
    },
    {
        name: "dense",
        actionKind: "denseMultiMetric",
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.denseMultiMetric,
        expectedConsumerSlug: buildDenseCustomHttpConsumerSlug("slot-1"),
        buildSettings: () => buildDenseCustomMetricSettings(),
        openSourceEditor: async (user) => {
            await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
        },
        readCustomMetricUrls: readCustomMetricUrls,
    },
    {
        name: "stacked",
        actionKind: "stackedMetric",
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.stackedMetric,
        expectedConsumerSlug: buildStackedCustomHttpConsumerSlug("slot-1"),
        buildSettings: () => buildStackedCustomMetricSettings(),
        openSourceEditor: async (user) => {
            await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
            await screen.findByRole("heading", { name: "Editing Metric #1" });
            await user.click(screen.getByRole("button", { name: "Edit" }));
        },
        readCustomMetricUrls: readCustomMetricUrls,
    },
] as const satisfies readonly CustomHttpSourceEditorContractCase[];

for (const contractCase of customHttpSourceEditorContractCases) {
    test(`Custom HTTP source editor contract: ${contractCase.name}`, async () => {
        const user = userEvent.setup();
        const client = new TestPropertyInspectorClient({
            actionUuid: contractCase.actionUuid,
        });
        let latestSettings = contractCase.buildSettings();

        render(<ContractSettingsHarness
            actionKind={contractCase.actionKind}
            client={client}
            settings={latestSettings}
            onSettingsChange={(settings) => {
                latestSettings = settings;
            }}
        />);

        setPropertyInspectorScrollTopForTest(420);
        await contractCase.openSourceEditor(user);

        await screen.findByRole("heading", { name: "HTTP Source" });
        await waitFor(() => {
            assert.equal(readPropertyInspectorScrollTopForTest(), 0);
        });
        assert.equal(screen.queryByRole("button", { name: "Reset Widget Settings" }), null);
        assert.match(
            screen.getByText(/Worst-case request time is about/).textContent ?? "",
            /1s polling frequency/,
        );
        await replaceTextInputValue(
            user,
            screen.getByRole("textbox", { name: /^HTTP URL:/ }) as HTMLInputElement,
            CONTRACT_UPDATED_URL,
        );
        await user.tab();
        assert.deepEqual(contractCase.readCustomMetricUrls(latestSettings), [
            CONTRACT_UPDATED_URL,
            ...(
                contractCase.name === "single"
                    ? []
                    : [CONTRACT_SECONDARY_URL]
            ),
        ]);

        await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

        const fetchRequest = readLastCustomHttpSourceEditorRequest(client.sentMessages);
        assert.equal(fetchRequest.command, "fetchSample");
        assert.equal(fetchRequest.consumerSlug, contractCase.expectedConsumerSlug);
        assert.equal(fetchRequest.url, CONTRACT_UPDATED_URL);
        assert.deepEqual(fetchRequest.requestSettings, CONTRACT_REQUEST_SETTINGS);

        dispatchCustomHttpResponse(client, {
            type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
            command: "fetchSample",
            requestId: fetchRequest.requestId,
            result: {
                ok: true,
                responseBytes: 13,
                elapsedMilliseconds: 42,
                samplePreview: "{\"temp\":23.5}",
                isSamplePreviewTruncated: false,
                promptSample: {
                    kind: "jsonSample",
                    text: "{\"temp\":23.5}",
                },
            },
        });
        await screen.findByText(/Sample fetched/);

        await user.click(screen.getByRole("button", { name: "Test Transform" }));

        const transformRequest = readLastCustomHttpSourceEditorRequest(client.sentMessages);
        assert.equal(transformRequest.command, "testTransform");
        assert.equal(transformRequest.consumerSlug, contractCase.expectedConsumerSlug);
        assert.equal(transformRequest.url, CONTRACT_UPDATED_URL);
        assert.deepEqual(transformRequest.requestSettings, CONTRACT_REQUEST_SETTINGS);
        assert.equal(transformRequest.jqTransform, CONTRACT_JQ_TRANSFORM);
    });
}

test("Custom HTTP source editor cache isolates samples by consumer slug", async () => {
    const responses: CustomHttpSourceEditorResponse[] = [];
    const fetcher = new FakeCustomHttpFetcher(new Map([
        ["https://api.example.com/a", { ok: true, responseText: "{\"temp\":1}" }],
        ["https://api.example.com/b", { ok: true, responseText: "{\"temp\":2}" }],
    ]));
    const transformRunner = new FakeCustomHttpTransformRunner();
    const handler = new CustomHttpSourceEditorRequestHandler({
        fetcher,
        transformRunner,
        sendResponse: async (_event, response) => {
            responses.push(response);
        },
    });

    handler.handle(buildSendToPluginEvent(buildFetchSampleRequest("dense-row-a", "https://api.example.com/a")));
    await waitFor(() => assert.equal(responses.length, 1));
    handler.handle(buildSendToPluginEvent(buildFetchSampleRequest("dense-row-b", "https://api.example.com/b")));
    await waitFor(() => assert.equal(responses.length, 2));

    handler.handle(buildSendToPluginEvent(buildTransformRequest("dense-row-a", "https://api.example.com/a")));
    await waitFor(() => assert.equal(responses.length, 3));
    handler.handle(buildSendToPluginEvent(buildTransformRequest("dense-row-b", "https://api.example.com/b")));
    await waitFor(() => assert.equal(responses.length, 4));

    assert.deepEqual(transformRunner.inputJsonList, [
        { temp: 1 },
        { temp: 2 },
    ]);
});

function ContractSettingsHarness({
    actionKind,
    client,
    settings: initialSettings,
    onSettingsChange,
}: {
    readonly actionKind: ActionKind;
    readonly client: TestPropertyInspectorClient;
    readonly settings: InspectorTestSettings;
    readonly onSettingsChange: (settings: InspectorTestSettings) => void;
}): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(initialSettings);

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind,
                    isWindows: true,
                    settings,
                })}
                isGlobalViewOverrideEnabled={false}
                isGlobalThemeOverrideEnabled={false}
                isGlobalTransparentSurfaceOverrideEnabled={false}
                isGlobalPaintOverrideEnabled={false}
                colorCompensationProfile={DEFAULT_COLOR_COMPENSATION_PROFILE}
                onSettingsPatch={(patch) => {
                    setSettings((currentSettings: InspectorTestSettings) => {
                        const nextSettings = writeStoredWidgetSettingsPatch(currentSettings, patch);
                        onSettingsChange(nextSettings);
                        return nextSettings;
                    });
                }}
                onResetWidgetSettings={() => undefined}
                onOpenColorCompensation={() => undefined}
            />
        </StreamDeckClientProvider>
    );
}

function buildSingleCustomMetricSettings(): InspectorTestSettings {
    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings,
        {
            preferences: { pollingFrequencySeconds: 1 },
            customMetric: buildCustomMetricPatch(CONTRACT_URL),
        },
    ));
}

function buildDenseCustomMetricSettings(): InspectorTestSettings {
    const rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "denseMultiMetric", {
        createSlotId: createDenseSlotIdForTest(),
    }).rawSettings;
    const firstSlotSettings = writeStoredWidgetSettingsPatch(rawSettings, {
        preferences: { pollingFrequencySeconds: 1 },
        dense: {
            updateSlot: {
                slotId: "slot-1",
                target: { domain: "customMetric" },
                customMetric: buildCustomMetricPatch(CONTRACT_URL),
            },
        },
    }, {
        createSlotId: createDenseSlotIdForTest(),
    });

    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(firstSlotSettings, {
        dense: {
            updateSlot: {
                slotId: "slot-2",
                target: { domain: "customMetric" },
                customMetric: buildCustomMetricPatch(CONTRACT_SECONDARY_URL),
            },
        },
    }, {
        createSlotId: createDenseSlotIdForTest(),
    }));
}

function buildStackedCustomMetricSettings(): InspectorTestSettings {
    const rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
        createSlotId: createStackedSlotIdForTest(),
    }).rawSettings;
    const firstSlotSettings = writeStoredWidgetSettingsPatch(rawSettings, {
        preferences: { pollingFrequencySeconds: 1 },
        stacked: {
            updateSlot: {
                slotId: "slot-1",
                metricDomain: "customMetric",
                singleMetric: {
                    customMetric: buildCustomMetricPatch(CONTRACT_URL),
                },
            },
        },
    }, {
        createSlotId: createStackedSlotIdForTest(),
    });

    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(firstSlotSettings, {
        stacked: {
            updateSlot: {
                slotId: "slot-2",
                metricDomain: "customMetric",
                singleMetric: {
                    customMetric: buildCustomMetricPatch(CONTRACT_SECONDARY_URL),
                },
            },
        },
    }, {
        createSlotId: createStackedSlotIdForTest(),
    }));
}

function buildCustomMetricPatch(url: string): NonNullable<StoredWidgetSettingsPatch["customMetric"]> {
    return {
        url,
        userIntent: "Display temperature",
        jqTransform: CONTRACT_JQ_TRANSFORM,
        timeoutSeconds: CONTRACT_REQUEST_SETTINGS.timeoutSeconds,
        retryCount: CONTRACT_REQUEST_SETTINGS.retryCount,
    };
}

async function replaceTextInputValue(
    user: ReturnType<typeof userEvent.setup>,
    input: HTMLInputElement,
    value: string,
): Promise<void> {
    await user.clear(input);
    await user.type(input, value);
}

function readCustomMetricUrls(settings: InspectorTestSettings): readonly string[] {
    const urls: string[] = [];
    collectCustomMetricUrls(settings, urls);
    return urls;
}

function collectCustomMetricUrls(value: unknown, urls: string[]): void {
    if (typeof value === "string") {
        if (value.startsWith("https://api.example.com/")) {
            urls.push(value);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectCustomMetricUrls(item, urls);
        }
        return;
    }

    if (value === null || typeof value !== "object") {
        return;
    }

    for (const item of Object.values(value)) {
        collectCustomMetricUrls(item, urls);
    }
}

function createDenseSlotIdForTest(): () => string {
    const slotIds = ["slot-1", "slot-2"];

    return () => slotIds.shift() ?? "unexpected-slot";
}

function createStackedSlotIdForTest(): () => string {
    const slotIds = ["slot-1", "slot-2", "slot-3"];

    return () => slotIds.shift() ?? "unexpected-slot";
}

function readLastCustomHttpSourceEditorRequest(
    messages: readonly SentStreamDeckMessage[],
): CustomHttpSourceEditorRequest {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.event !== "sendToPlugin") {
            continue;
        }

        const request = readCustomHttpSourceEditorRequest(message.payload);
        if (request !== undefined) {
            return request;
        }
    }

    throw new Error("Expected a Custom HTTP source editor request.");
}

function dispatchCustomHttpResponse(
    client: TestPropertyInspectorClient,
    response: CustomHttpSourceEditorResponse,
): void {
    act(() => {
        client.dispatchSendToPropertyInspector(response);
    });
}

function buildFetchSampleRequest(consumerSlug: string, url: string): CustomHttpSourceEditorRequest {
    return {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: `fetch-${consumerSlug}`,
        consumerSlug,
        url,
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
    };
}

function buildTransformRequest(consumerSlug: string, url: string): CustomHttpSourceEditorRequest {
    return {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: `transform-${consumerSlug}`,
        consumerSlug,
        url,
        jqTransform: CONTRACT_JQ_TRANSFORM,
        requestSettings: { timeoutSeconds: 5, retryCount: 0 },
    };
}

function buildSendToPluginEvent(
    payload: CustomHttpSourceEditorRequest,
): SendToPluginEvent<never, Record<string, never>> {
    return {
        action: {
            id: "action-1",
        },
        payload,
    } as unknown as SendToPluginEvent<never, Record<string, never>>;
}

class FakeCustomHttpFetcher implements CustomHttpFetcher {
    constructor(private readonly resultByUrl: ReadonlyMap<string, CustomHttpFetchResult>) {}

    fetchJson(url: string, options?: CustomHttpFetchOptions): Promise<CustomHttpFetchResult> {
        void options;
        const result = this.resultByUrl.get(url);
        if (result === undefined) {
            return Promise.resolve({
                ok: false,
                reason: "networkFailure",
                detail: `Unexpected URL: ${url}`,
            });
        }

        return Promise.resolve(result);
    }
}

class FakeCustomHttpTransformRunner implements CustomHttpTransformRunner {
    readonly inputJsonList: unknown[] = [];

    dispose(): Promise<void> {
        return Promise.resolve();
    }

    runTransform(input: {
        readonly inputJson: unknown;
        readonly jqTransform: string;
    }): Promise<CustomHttpTransformResult> {
        this.inputJsonList.push(input.inputJson);
        return Promise.resolve({
            ok: true,
            output: {
                metric: {
                    label: "TEMP",
                    value: 23.5,
                    unit: "celsius",
                },
            },
        });
    }
}
