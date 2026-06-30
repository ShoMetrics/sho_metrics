import assert from "node:assert/strict";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { test } from "vitest";
import { DEFAULT_COLOR_COMPENSATION_PROFILE } from "../../../color-compensation/types";
import type { WidgetRuntimeCachePatch } from "../../../runtime/widget-runtime-cache";
import { NODE_SYSTEM_SOURCE_ID } from "../../../runtime/sources/source-ids";
import { wallClockNowMilliseconds } from "../../../shared/clock";
import { resolveQuickStartStoredWidgetSettings } from "../../../settings/storage/quick-start-widget-settings";
import {
    writeStoredWidgetSettingsPatch,
    type StoredWidgetSettingsPatch,
} from "../../../settings/storage/patch/widget-settings-patch";
import { readTestSettingsRecord, TestPropertyInspectorClient } from "../../testing/test-property-inspector-client";
import { buildVisibilityContext, type InspectorTestSettings } from "../../testing/test-context";
import type { PropertyInspectorPlatform } from "../../inspector/platform";
import { StreamDeckClientProvider } from "../../stream-deck/stream-deck-client-context";
import { WidgetSettingsTab } from "../tabs/WidgetSettingsTab";

test("CPU metric selector can switch to hardware summary", async () => {
    const user = userEvent.setup();
    const patches: StoredWidgetSettingsPatch[] = [];

    render(<HardwareSummarySettingsHarness
        actionKind="cpu"
        settings={readTestSettingsRecord(resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings)}
        onPatch={(patch) => patches.push(patch)}
    />);

    await user.click(screen.getByRole("combobox", { name: /^CPU Metric:/ }));
    await user.click(screen.getByRole("option", { name: "Triple: Load, Temp, Power..." }));

    await waitFor(() => {
        assert.notEqual(screen.queryByRole("combobox", { name: /^Primary:/ }), null);
    });
    assert.deepEqual(patches.at(-1), {
        hardwareSummary: {
            switchTo: {
                widgetKind: "hardwareSummary",
                domain: "cpu",
            },
        },
    });
});

test("CPU metric selector hides hardware summary when default readings are unsupported", async () => {
    const user = userEvent.setup();

    render(<HardwareSummarySettingsHarness
        actionKind="cpu"
        platform="darwin"
        settings={readTestSettingsRecord(resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings)}
        onPatch={() => undefined}
    />);

    await user.click(screen.getByRole("combobox", { name: /^CPU Metric:/ }));

    assert.equal(screen.queryByRole("option", { name: "Triple: Load, Temp, Power..." }), null);
});

test("GPU metric selector hides hardware summary when default readings are unsupported", async () => {
    const user = userEvent.setup();

    render(<HardwareSummarySettingsHarness
        actionKind="gpu"
        platform="darwin"
        settings={readTestSettingsRecord(resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings)}
        onPatch={() => undefined}
    />);

    await user.click(screen.getByRole("combobox", { name: /^GPU Metric:/ }));

    assert.equal(screen.queryByRole("option", { name: "Triple: Load, Temp, VRAM..." }), null);
});

test("hardware summary reading selector swaps existing readings", async () => {
    const user = userEvent.setup();
    const patches: StoredWidgetSettingsPatch[] = [];

    render(<HardwareSummarySettingsHarness
        actionKind="cpu"
        settings={buildCpuHardwareSummarySettings()}
        onPatch={(patch) => patches.push(patch)}
    />);

    await user.click(screen.getByRole("combobox", { name: /^Secondary 1:/ }));
    await user.click(screen.getByRole("option", { name: "Power" }));

    const orderedReadings = patches.at(-1)?.hardwareSummary?.orderedReadings;
    assert.deepEqual(orderedReadings?.map(reading => reading.kind), ["usage", "power", "temperature"]);
});

test("hardware summary metric selector switches back to a single metric", async () => {
    const user = userEvent.setup();
    const patches: StoredWidgetSettingsPatch[] = [];

    render(<HardwareSummarySettingsHarness
        actionKind="gpu"
        settings={buildGpuVramPrimaryHardwareSummarySettings()}
        onPatch={(patch) => patches.push(patch)}
    />);

    await user.click(screen.getByRole("combobox", { name: /^GPU Metric:/ }));
    await user.click(screen.getByRole("option", { name: "VRAM" }));

    assert.deepEqual(patches.at(-1), {
        hardwareSummary: {
            switchTo: {
                widgetKind: "singleMetric",
                domain: "gpu",
                kind: "vram",
            },
        },
    });
});

test("hardware summary keeps widget polling controls", () => {
    render(<HardwareSummarySettingsHarness
        actionKind="cpu"
        settings={buildCpuHardwareSummarySettings()}
        onPatch={() => undefined}
    />);

    assert.notEqual(screen.queryByRole("combobox", { name: /^Polling Frequency:/ }), null);
});

test("CPU hardware summary opens helper download guidance in the default browser", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.cpu" });

    render(<HardwareSummarySettingsHarness
        actionKind="cpu"
        client={client}
        settings={buildCpuHardwareSummarySettings()}
        onPatch={() => undefined}
    />);

    assert.notEqual(screen.queryByText(/CPU temperature and power require ShoMetrics Helper/), null);

    await user.click(screen.getByRole("link", { name: /Download or update Helper/i }));

    assert.deepEqual(client.sentMessages, [{
        event: "openUrl",
        payload: {
            url: "https://shometrics.github.io/download/",
        },
    }]);
});

test("hardware summary advanced controls render current metric read trace", async () => {
    render(<HardwareSummarySettingsHarness
        actionKind="cpu"
        settings={buildCpuHardwareSummarySettings()}
        runtimeCache={{
            displayedMetricReadTrace: {
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
        }}
        onPatch={() => undefined}
    />);

    assert.notEqual(await screen.findByText(/Current source: Built-in/), null);
});

test("GPU hardware summary opens helper download guidance in the default browser", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({ actionUuid: "com.ez.sho-metrics.gpu" });

    render(<HardwareSummarySettingsHarness
        actionKind="gpu"
        client={client}
        settings={buildGpuVramPrimaryHardwareSummarySettings()}
        runtimeCache={{
            displayedMetricReadTrace: {
                metricKey: "gpu.usage_percent",
                routing: {
                    preferredSourceId: NODE_SYSTEM_SOURCE_ID,
                    selectedSourceId: undefined,
                },
                outcome: {
                    kind: "unavailable",
                    reason: "noSourceReading",
                    lastValueTimestampMilliseconds: undefined,
                },
            },
        }}
        onPatch={() => undefined}
    />);

    assert.notEqual(screen.queryByText(/No GPU value is available from the current source/), null);

    await user.click(screen.getByRole("link", { name: /Download or update Helper/i }));

    assert.deepEqual(client.sentMessages, [{
        event: "openUrl",
        payload: {
            url: "https://shometrics.github.io/download/",
        },
    }]);
});

test("GPU hardware summary hides runtime guidance when values are available", () => {
    render(<HardwareSummarySettingsHarness
        actionKind="gpu"
        settings={buildGpuVramPrimaryHardwareSummarySettings()}
        runtimeCache={{
            displayedMetricReadTrace: {
                metricKey: "gpu.usage_percent",
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
        }}
        onPatch={() => undefined}
    />);

    assert.equal(screen.queryByText(/No GPU value is available from the current source/), null);
});

function HardwareSummarySettingsHarness({
    actionKind,
    client = new TestPropertyInspectorClient({ actionUuid: `com.ez.sho-metrics.${actionKind}` }),
    platform = "win32",
    settings: initialSettings,
    runtimeCache,
    onPatch,
}: {
    readonly actionKind: "cpu" | "gpu";
    readonly client?: TestPropertyInspectorClient;
    readonly platform?: PropertyInspectorPlatform;
    readonly settings: InspectorTestSettings;
    readonly runtimeCache?: WidgetRuntimeCachePatch;
    readonly onPatch: (patch: StoredWidgetSettingsPatch) => void;
}): React.JSX.Element {
    const [settings, setSettings] = useState<InspectorTestSettings>(initialSettings);

    return (
        <StreamDeckClientProvider client={client}>
            <WidgetSettingsTab
                context={buildVisibilityContext({
                    actionKind,
                    platform,
                    isWindows: platform === "win32",
                    settings,
                    runtimeCache,
                })}
                isGlobalViewOverrideEnabled={false}
                isGlobalThemeOverrideEnabled={false}
                isGlobalTransparentSurfaceOverrideEnabled={false}
                isGlobalPaintOverrideEnabled={false}
                colorCompensationProfile={DEFAULT_COLOR_COMPENSATION_PROFILE}
                onSettingsPatch={(patch) => {
                    onPatch(patch);
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

function buildCpuHardwareSummarySettings(): InspectorTestSettings {
    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings,
        {
            hardwareSummary: {
                switchTo: {
                    widgetKind: "hardwareSummary",
                    domain: "cpu",
                },
            },
        },
    ));
}

function buildGpuVramPrimaryHardwareSummarySettings(): InspectorTestSettings {
    return readTestSettingsRecord(writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings,
        {
            hardwareSummary: {
                switchTo: {
                    widgetKind: "hardwareSummary",
                    domain: "gpu",
                },
                orderedReadings: [
                    { kind: "vram" },
                    { kind: "temperature", maximumCelsius: 100, unit: "celsius" },
                    { kind: "usage" },
                ],
            },
        },
    ));
}
