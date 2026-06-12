import assert from "node:assert/strict";
import { test } from "node:test";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import {
    CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
    type CustomHttpPiTestResponse,
} from "../../runtime/sources/custom-http/custom-http-pi-test-messages";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/patch/widget-settings-patch";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../../shared/stream-deck-actions";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import {
    readTestSettingsRecord,
    TestPropertyInspectorClient,
    type SentStreamDeckMessage,
} from "../testing/test-property-inspector-client";
import { StreamDeckClientProvider } from "../stream-deck/stream-deck-client-context";
import { WidgetSettingsTab } from "./WidgetSettingsTab";

test("custom metric panel sends fetch and transform test commands through the plugin boundary", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\", maximum: 100 } }",
    })} />);

    assert.equal(screen.getByText("Configured").textContent, "Configured");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    assert.equal(screen.getByRole("button", { name: "Copy Prompt" }).hasAttribute("disabled"), true);

    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    assert.equal(fetchMessage.command, "fetchSample");
    assert.equal(fetchMessage.url, "https://api.example.com/weather");

    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
        result: {
            ok: true,
            responseBytes: 13,
            samplePreview: "{\"temp\":23.5}",
            isSamplePreviewTruncated: false,
        },
    });

    await screen.findByText(/Sample fetched\. Response size: 13 bytes\./);
    assert.equal(screen.getByRole("button", { name: "Copy Prompt" }).hasAttribute("disabled"), false);
    assert.equal(
        (screen.getByRole("textbox", { name: /^Sample Preview:/ }) as HTMLTextAreaElement).value,
        "{\"temp\":23.5}",
    );

    await user.click(screen.getByRole("button", { name: "Test Transform" }));

    const transformMessage = readSentMessagePayload(client.sentMessages.at(-1));
    assert.equal(transformMessage.command, "testTransform");
    assert.equal(transformMessage.url, "https://api.example.com/weather");
    assert.equal(
        transformMessage.jqTransform,
        "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\", maximum: 100 } }",
    );

    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "testTransform",
        requestId: transformMessage.requestId,
        result: {
            ok: true,
            metric: {
                label: "TEMP",
                value: 23.5,
                unitText: "°C",
                maximum: 100,
            },
        },
    });

    await screen.findByText(/Validated Metric: TEMP 23.5 \/ 100 °C/);
});

test("custom metric prompt marks truncated sample previews", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
        result: {
            ok: true,
            responseBytes: 12000,
            samplePreview: "{\"current\":{\"temperature_2m\":23.5},",
            isSamplePreviewTruncated: true,
        },
    });

    assert.match(
        await screen.findByText(/This preview is truncated/).then(element => element.textContent ?? ""),
        /truncated/,
    );
    assert.match(
        (screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement).value,
        /truncated preview of a 12000-byte response/,
    );
});

test("custom metric source editor shows copyable failure details", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_PI_TEST_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
        result: {
            ok: false,
            stage: "fetch",
            detail: "HTTP request failed. TypeError: fetch failed",
        },
    });

    assert.equal(
        (await screen.findByRole("textbox", { name: /^Failure Debug Details:/ }) as HTMLTextAreaElement).value,
        "Stage: fetch\nDetail: HTTP request failed. TypeError: fetch failed",
    );
    assert.equal(screen.queryByRole("button", { name: "Copy Failure" }), null);
    assert.match(
        screen.getByText("Fetching sample failed. See failure debug details below.").textContent ?? "",
        /Fetching sample failed/,
    );
});

test("custom metric icon picker writes and clears the widget icon id", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    const iconInput = screen.getByRole("combobox", { name: /^Widget Icon:/ }) as HTMLInputElement;
    await user.type(iconInput, "temp");

    await user.click(screen.getByRole("option", { name: /^Thermometer$/ }));
    assert.equal(iconInput.value, "Thermometer");
    assert.equal(screen.queryByRole("listbox", { name: /^Widget Icon:/ }), null);
    assert.equal(screen.getByText(/Icon is used in some views only/).textContent?.length > 0, true);

    await user.click(screen.getByRole("button", { name: "Clear Icon" }));
    assert.equal(iconInput.value, "");
    assert.equal(screen.getByText(/Icon is used in some views only/).textContent?.length > 0, true);
});

test("custom metric icon picker shows the stored icon label", () => {
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
        iconId: "tv",
    })} />);

    assert.equal(
        (screen.getByRole("combobox", { name: /^Widget Icon:/ }) as HTMLInputElement).value,
        "TV",
    );
});

test("custom metric icon picker supports keyboard selection", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    const iconInput = screen.getByRole("combobox", { name: /^Widget Icon:/ }) as HTMLInputElement;
    await user.type(iconInput, "thermometer");
    await user.keyboard("{Enter}");

    assert.equal(iconInput.value, "Thermometer");
    assert.equal(screen.queryByRole("listbox", { name: /^Widget Icon:/ }), null);
});

test("custom metric icon picker renders a bounded result list", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    assert.equal(document.querySelectorAll(".custom-metric-icon-option").length, 0);
    assert.equal(screen.queryByRole("listbox", { name: /^Widget Icon:/ }), null);

    await user.type(screen.getByRole("combobox", { name: /^Widget Icon:/ }), "c");

    assert.equal(document.querySelectorAll(".custom-metric-icon-option").length, 20);
    assert.match(screen.getByText(/Keep typing to narrow the list/).textContent ?? "", /Keep typing/);
});

test("custom metric icon picker includes the status row in listbox height", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.type(screen.getByRole("combobox", { name: /^Widget Icon:/ }), "map pin x");

    assert.equal(screen.getAllByRole("option").length, 2);
    assert.equal(screen.getByRole("listbox", { name: /^Widget Icon:/ }).style.maxHeight, "92px");
});

test("custom metric icon search includes Lucide metadata keywords", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.type(screen.getByRole("combobox", { name: /^Widget Icon:/ }), "4k");

    assert.equal(screen.getByRole("option", { name: /^TV$/ }).textContent?.includes("TV"), true);
});

test("custom metric prompt includes advisory icon suggestion field", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const prompt = screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement;

    assert.match(prompt.value, /"suggestedLucideIconId": "thermometer"/);
    assert.match(prompt.value, /suggestedLucideIconId is optional and advisory/);
});

test("custom metric invalid settings keep entered fields visible for editing", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
    })} />);

    assert.equal(screen.getByText("Needs setup").textContent, "Needs setup");
    assert.equal(screen.queryByRole("textbox", { name: /^HTTP URL:/ }), null);
    assert.equal(screen.queryByRole("combobox", { name: /^Widget Icon:/ }), null);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    assert.equal(
        (screen.getByRole("textbox", { name: /^HTTP URL:/ }) as HTMLInputElement).value,
        "https://api.example.com/weather",
    );
    assert.equal(
        (screen.getByRole("textbox", { name: /^What to Show:/ }) as HTMLTextAreaElement).value,
        "Display temperature",
    );
    assert.match(screen.getByText("Enter a jq transform.").textContent ?? "", /jq transform/);
});

test("custom metric source editor keeps whitespace while editing user intent", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const userIntentInput = screen.getByRole("textbox", { name: /^What to Show:/ }) as HTMLTextAreaElement;

    await user.type(userIntentInput, " ");

    assert.equal(userIntentInput.value, " ");
});

test("custom metric transform section can focus the single fetch sample control", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const fetchSampleButton = screen.getByRole("button", { name: "Fetch Sample" });

    await user.click(screen.getByRole("button", { name: "Go to Fetch Sample" }));

    assert.equal(document.activeElement, fetchSampleButton);
    assert.equal(client.sentMessages.length, 0);
});

function CustomMetricSettingsHarness({
    client,
    settings: initialSettings,
}: {
    readonly client: TestPropertyInspectorClient;
    readonly settings: InspectorTestSettings;
}): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(initialSettings);

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind: "customMetric",
                    isWindows: true,
                    settings,
                })}
                isGlobalViewOverrideEnabled={false}
                isGlobalThemeOverrideEnabled={false}
                isGlobalTransparentSurfaceOverrideEnabled={false}
                isGlobalPaintOverrideEnabled={false}
                colorCompensationProfile={DEFAULT_COLOR_COMPENSATION_PROFILE}
                onSettingsPatch={(patch) => {
                    setSettings((currentSettings: InspectorTestSettings) => writeStoredWidgetSettingsPatch(
                        currentSettings,
                        patch,
                    ));
                }}
                onResetWidgetSettings={() => undefined}
                onOpenColorCompensation={() => undefined}
            />
        </StreamDeckClientProvider>
    );
}

function buildCustomMetricSettings(patch: NonNullable<StoredWidgetSettingsPatch["customMetric"]>): InspectorTestSettings {
    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings,
        { customMetric: patch },
    ));
}

function readSentMessagePayload(message: SentStreamDeckMessage | undefined): {
    readonly command: "fetchSample" | "testTransform";
    readonly requestId: string;
    readonly url: string;
    readonly jqTransform?: string;
} {
    if (!message || message.event !== "sendToPlugin") {
        throw new Error("Expected a sendToPlugin message.");
    }

    const payload = message.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Expected object payload.");
    }

    const record = payload as Record<string, unknown>;
    const command = record["command"];
    const requestId = record["requestId"];
    const url = record["url"];
    if (
        (command !== "fetchSample" && command !== "testTransform")
        || typeof requestId !== "string"
        || typeof url !== "string"
    ) {
        throw new Error("Expected Custom HTTP PI test payload.");
    }

    const jqTransform = record["jqTransform"];
    return {
        command,
        requestId,
        url,
        ...(typeof jqTransform === "string" ? { jqTransform } : {}),
    };
}

function dispatchCustomHttpResponse(
    client: TestPropertyInspectorClient,
    response: CustomHttpPiTestResponse,
): void {
    act(() => {
        client.dispatchSendToPropertyInspector(response);
    });
}
