import { strict as assert } from "node:assert";
import { test } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { STREAM_DECK_ACTION_UUID_BY_KIND } from "../shared/stream-deck-actions";
import { PropertyInspectorRoot } from "./PropertyInspectorRoot";
import {
    readTestSettingsRecord,
    TestPropertyInspectorClient,
} from "./testing/test-property-inspector-client";

test("property inspector root renders the first visible tab in the Stream Deck language", async () => {
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu,
        language: "zh_CN",
        settings: readTestSettingsRecord(
            resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings,
        ),
    });

    render(<PropertyInspectorRoot client={client} />);

    assert.equal(screen.queryByRole("tab", { name: "Widget" }), null);
    assert.equal((await screen.findByRole("tab", { name: "组件" })).getAttribute("aria-selected"), "true");
    assert.equal(screen.queryByRole("tab", { name: "Widget" }), null);
});

