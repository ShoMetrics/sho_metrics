import assert from "node:assert/strict";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { test } from "vitest";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../../color-compensation/types";
import { resolveQuickStartStoredWidgetSettings } from "../../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../../settings/storage/patch/widget-settings-patch";
import type { ActionKind } from "../../inspector/settings-types";
import { StreamDeckClientProvider } from "../../stream-deck/stream-deck-client-context";
import { buildVisibilityContext, type InspectorTestSettings } from "../../testing/test-context";
import {
    readTestSettingsRecord,
    TestPropertyInspectorClient,
} from "../../testing/test-property-inspector-client";
import { WidgetSettingsTab } from "../tabs/WidgetSettingsTab";

test("memory display mode remains available in bar view and writes a memory patch", async () => {
    const user = userEvent.setup();
    const patches: StoredWidgetSettingsPatch[] = [];

    render(<DisplaySettingsHarness
        actionKind="memory"
        settings={buildSingleMetricSettings("memory", {
            appearance: {
                view: { selectedView: "bar" },
            },
        })}
        onPatch={(patch) => patches.push(patch)}
    />);

    const displayMode = screen.getByRole("combobox", { name: /^Usage Display:/ });
    await user.click(displayMode);
    assert.notEqual(screen.queryByRole("option", { name: "Percentage" }), null);
    assert.notEqual(screen.queryByRole("option", { name: "Used Memory" }), null);
    assert.notEqual(screen.queryByRole("option", { name: "Free Memory" }), null);
    await user.click(screen.getByRole("option", { name: "Used Memory" }));

    assert.deepEqual(patches.at(-1), {
        memory: {
            usageDisplayMode: "usedCapacity",
        },
    });
});

test("VRAM display mode remains available in line view and writes a GPU patch", async () => {
    const user = userEvent.setup();
    const patches: StoredWidgetSettingsPatch[] = [];

    render(<DisplaySettingsHarness
        actionKind="gpu"
        settings={buildSingleMetricSettings("gpu", {
            appearance: {
                view: { selectedView: "line" },
            },
            gpu: {
                kind: "vram",
            },
        })}
        onPatch={(patch) => patches.push(patch)}
    />);

    const displayMode = screen.getByRole("combobox", { name: /^Usage Display:/ });
    await user.click(displayMode);
    assert.notEqual(screen.queryByRole("option", { name: "Percentage" }), null);
    assert.notEqual(screen.queryByRole("option", { name: "Used VRAM" }), null);
    assert.notEqual(screen.queryByRole("option", { name: "Free VRAM" }), null);
    await user.click(screen.getByRole("option", { name: "Free VRAM" }));

    assert.deepEqual(patches.at(-1), {
        gpu: {
            vramDisplayMode: "freeCapacity",
        },
    });
});

test("disk display mode remains available in bar view and writes a disk patch", async () => {
    const user = userEvent.setup();
    const patches: StoredWidgetSettingsPatch[] = [];

    render(<DisplaySettingsHarness
        actionKind="disk"
        settings={buildSingleMetricSettings("disk", {
            appearance: {
                view: { selectedView: "bar" },
            },
            disk: {
                kind: "usage",
            },
        })}
        onPatch={(patch) => patches.push(patch)}
    />);

    const displayMode = screen.getByRole("combobox", { name: /^Usage Display:/ });
    await user.click(displayMode);
    assert.notEqual(screen.queryByRole("option", { name: "Percentage" }), null);
    assert.notEqual(screen.queryByRole("option", { name: "Used Disk Space" }), null);
    assert.notEqual(screen.queryByRole("option", { name: "Free Disk Space" }), null);
    await user.click(screen.getByRole("option", { name: "Used Disk Space" }));

    assert.deepEqual(patches.at(-1), {
        disk: {
            usageDisplayMode: "usedCapacity",
        },
    });
});

test.each([
    { actionKind: "memory" as const, targetPatch: {} },
    { actionKind: "gpu" as const, targetPatch: { gpu: { kind: "vram" as const } } },
    { actionKind: "disk" as const, targetPatch: { disk: { kind: "usage" as const } } },
])("$actionKind display mode is hidden for the minimal circle", ({ actionKind, targetPatch }) => {
    render(<DisplaySettingsHarness
        actionKind={actionKind}
        settings={buildSingleMetricSettings(actionKind, {
            ...targetPatch,
            appearance: {
                view: {
                    selectedView: "circle",
                    circleVariant: "minimal",
                },
            },
        })}
        onPatch={() => undefined}
    />);

    assert.equal(screen.queryByRole("combobox", { name: /^Usage Display:/ }), null);
});

test.each([
    { actionKind: "memory" as const, targetPatch: { memory: { usageDisplayMode: "freeCapacity" as const } } },
    {
        actionKind: "gpu" as const,
        targetPatch: { gpu: { kind: "vram" as const, vramDisplayMode: "freeCapacity" as const } },
    },
    {
        actionKind: "disk" as const,
        targetPatch: { disk: { kind: "usage" as const, usageDisplayMode: "freeCapacity" as const } },
    },
])("$actionKind free capacity explains that range colors still follow usage", ({ actionKind, targetPatch }) => {
    render(<DisplaySettingsHarness
        actionKind={actionKind}
        settings={buildSingleMetricSettings(actionKind, targetPatch)}
        onPatch={() => undefined}
    />);

    assert.notEqual(screen.queryByText(
        /Ranges follow how full the metric is, even when the key shows free capacity\./u,
    ), null);
});

test("used capacity does not show the free-capacity range color explanation", () => {
    render(<DisplaySettingsHarness
        actionKind="memory"
        settings={buildSingleMetricSettings("memory", {
            memory: { usageDisplayMode: "usedCapacity" },
        })}
        onPatch={() => undefined}
    />);

    assert.equal(screen.queryByText(
        /Ranges follow how full the metric is, even when the key shows free capacity\./u,
    ), null);
});

function DisplaySettingsHarness({
    actionKind,
    settings: initialSettings,
    onPatch,
}: {
    readonly actionKind: "memory" | "gpu" | "disk";
    readonly settings: InspectorTestSettings;
    readonly onPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const [settings, setSettings] = useState(initialSettings);
    const client = new TestPropertyInspectorClient({
        actionUuid: `com.ez.sho-metrics.${actionKind}`,
    });

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind,
                    platform: "win32",
                    isWindows: true,
                    settings,
                })}
                isGlobalViewOverrideEnabled={false}
                isGlobalThemeOverrideEnabled={false}
                isGlobalTransparentSurfaceOverrideEnabled={false}
                isGlobalPaintOverrideEnabled={false}
                colorCompensationProfile={DEFAULT_COLOR_COMPENSATION_PROFILE}
                onSettingsPatch={(patch) => {
                    onPatch(patch);
                    setSettings((currentSettings: InspectorTestSettings) =>
                        writeStoredWidgetSettingsPatch(currentSettings, patch));
                }}
                onResetWidgetSettings={() => undefined}
                onOpenColorCompensation={() => undefined}
            />
        </StreamDeckClientProvider>
    );
}

function buildSingleMetricSettings(
    actionKind: ActionKind,
    patch: StoredWidgetSettingsPatch,
): InspectorTestSettings {
    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, actionKind).rawSettings,
        patch,
    ));
}
