import assert from "node:assert/strict";
import { test } from "vitest";
import type { SendToPluginEvent } from "@elgato/streamdeck";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../../color-compensation/types";
import {
    buildDenseCustomHttpConsumerSlug,
    buildStackedCustomHttpConsumerSlug,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "../../../runtime/sources/custom-http/custom-http-metric-key";
import {
    CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
    readCustomHttpSourceEditorRequest,
    type CustomHttpSourceEditorRequest,
    type CustomHttpSourceEditorResponse,
} from "../../../runtime/sources/custom-http/custom-http-source-editor-messages";
import {
    type CustomHttpFetcher,
    type CustomHttpFetchOptions,
    type CustomHttpFetchResult,
} from "../../../runtime/sources/custom-http/custom-http-fetcher";
import type {
    CustomHttpTransformResult,
    CustomHttpTransformRunner,
} from "../../../runtime/sources/custom-http/custom-http-transform-worker-pool";
import { resolveQuickStartStoredWidgetSettings } from "../../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../../settings/storage/patch/widget-settings-patch";
import {
    deleteStoredCustomHttpCredential,
    upsertStoredCustomHttpCredential,
} from "../../../settings/storage/global-settings-patch";
import { readStoredGlobalSettings as readStoredGlobalSettingsFromCodec } from "../../../settings/storage/codec";
import { STREAM_DECK_ACTION_UUID_BY_KIND, type ActionKind } from "../../../shared/stream-deck-actions";
import { CustomHttpSourceEditorRequestHandler } from "../../../actions/custom-metric/source-editor-request-handler";
import { StreamDeckClientProvider } from "../../stream-deck/stream-deck-client-context";
import {
    readPropertyInspectorScrollTopForTest,
    setPropertyInspectorScrollTopForTest,
} from "../../testing/scroll-position";
import { buildVisibilityContext, type InspectorTestSettings } from "../../testing/test-context";
import {
    readTestSettingsRecord,
    TestPropertyInspectorClient,
    type SentStreamDeckMessage,
} from "../../testing/test-property-inspector-client";
import { WidgetSettingsTab } from "../tabs/WidgetSettingsTab";

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
    buildSettings(options?: {
        readonly url?: string | undefined;
        readonly credentialId?: string | undefined;
        readonly allowPublicHttpCredentials?: boolean | undefined;
    }): InspectorTestSettings;
    openSourceEditor(user: ReturnType<typeof userEvent.setup>): Promise<void>;
    readCustomMetricUrls(settings: InspectorTestSettings): readonly string[];
}

const customHttpSourceEditorContractCases = [
    {
        name: "single",
        actionKind: "customMetric",
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
        expectedConsumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
        buildSettings: (options = {}) => buildSingleCustomMetricSettings(
            options?.url,
            options?.credentialId,
            options?.allowPublicHttpCredentials,
        ),
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
        buildSettings: (options = {}) => buildDenseCustomMetricSettings(
            options?.url,
            options?.credentialId,
            options?.allowPublicHttpCredentials,
        ),
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
        buildSettings: (options = {}) => buildStackedCustomMetricSettings(
            options?.url,
            options?.credentialId,
            options?.allowPublicHttpCredentials,
        ),
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
        await user.click(screen.getByRole("link", { name: "Learn more about custom HTTP metrics." }));
        assert.deepEqual(client.sentMessages.at(-1), {
            event: "openUrl",
            payload: {
                url: "https://shometrics.github.io/faq/custom-http-metric/",
            },
        });
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
        assert.deepEqual(fetchRequest.auth, {
            credentialId: undefined,
            allowPublicHttpCredentials: false,
        });

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
        assert.deepEqual(transformRequest.auth, {
            credentialId: undefined,
            allowPublicHttpCredentials: false,
        });
        assert.equal(transformRequest.jqTransform, CONTRACT_JQ_TRANSFORM);
    });
}

for (const contractCase of customHttpSourceEditorContractCases) {
    test(`Custom HTTP source editor auth contract: ${contractCase.name} creates credential and sends its reference`, async () => {
        const user = userEvent.setup();
        const client = new TestPropertyInspectorClient({
            actionUuid: contractCase.actionUuid,
        });
        let latestWidgetSettings = contractCase.buildSettings();
        let latestGlobalSettings: InspectorTestSettings = {};

        render(<ContractSettingsHarness
            actionKind={contractCase.actionKind}
            client={client}
            settings={latestWidgetSettings}
            globalSettings={latestGlobalSettings}
            onSettingsChange={(settings) => {
                latestWidgetSettings = settings;
            }}
            onGlobalSettingsChange={(settings) => {
                latestGlobalSettings = settings;
            }}
        />);

        await contractCase.openSourceEditor(user);
        await user.click(screen.getByRole("button", { name: "Add New Credential" }));
        await replaceTextInputValue(user, screen.getByRole("textbox", { name: /^Nickname:/ }) as HTMLInputElement, "Weather");
        await selectComboboxOption(user, /^Type:/, "Bearer");
        await replaceTextInputValue(user, screen.getByLabelText(/^Token:/) as HTMLInputElement, "bearer-token");
        await user.click(screen.getByRole("button", { name: "Save Credential" }));
        await waitFor(() => assert.equal(screen.queryByRole("textbox", { name: /^Nickname:/ }), null));

        const credentials = readStoredGlobalSettingsFromCodec(latestGlobalSettings).settings.customHttpCredentials;
        assert.equal(credentials.length, 1);
        const credential = credentials[0];
        assert.notEqual(credential, undefined);
        assert.equal(credential?.nickname, "Weather");
        assert.equal(credential?.auth.case, "bearer");
        if (credential?.auth.case === "bearer") {
            assert.equal(credential.auth.value.token, "bearer-token");
        }

        const credentialId = credential?.id;
        assert.equal(typeof credentialId, "string");
        assert.equal(JSON.stringify(latestWidgetSettings).includes(credentialId ?? "missing-credential-id"), true);
        assert.doesNotMatch(JSON.stringify(latestWidgetSettings), /bearer-token/);

        await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

        const fetchRequest = readLastCustomHttpSourceEditorRequest(client.sentMessages);
        assert.equal(fetchRequest.command, "fetchSample");
        assert.equal(fetchRequest.consumerSlug, contractCase.expectedConsumerSlug);
        assert.equal(fetchRequest.auth.credentialId, credentialId);
        assert.equal(fetchRequest.auth.allowPublicHttpCredentials, false);

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
        assert.equal(transformRequest.auth.credentialId, credentialId);
        assert.equal(transformRequest.auth.allowPublicHttpCredentials, false);
    });
}

for (const contractCase of customHttpSourceEditorContractCases) {
    test(`Custom HTTP source editor auth contract: ${contractCase.name} gates public HTTP credentials`, async () => {
        const user = userEvent.setup();
        const client = new TestPropertyInspectorClient({
            actionUuid: contractCase.actionUuid,
        });
        const publicHttpUrl = "http://api.example.com/weather";
        let latestWidgetSettings = contractCase.buildSettings({
            url: publicHttpUrl,
            credentialId: "credential-1",
        });
        const latestGlobalSettings: InspectorTestSettings = upsertStoredCustomHttpCredential(undefined, {
            id: "credential-1",
            nickname: "Weather",
            authKind: "bearer",
            token: "token",
        });

        render(<ContractSettingsHarness
            actionKind={contractCase.actionKind}
            client={client}
            settings={latestWidgetSettings}
            globalSettings={latestGlobalSettings}
            onSettingsChange={(settings) => {
                latestWidgetSettings = settings;
            }}
        />);

        await contractCase.openSourceEditor(user);

        const fetchButton = screen.getByRole("button", { name: "Fetch Sample" });
        assert.equal(fetchButton.hasAttribute("disabled"), true);
        assert.equal(
            screen.getByText("Authentication over public HTTP requires confirmation in the Authentication section.").textContent,
            "Authentication over public HTTP requires confirmation in the Authentication section.",
        );

        const consentCheckbox = screen.getByRole("checkbox", {
            name: "Allow credentials over public HTTP",
        }) as HTMLInputElement;
        assert.equal(consentCheckbox.checked, false);
        await user.click(consentCheckbox);

        assert.equal(consentCheckbox.checked, true);
        assert.equal(fetchButton.hasAttribute("disabled"), false);
        assert.match(JSON.stringify(latestWidgetSettings), /allowPublicHttpCredentials/);

        await user.click(fetchButton);
        const fetchRequest = readLastCustomHttpSourceEditorRequest(client.sentMessages);
        assert.equal(fetchRequest.consumerSlug, contractCase.expectedConsumerSlug);
        assert.equal(fetchRequest.url, publicHttpUrl);
        assert.deepEqual(fetchRequest.auth, {
            credentialId: "credential-1",
            allowPublicHttpCredentials: true,
        });
    });
}

for (const contractCase of customHttpSourceEditorContractCases) {
    test(`Custom HTTP source editor auth contract: ${contractCase.name} shows missing credential state`, async () => {
        const user = userEvent.setup();
        const client = new TestPropertyInspectorClient({
            actionUuid: contractCase.actionUuid,
        });

        render(<ContractSettingsHarness
            actionKind={contractCase.actionKind}
            client={client}
            settings={contractCase.buildSettings({ credentialId: "missing-credential" })}
            onSettingsChange={() => undefined}
        />);

        await contractCase.openSourceEditor(user);

        assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), true);
        assert.equal(
            screen.getByText("The selected credential is missing. Select or create a credential in the Authentication section.").textContent,
            "The selected credential is missing. Select or create a credential in the Authentication section.",
        );
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

test("Custom HTTP source editor creates query credential in global settings and stores only reference on widget", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });
    let latestWidgetSettings = buildSingleCustomMetricSettings("https://api.example.com/weather?api_key=old");
    let latestGlobalSettings: InspectorTestSettings = {};

    render(<ContractSettingsHarness
        actionKind="customMetric"
        client={client}
        settings={latestWidgetSettings}
        globalSettings={latestGlobalSettings}
        onSettingsChange={(settings) => {
            latestWidgetSettings = settings;
        }}
        onGlobalSettingsChange={(settings) => {
            latestGlobalSettings = settings;
        }}
    />);

    await customHttpSourceEditorContractCases[0].openSourceEditor(user);
    assert.equal(screen.queryByRole("textbox", { name: /^Nickname:/ }), null);
    await user.click(screen.getByRole("button", { name: "Add New Credential" }));
    assert.match(
        screen.getByRole("combobox", { name: /^Credential:/ }).textContent ?? "",
        /Editing New Credential/,
    );
    await replaceTextInputValue(user, screen.getByRole("textbox", { name: /^Nickname:/ }) as HTMLInputElement, "Weather");
    await selectComboboxOption(user, /^Type:/, "API Key Query");
    await replaceTextInputValue(user, screen.getByRole("textbox", { name: /^Query Name:/ }) as HTMLInputElement, "api_key");
    const tokenInput = screen.getByLabelText(/^Token:/) as HTMLInputElement;
    await replaceTextInputValue(user, tokenInput, "secret-token");
    assert.equal(tokenInput.type, "password");
    const showSecretButton = screen.getByRole("button", { name: "Show Secret" });
    fireEvent.pointerDown(showSecretButton);
    assert.equal(tokenInput.type, "text");
    fireEvent.pointerUp(showSecretButton);
    assert.equal(tokenInput.type, "password");
    await user.click(screen.getByRole("button", { name: "Save Credential" }));
    await waitFor(() => assert.equal(screen.queryByRole("textbox", { name: /^Nickname:/ }), null));
    assert.equal(screen.queryByRole("button", { name: "Show Secret" }), null);
    assert.match(
        screen.getByRole("combobox", { name: /^Credential:/ }).textContent ?? "",
        /Weather/,
    );
    await user.click(screen.getByRole("button", { name: "Edit Credential" }));
    assert.equal((screen.getByRole("textbox", { name: /^Nickname:/ }) as HTMLInputElement).value, "Weather");
    assert.equal((screen.getByLabelText(/^Token:/) as HTMLInputElement).value, "");
    assert.equal(screen.queryByRole("button", { name: "Show Secret" }), null);
    await replaceTextInputValue(
        user,
        screen.getByRole("textbox", { name: /^Nickname:/ }) as HTMLInputElement,
        "Weather Updated",
    );
    await user.click(screen.getByRole("button", { name: "Save Credential" }));
    await waitFor(() => assert.equal(screen.queryByRole("textbox", { name: /^Nickname:/ }), null));
    assert.match(
        screen.getByRole("combobox", { name: /^Credential:/ }).textContent ?? "",
        /Weather Updated/,
    );
    await user.click(screen.getByRole("button", { name: "Edit Credential" }));
    assert.equal((screen.getByRole("textbox", { name: /^Nickname:/ }) as HTMLInputElement).value, "Weather Updated");
    assert.equal((screen.getByLabelText(/^Token:/) as HTMLInputElement).value, "");
    assert.equal(screen.queryByRole("button", { name: "Show Secret" }), null);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    assert.equal(screen.queryByRole("textbox", { name: /^Nickname:/ }), null);
    await user.click(screen.getByRole("button", { name: "Add New Credential" }));
    assert.match(
        screen.getByRole("combobox", { name: /^Credential:/ }).textContent ?? "",
        /Editing New Credential/,
    );
    await user.click(screen.getByRole("combobox", { name: /^Credential:/ }));
    await user.click(screen.getByRole("option", { name: /Weather Updated/ }));
    assert.equal(screen.queryByRole("textbox", { name: /^Nickname:/ }), null);
    assert.equal(screen.queryByRole("button", { name: "Show Secret" }), null);

    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));
    const fetchRequest = readLastCustomHttpSourceEditorRequest(client.sentMessages);
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
    await screen.findByText(/Sample fetched\. Response size: 13 bytes\. Request time: 42 ms\./);
    const copiedPromptList = await withMockClipboard(async () => {
        await user.click(screen.getByRole("button", { name: "Copy Prompt" }));
        await screen.findByRole("button", { name: "Copied" });
    });
    assert.doesNotMatch(copiedPromptList[0] ?? "", /secret-token/);

    const credentials = readStoredGlobalSettingsFromCodec(latestGlobalSettings).settings.customHttpCredentials;
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0]?.nickname, "Weather Updated");
    assert.equal(credentials[0]?.auth.case, "query");
    if (credentials[0]?.auth.case === "query") {
        assert.equal(credentials[0].auth.value.queryParameterName, "api_key");
        assert.equal(credentials[0].auth.value.token, "secret-token");
    }

    const widgetSettingsText = JSON.stringify(latestWidgetSettings);
    assert.match(widgetSettingsText, /credentialId/);
    assert.doesNotMatch(widgetSettingsText, /secret-token/);
    assert.match(
        screen.getByText(/This URL already has a "api_key" query parameter/).textContent ?? "",
        /replace it/,
    );
});

async function withMockClipboard(run: () => Promise<void>): Promise<readonly string[]> {
    const copiedTextList: string[] = [];
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
            writeText: async (text: string) => {
                copiedTextList.push(text);
            },
        },
    });

    try {
        await run();
    } finally {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: originalClipboard,
        });
    }

    return copiedTextList;
}

test("Custom HTTP source editor deletes selected credential and clears the widget reference", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });
    let latestWidgetSettings = buildSingleCustomMetricSettings(CONTRACT_URL, "credential-1");
    let latestGlobalSettings: InspectorTestSettings = upsertStoredCustomHttpCredential(undefined, {
        id: "credential-1",
        nickname: "LHM",
        authKind: "basic",
        username: "admin",
        password: "password",
    });

    render(<ContractSettingsHarness
        actionKind="customMetric"
        client={client}
        settings={latestWidgetSettings}
        globalSettings={latestGlobalSettings}
        onSettingsChange={(settings) => {
            latestWidgetSettings = settings;
        }}
        onGlobalSettingsChange={(settings) => {
            latestGlobalSettings = settings;
        }}
    />);

    await customHttpSourceEditorContractCases[0].openSourceEditor(user);
    await user.click(screen.getByRole("button", { name: "Delete Credential" }));
    assert.equal(screen.queryByRole("textbox", { name: /^Nickname:/ }), null);
    await user.click(screen.getByRole("button", { name: "Delete Credential" }));

    assert.equal(readStoredGlobalSettingsFromCodec(latestGlobalSettings).settings.customHttpCredentials.length, 0);
    assert.doesNotMatch(JSON.stringify(latestWidgetSettings), /credential-1/);
    assert.match(
        screen.getByRole("combobox", { name: /^Credential:/ }).textContent ?? "",
        /No Authentication/,
    );
    assert.equal(screen.queryByText(/no longer exists/), null);
});

test("Custom HTTP source editor requires explicit consent for credentials over public HTTP", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });
    let latestWidgetSettings = buildSingleCustomMetricSettings("http://api.example.com/weather", "credential-1");
    const latestGlobalSettings: InspectorTestSettings = upsertStoredCustomHttpCredential(undefined, {
        id: "credential-1",
        nickname: "Weather",
        authKind: "bearer",
        token: "token",
    });

    render(<ContractSettingsHarness
        actionKind="customMetric"
        client={client}
        settings={latestWidgetSettings}
        globalSettings={latestGlobalSettings}
        onSettingsChange={(settings) => {
            latestWidgetSettings = settings;
        }}
    />);

    await customHttpSourceEditorContractCases[0].openSourceEditor(user);
    const consentCheckbox = screen.getByRole("checkbox", {
        name: "Allow credentials over public HTTP",
    }) as HTMLInputElement;
    assert.equal(consentCheckbox.checked, false);
    assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), true);

    await user.click(consentCheckbox);

    assert.equal(consentCheckbox.checked, true);
    assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), false);
    assert.match(JSON.stringify(latestWidgetSettings), /allowPublicHttpCredentials/);
});

function ContractSettingsHarness({
    actionKind,
    client,
    settings: initialSettings,
    globalSettings: initialGlobalSettings = {},
    onSettingsChange,
    onGlobalSettingsChange = () => undefined,
}: {
    readonly actionKind: ActionKind;
    readonly client: TestPropertyInspectorClient;
    readonly settings: InspectorTestSettings;
    readonly globalSettings?: InspectorTestSettings | undefined;
    readonly onSettingsChange: (settings: InspectorTestSettings) => void;
    readonly onGlobalSettingsChange?: ((settings: InspectorTestSettings) => void) | undefined;
}): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(initialSettings);
    const [globalSettings, setGlobalSettings] = useState<InspectorTestSettings>(initialGlobalSettings);

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind,
                    isWindows: true,
                    settings,
                    globalSettings,
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
                onCustomHttpCredentialUpsert={(credential) => {
                    setGlobalSettings((currentSettings: InspectorTestSettings) => {
                        const nextSettings = upsertStoredCustomHttpCredential(currentSettings, credential);
                        onGlobalSettingsChange(nextSettings);
                        return nextSettings;
                    });
                }}
                onCustomHttpCredentialDelete={(credentialId) => {
                    setGlobalSettings((currentSettings: InspectorTestSettings) => {
                        const nextSettings = deleteStoredCustomHttpCredential(currentSettings, credentialId);
                        onGlobalSettingsChange(nextSettings);
                        return nextSettings;
                    });
                }}
                onResetWidgetSettings={() => undefined}
                onOpenColorCompensation={() => undefined}
            />
        </StreamDeckClientProvider>
    );
}

function buildSingleCustomMetricSettings(
    url: string = CONTRACT_URL,
    credentialId?: string | undefined,
    allowPublicHttpCredentials?: boolean | undefined,
): InspectorTestSettings {
    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings,
        {
            preferences: { pollingFrequencySeconds: 1 },
            customMetric: buildCustomMetricPatch(url, credentialId, allowPublicHttpCredentials),
        },
    ));
}

function buildDenseCustomMetricSettings(
    url: string = CONTRACT_URL,
    credentialId?: string | undefined,
    allowPublicHttpCredentials?: boolean | undefined,
): InspectorTestSettings {
    const rawSettings = resolveQuickStartStoredWidgetSettings(undefined, "denseMultiMetric", {
        createSlotId: createDenseSlotIdForTest(),
    }).rawSettings;
    const firstSlotSettings = writeStoredWidgetSettingsPatch(rawSettings, {
        preferences: { pollingFrequencySeconds: 1 },
        dense: {
            updateSlot: {
                slotId: "slot-1",
                target: { domain: "customMetric" },
                customMetric: buildCustomMetricPatch(url, credentialId, allowPublicHttpCredentials),
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

function buildStackedCustomMetricSettings(
    url: string = CONTRACT_URL,
    credentialId?: string | undefined,
    allowPublicHttpCredentials?: boolean | undefined,
): InspectorTestSettings {
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
                    customMetric: buildCustomMetricPatch(url, credentialId, allowPublicHttpCredentials),
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

function buildCustomMetricPatch(
    url: string,
    credentialId?: string | undefined,
    allowPublicHttpCredentials?: boolean | undefined,
): NonNullable<StoredWidgetSettingsPatch["customMetric"]> {
    return {
        url,
        userIntent: "Display temperature",
        jqTransform: CONTRACT_JQ_TRANSFORM,
        timeoutSeconds: CONTRACT_REQUEST_SETTINGS.timeoutSeconds,
        retryCount: CONTRACT_REQUEST_SETTINGS.retryCount,
        credentialId,
        allowPublicHttpCredentials,
    };
}

async function selectComboboxOption(
    user: ReturnType<typeof userEvent.setup>,
    comboboxName: RegExp,
    optionName: string,
): Promise<void> {
    await user.click(screen.getByRole("combobox", { name: comboboxName }));
    await user.click(screen.getByRole("option", { name: optionName }));
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
        auth: {
            credentialId: undefined,
            allowPublicHttpCredentials: false,
        },
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
        auth: {
            credentialId: undefined,
            allowPublicHttpCredentials: false,
        },
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
