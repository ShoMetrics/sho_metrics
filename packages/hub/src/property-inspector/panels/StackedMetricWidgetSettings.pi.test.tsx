import assert from "node:assert/strict";
import { test } from "node:test";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../color-compensation/types";
import {
    NODE_SYSTEM_SOURCE_ID,
} from "../../runtime/sources/source-ids";
import { wallClockNowMilliseconds } from "../../shared/clock";
import { resolveQuickStartStoredWidgetSettings } from "../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../settings/storage/widget-settings-patch";
import { buildVisibilityContext, type InspectorTestSettings } from "../testing/test-context";
import { WidgetSettingsTab } from "./WidgetSettingsTab";

test("stacked metric slot editor stays open after auto-save settings updates", async () => {
    const user = userEvent.setup();

    render(<StackedWidgetSettingsHarness />);

    assert.equal(screen.queryByText("CPU Metric:"), null);
    assert.notEqual(screen.queryByRole("button", { name: "Reset Widget Settings" }), null);

    await user.click(screen.getByRole("combobox", { name: /Interval/ }));
    await user.click(screen.getByRole("option", { name: "5s" }));
    assert.match(screen.getByRole("combobox", { name: /Interval/ }).textContent ?? "", /5s/);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    await screen.findByRole("heading", { name: "Editing Metric #1" });
    assert.notEqual(screen.queryByText("CPU Metric:"), null);

    await waitFor(() => {
        assert.equal(screen.queryByRole("button", { name: "Reset Widget Settings" }), null);
    });

    await user.click(screen.getByRole("combobox", { name: /CPU Metric/ }));
    await user.click(screen.getByRole("option", { name: "Temperature" }));

    await screen.findByRole("heading", { name: "Editing Metric #1" });
    assert.notEqual(screen.queryByText("CPU Metric:"), null);

    await user.click(screen.getByRole("button", { name: "Back" }));

    await screen.findByRole("heading", { name: "Stack" });
    assert.equal(screen.queryByText("CPU Metric:"), null);
    await waitFor(() => {
        assert.notEqual(screen.queryByRole("button", { name: "Reset Widget Settings" }), null);
    });
});

function StackedWidgetSettingsHarness(): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(() => buildStackedWidgetSettings());

    return (
        <WidgetSettingsTab
            context={buildVisibilityContext({
                actionKind: "stackedMetric",
                isWindows: true,
                settings,
                runtimeCache: {
                    displayedMetricReadAttribution: {
                        metricKey: "cpu.usage_percent",
                        routing: {
                            preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                            selectedSourceId: NODE_SYSTEM_SOURCE_ID,
                        },
                        outcome: {
                            kind: "value",
                            valueTimestampMilliseconds: wallClockNowMilliseconds(),
                            freshness: "fresh",
                        },
                    },
                },
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
    );
}

function buildStackedWidgetSettings(patch?: StoredWidgetSettingsPatch): InspectorTestSettings {
    const quickStartSettings = resolveQuickStartStoredWidgetSettings(undefined, "stackedMetric", {
        createSlotId: createStackedSlotIdForTest(),
    }).rawSettings;

    return patch === undefined
        ? quickStartSettings
        : writeStoredWidgetSettingsPatch(quickStartSettings, patch, {
            createSlotId: createStackedSlotIdForTest(),
        });
}

function createStackedSlotIdForTest(): () => string {
    const slotIds = ["slot-1", "slot-2", "slot-3"];

    return () => slotIds.shift() ?? "unexpected-slot";
}
