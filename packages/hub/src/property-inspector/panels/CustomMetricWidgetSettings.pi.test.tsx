import assert from "node:assert/strict";
import { test } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import {
    CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
    type CustomHttpSourceEditorResponse,
} from "../../runtime/sources/custom-http/custom-http-source-editor-messages";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/patch/widget-settings-patch";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../../shared/stream-deck-actions";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import {
    readPropertyInspectorScrollTopForTest,
    setPropertyInspectorScrollTopForTest,
} from "../testing/scroll-position";
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
    assert.equal(
        (screen.getByRole("textbox", { name: /^Label:/ }) as HTMLInputElement).placeholder,
        "Keep empty to use jq inferred label",
    );
    setPropertyInspectorScrollTopForTest(420);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => {
        assert.equal(readPropertyInspectorScrollTopForTest(), 0);
    });
    assert.equal(screen.getByRole("button", { name: "Copy Prompt" }).hasAttribute("disabled"), true);

    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    assert.equal(fetchMessage.command, "fetchSample");
    assert.equal(fetchMessage.consumerSlug, "single");
    assert.equal(fetchMessage.url, "https://api.example.com/weather");
    assert.deepEqual(fetchMessage.requestSettings, { timeoutSeconds: 5, retryCount: 0 });
    assert.deepEqual(fetchMessage.auth, {
        credentialId: undefined,
        allowPublicHttpCredentials: false,
    });

    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
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
    assert.equal(screen.getByRole("button", { name: "Copy Prompt" }).hasAttribute("disabled"), false);
    assert.equal(
        (screen.getByRole("textbox", { name: /^Sample Preview:/ }) as HTMLTextAreaElement).value,
        "{\"temp\":23.5}",
    );
    const copiedPromptList = await withMockClipboard(async () => {
        await user.click(screen.getByRole("button", { name: "Copy Prompt" }));
        await screen.findByRole("button", { name: "Copied" });
    });
    assert.match(copiedPromptList[0] ?? "", /Input JSON sample:/);

    await user.click(screen.getByRole("button", { name: "Test Transform" }));

    const transformMessage = readSentMessagePayload(client.sentMessages.at(-1));
    assert.equal(transformMessage.command, "testTransform");
    assert.equal(transformMessage.consumerSlug, "single");
    assert.equal(transformMessage.url, "https://api.example.com/weather");
    assert.deepEqual(transformMessage.requestSettings, { timeoutSeconds: 5, retryCount: 0 });
    assert.deepEqual(transformMessage.auth, {
        credentialId: undefined,
        allowPublicHttpCredentials: false,
    });
    assert.equal(
        transformMessage.jqTransform,
        "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\", maximum: 100 } }",
    );

    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
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
    assert.equal(screen.getByText("Valid metric output.").textContent, "Valid metric output.");
});

test("custom metric source editor visibly normalizes scheme-less URLs on blur", async () => {
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
    const urlInput = screen.getByRole("textbox", { name: /^HTTP URL:/ }) as HTMLInputElement;

    await user.clear(urlInput);
    await user.type(urlInput, "api.open-meteo.com/v1/forecast");

    assert.equal(urlInput.value, "api.open-meteo.com/v1/forecast");

    await user.tab();

    assert.equal(urlInput.value, "https://api.open-meteo.com/v1/forecast");

    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    assert.equal(fetchMessage.command, "fetchSample");
    assert.equal(fetchMessage.url, "https://api.open-meteo.com/v1/forecast");
});

test("custom metric source editor explains why fetching is disabled", async () => {
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
    const urlInput = screen.getByRole("textbox", { name: /^HTTP URL:/ }) as HTMLInputElement;

    await user.clear(urlInput);

    assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), true);
    assert.equal(
        screen.getByText("Enter an HTTP or HTTPS URL before fetching a sample.").textContent,
        "Enter an HTTP or HTTPS URL before fetching a sample.",
    );

    await user.type(urlInput, "https://");

    assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), true);
    assert.equal(
        screen.getByText("Enter a valid HTTP or HTTPS URL before fetching a sample.").textContent,
        "Enter a valid HTTP or HTTPS URL before fetching a sample.",
    );
});

test("custom metric source editor explains credential fetch gates", async () => {
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    const user = userEvent.setup();
    const { unmount } = render(<CustomMetricSettingsHarness
        client={client}
        settings={buildCustomMetricSettings({
            url: "http://api.example.com/weather",
            userIntent: "Display temperature",
            jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
            credentialId: "credential-1",
            allowPublicHttpCredentials: false,
        })}
        globalSettings={buildCustomHttpCredentialGlobalSettings()}
    />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), true);
    assert.equal(
        screen.getByText("Authentication over public HTTP requires confirmation in the Authentication section.").textContent,
        "Authentication over public HTTP requires confirmation in the Authentication section.",
    );

    unmount();
    render(<CustomMetricSettingsHarness
        client={client}
        settings={buildCustomMetricSettings({
            url: "https://api.example.com/weather",
            userIntent: "Display temperature",
            jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
            credentialId: "missing-credential",
        })}
        globalSettings={buildCustomHttpCredentialGlobalSettings()}
    />);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), true);
    assert.equal(
        screen.getByText("The selected credential is missing. Select or create a credential in the Authentication section.").textContent,
        "The selected credential is missing. Select or create a credential in the Authentication section.",
    );
});

test("custom metric source editor changes fetch button text while fetching", async () => {
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

    const fetchingButton = screen.getByRole("button", { name: "Fetching..." });
    assert.equal(fetchingButton.hasAttribute("disabled"), true);
});

test("custom metric prompt explains large JSON digests", async () => {
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
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
        result: {
            ok: true,
            responseBytes: 12000,
            elapsedMilliseconds: 64,
            samplePreview: "{\"current\":{\"temperature_2m\":23.5},",
            isSamplePreviewTruncated: true,
            promptSample: {
                kind: "jsonDigest",
                text: "{\n  \"current\": {\n    \"temperature_2m\": 23.5\n  }\n}",
                arraySummaries: ["$.hourly.time: 24 items; first 3 shown"],
            },
        },
    });

    assert.match(
        await screen.findByText(/This preview is truncated/).then(element => element.textContent ?? ""),
        /truncated/,
    );
    assert.match(
        (screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement).value,
        /Input JSON digest for a large 12000-byte response/,
    );
    assert.match(
        (screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement).value,
        /This is an intentional structure summary/,
    );
    assert.match(
        (screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement).value,
        /Array lengths:\n- \$\.hourly\.time: 24 items; first 3 shown/,
    );
    assert.match(
        (screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement).value,
        /Do not reject solely because the digest is incomplete/,
    );
    assert.doesNotMatch(
        (screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement).value,
        /Observed discriminator values/,
    );
});

test("custom metric prompt does not mention digests for normal JSON samples", async () => {
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
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
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

    const prompt = await screen.findByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement;
    assert.match(prompt.value, /The input sample is the fetched JSON sample/);
    assert.doesNotMatch(prompt.value, /digest/i);
});

test("custom metric source editor shows exploration output for non-metric jq results", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/sensors",
        userIntent: "Find GPU temperature",
        jqTransform: "[.. | objects | select(.Text?)]",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
        result: {
            ok: true,
            responseBytes: 48,
            elapsedMilliseconds: 42,
            samplePreview: "{\"sensors\":[{\"Text\":\"GPU Core\",\"Value\":\"55 °C\"}]}",
            isSamplePreviewTruncated: false,
            promptSample: {
                kind: "jsonSample",
                text: "{\"sensors\":[{\"Text\":\"GPU Core\",\"Value\":\"55 °C\"}]}",
            },
        },
    });

    await screen.findByText(/Sample fetched/);
    await user.click(screen.getByRole("button", { name: "Test Transform" }));

    const transformMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: transformMessage.requestId,
        result: {
            ok: true,
            explorationOutput: "[\n  {\n    \"Text\": \"GPU Core\",\n    \"Value\": \"55 °C\"\n  }\n]",
            schemaFailureDetail: "Output must be an object.",
        },
    });

    const explorationOutput = await screen.findByRole("textbox", { name: /^Exploration Output:/ }) as HTMLTextAreaElement;
    assert.equal(screen.getByText("jq ran, but the output is not a metric yet.").textContent, "jq ran, but the output is not a metric yet.");
    assert.match(explorationOutput.value, /GPU Core/);
    assert.match(explorationOutput.value, /Not a valid final metric: Output must be an object\./);
    assert.match(explorationOutput.value, /```[\s\S]*GPU Core[\s\S]*```/);

    const copiedTextList = await withMockClipboard(async () => {
        await user.click(screen.getByRole("button", { name: "Copy Output" }));
        await screen.findByRole("button", { name: "Copied" });
    });
    assert.match(copiedTextList[0] ?? "", /Not a valid final metric: Output must be an object\./);
    assert.match(copiedTextList[0] ?? "", /```[\s\S]*GPU Core[\s\S]*```/);
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
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
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
        "Stage: fetch\nDetail: HTTP request failed. TypeError: fetch failed\nSettings: timeout=5s, retryCount=0, responseLimit=256KiB",
    );
    const copiedDetailsList = await withMockClipboard(async () => {
        await user.click(screen.getByRole("button", { name: "Copy Details" }));
        await screen.findByRole("button", { name: "Copied" });
    });
    assert.match(copiedDetailsList[0] ?? "", /Stage: fetch/);
    assert.match(
        screen.getByText("Fetching sample failed. See failure debug details below.").textContent ?? "",
        /Fetching sample failed/,
    );
});

test("custom metric source editor explains transform failure details", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));

    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
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

    const transformMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "testTransform",
        requestId: transformMessage.requestId,
        result: {
            ok: false,
            stage: "jq",
            detail: "jq: error: syntax error",
        },
    });

    await screen.findByRole("textbox", { name: /^Failure Debug Details:/ });
    assert.equal(screen.getByText("jq transform failed.").textContent, "jq transform failed.");
    assert.match(
        screen.getByText(/did not output a valid metric/).textContent ?? "",
        /did not output a valid metric/,
    );
});

test("custom metric request settings show the polling budget warning", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
        timeoutSeconds: 30,
        retryCount: 3,
    }, {
        pollingFrequencySeconds: 1,
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    assert.match(
        screen.getByText(/Worst-case request time is about/).textContent ?? "",
        /waits for the current request to finish/,
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
        customIconId: "tv",
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

    assert.equal(document.querySelectorAll(".metric-icon-option").length, 0);
    assert.equal(screen.queryByRole("listbox", { name: /^Widget Icon:/ }), null);

    await user.type(screen.getByRole("combobox", { name: /^Widget Icon:/ }), "c");

    assert.equal(document.querySelectorAll(".metric-icon-option").length, 20);
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

test("custom metric prompt includes URL context and redacts secret query values", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather?latitude=35.6895&api_key=secret-token",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const prompt = screen.getByRole("textbox", { name: /^AI Prompt:/ }) as HTMLTextAreaElement;

    assert.match(prompt.value, /Source URL for debugging \(secret-like query values may be redacted\):/);
    assert.match(prompt.value, /https:\/\/api\.example\.com\/weather\?latitude=35\.6895&api_key=REDACTED/);
    assert.match(prompt.value, /Source URL warning:/);
    assert.match(prompt.value, /This warning alone does not prevent writing jq/);
    assert.doesNotMatch(prompt.value, /secret-token/);
});

test("custom metric source editor can apply a blocked redirected URL", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "http://api.example.com/data",
        userIntent: "Display temperature",
        jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
        credentialId: "credential-1",
        allowPublicHttpCredentials: true,
    })} globalSettings={buildCustomHttpCredentialGlobalSettings()} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));
    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
        result: {
            ok: false,
            stage: "redirectBlocked",
            detail: "Cross-origin redirect blocked while credentials are attached.",
            blockedRedirect: {
                fromOrigin: "http://api.example.com",
                toOrigin: "http://login.example.net",
                redirectedUrl: "http://login.example.net/data?api_key=REDACTED",
            },
        },
    });

    const failureDetails = await screen.findByRole("textbox", { name: /^Failure Debug Details:/ }) as HTMLTextAreaElement;
    assert.equal(screen.getByText("Notice").textContent, "Notice");
    const redirectNoticeText = screen.getByText(/API URL is being redirected from/).textContent ?? "";
    assert.match(redirectNoticeText, /http:\/\/api\.example\.com/);
    assert.match(redirectNoticeText, /http:\/\/login\.example\.net/);
    assert.match(redirectNoticeText, /http:\/\/login\.example\.net\/data\?api_key=REDACTED/);
    assert.match(failureDetails.value, /Redirect: http:\/\/api\.example\.com -> http:\/\/login\.example\.net/);
    assert.match(failureDetails.value, /Redirected URL: http:\/\/login\.example\.net\/data\?api_key=REDACTED/);

    const copiedTextList = await withMockClipboard(async () => {
        await user.click(screen.getByRole("button", { name: "Copy Redirected URL" }));
        await screen.findByRole("button", { name: "Copied" });
    });
    assert.equal(copiedTextList[0], "http://login.example.net/data?api_key=REDACTED");

    await user.click(screen.getByRole("button", { name: "Use Redirected URL" }));

    assert.equal(
        (screen.getByRole("textbox", { name: /^HTTP URL:/ }) as HTMLInputElement).value,
        "http://login.example.net/data?api_key=REDACTED",
    );
    assert.equal(screen.getByRole("button", { name: "Fetch Sample" }).hasAttribute("disabled"), true);
    assert.equal(
        screen.getByText("Authentication over public HTTP requires confirmation in the Authentication section.").textContent,
        "Authentication over public HTTP requires confirmation in the Authentication section.",
    );
    assert.equal(screen.queryByRole("textbox", { name: /^Failure Debug Details:/ }), null);
});

test("custom metric prompt encourages Lucide icon suggestions without a fixed example list", async () => {
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
    assert.match(prompt.value, /suggestedLucideIconId is encouraged but not required/);
    assert.match(prompt.value, /https:\/\/lucide\.dev\/icons\//);
    assert.doesNotMatch(prompt.value, /Example Lucide icon ids/);
    assert.match(prompt.value, /8\. Otherwise, write the jq filter now in exactly one fenced code block labeled jq\./);
    assert.match(prompt.value, /Jq syntax reminders:/);
    assert.match(prompt.value, /Convert numeric strings with `tonumber` when needed/);
    assert.match(prompt.value, /maximum is encouraged but not required/);
    assert.match(prompt.value, /Omit maximum when no safe display maximum can be inferred/);
    assert.match(prompt.value, /volts \| amperes/);
    assert.match(prompt.value, /watt_hours \| decibels_a_weighted \| siemens_per_centimeter/);
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

test("custom metric source editor extracts a single jq code block when testing", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.customMetric,
    });

    render(<CustomMetricSettingsHarness client={client} settings={buildCustomMetricSettings({
        url: "https://api.example.com/weather",
        userIntent: "Display temperature",
    })} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const transformInput = screen.getByRole("textbox", { name: /^jq Transform:/ }) as HTMLTextAreaElement;
    const aiReply = [
        "Run this jq expression:",
        "```jq",
        "{metric:{label:\"TEMP\",value:.temp,unit:\"celsius\"}}",
        "```",
    ].join("\n");

    fireEvent.change(transformInput, {
        target: {
            value: aiReply,
        },
    });

    assert.equal(transformInput.value, aiReply);

    await user.click(screen.getByRole("button", { name: "Fetch Sample" }));
    const fetchMessage = readSentMessagePayload(client.sentMessages.at(-1));
    dispatchCustomHttpResponse(client, {
        type: CUSTOM_HTTP_SOURCE_EDITOR_MESSAGE_TYPE,
        command: "fetchSample",
        requestId: fetchMessage.requestId,
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

    const transformMessage = readSentMessagePayload(client.sentMessages.at(-1));
    assert.equal(transformMessage.command, "testTransform");
    assert.equal(transformMessage.jqTransform, "{metric:{label:\"TEMP\",value:.temp,unit:\"celsius\"}}");
    assert.equal(transformInput.value, "{metric:{label:\"TEMP\",value:.temp,unit:\"celsius\"}}");
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

    const goToFetchSampleButtons = screen.getAllByRole("button", { name: "Go to Fetch Sample" });
    assert.equal(goToFetchSampleButtons.length, 2);

    await user.click(goToFetchSampleButtons[0]);

    assert.equal(document.activeElement, fetchSampleButton);
    assert.equal(client.sentMessages.length, 0);
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

function CustomMetricSettingsHarness({
    client,
    settings: initialSettings,
    globalSettings,
}: {
    readonly client: TestPropertyInspectorClient;
    readonly settings: InspectorTestSettings;
    readonly globalSettings?: InspectorTestSettings | undefined;
}): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(initialSettings);

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind: "customMetric",
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

function buildCustomHttpCredentialGlobalSettings(): InspectorTestSettings {
    return {
        customHttpCredentials: [
            {
                id: "credential-1",
                nickname: "LHM",
                basic: {
                    username: "admin",
                    password: "secret",
                },
            },
        ],
    };
}

function buildCustomMetricSettings(
    patch: NonNullable<StoredWidgetSettingsPatch["customMetric"]>,
    options: {
        readonly pollingFrequencySeconds?: number | undefined;
    } = {},
): InspectorTestSettings {
    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings,
        {
            customMetric: patch,
            ...(options.pollingFrequencySeconds === undefined
                ? {}
                : { preferences: { pollingFrequencySeconds: options.pollingFrequencySeconds } }),
        },
    ));
}

function readSentMessagePayload(message: SentStreamDeckMessage | undefined): {
    readonly command: "fetchSample" | "testTransform";
    readonly requestId: string;
    readonly consumerSlug: string;
    readonly url: string;
    readonly jqTransform?: string;
    readonly requestSettings: {
        readonly timeoutSeconds: number;
        readonly retryCount: number;
    };
    readonly auth: {
        readonly credentialId: string | undefined;
        readonly allowPublicHttpCredentials: boolean;
    };
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
    const consumerSlug = record["consumerSlug"];
    const url = record["url"];
    const requestSettings = record["requestSettings"];
    const auth = record["auth"];
    if (
        (command !== "fetchSample" && command !== "testTransform")
        || typeof requestId !== "string"
        || typeof consumerSlug !== "string"
        || typeof url !== "string"
        || !requestSettings
        || typeof requestSettings !== "object"
        || Array.isArray(requestSettings)
        || !auth
        || typeof auth !== "object"
        || Array.isArray(auth)
    ) {
        throw new Error("Expected Custom HTTP PI test payload.");
    }

    const jqTransform = record["jqTransform"];
    const requestSettingsRecord = requestSettings as Record<string, unknown>;
    const authRecord = auth as Record<string, unknown>;
    if (
        typeof requestSettingsRecord["timeoutSeconds"] !== "number"
        || typeof requestSettingsRecord["retryCount"] !== "number"
        || (
            authRecord["credentialId"] !== undefined
            && typeof authRecord["credentialId"] !== "string"
        )
        || typeof authRecord["allowPublicHttpCredentials"] !== "boolean"
    ) {
        throw new Error("Expected Custom HTTP PI request settings.");
    }

    return {
        command,
        requestId,
        consumerSlug,
        url,
        requestSettings: {
            timeoutSeconds: requestSettingsRecord["timeoutSeconds"],
            retryCount: requestSettingsRecord["retryCount"],
        },
        auth: {
            credentialId: authRecord["credentialId"],
            allowPublicHttpCredentials: authRecord["allowPublicHttpCredentials"],
        },
        ...(typeof jqTransform === "string" ? { jqTransform } : {}),
    };
}

function dispatchCustomHttpResponse(
    client: TestPropertyInspectorClient,
    response: CustomHttpSourceEditorResponse,
): void {
    act(() => {
        client.dispatchSendToPropertyInspector(response);
    });
}
