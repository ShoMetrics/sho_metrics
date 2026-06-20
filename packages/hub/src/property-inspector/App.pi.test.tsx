import { strict as assert } from "node:assert";
import { test } from "node:test";
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    DEFAULT_COLOR_COMPENSATION_PROFILE,
    type ColorCompensationProfile,
} from "../color-compensation/types";
import { MetricUnit } from "../runtime/sources/metric-source";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
} from "../runtime/sources/source-client";
import { WIDGET_RUNTIME_CACHE_MESSAGE_TYPE } from "../runtime/widget-runtime-cache";
import {
    requireResolvedSingleMetricWidget,
    type ResolvedMetricTarget,
} from "../settings/resolved-settings";
import { readStoredGlobalSettings, readStoredWidgetSettings } from "../settings/storage/codec";
import {
    readStoredColorCompensationProfile,
    writeStoredColorCompensationProfile,
} from "../settings/storage/color-compensation-settings";
import { resolveQuickStartStoredWidgetSettings } from "../settings/storage/quick-start-widget-settings";
import { resolveStoredWidgetSettings } from "../settings/storage/resolver";
import { STREAM_DECK_ACTION_UUID_BY_KIND, type ActionKind } from "../shared/stream-deck-actions";
import { App } from "./App";
import { I18nProvider } from "../i18n/react";
import {
    readTestSettingsRecord,
    TestPropertyInspectorClient,
} from "./testing/test-property-inspector-client";

test("app loads widget settings and writes a sparse CPU metric patch through Stream Deck", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu,
        settings: buildQuickStartSettingsRecord("cpu"),
    });

    renderApp(client);

    const cpuMetricSelect = await screen.findByRole("combobox", { name: /cpu metric/i });
    await user.click(cpuMetricSelect);
    await user.click(screen.getByRole("option", { name: "Temperature" }));

    await waitFor(() => assert.equal(client.setSettingsCalls.length, 1));

    const target = resolveWidgetTarget(client.setSettingsCalls[0]);
    assert.equal(target.domain, "cpu");
    assert.equal(target.reading.kind, "temperature");
});

test("app updates catalog helper guidance and picker options from runtime cache messages", async () => {
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.catalog,
        settings: buildQuickStartSettingsRecord("catalog"),
    });

    renderApp(client);

    await screen.findByText("Loading metrics...");

    await act(async () => {
        client.dispatchSendToPropertyInspector({
            type: WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
            patch: {
                catalogMetricDescriptorLoadState: "ready",
                catalogMetricDescriptorSourceStatus: {
                    state: "unavailable",
                    reason: "helperNotInstalled",
                },
            },
        });
    });

    await screen.findByText("Install ShoMetrics Helper to use advanced sensors.");

    await act(async () => {
        client.dispatchSendToPropertyInspector({
            type: WIDGET_RUNTIME_CACHE_MESSAGE_TYPE,
            patch: {
                availableCatalogMetricDescriptors: [
                    buildMetricDescriptor({
                        metricId: "lhm.sensor:/cpu/0/load/total",
                        sourceSensorId: "lhm.sensor:/cpu/0/load/total",
                        hardwareId: "/cpu/0",
                        hardwareName: "CPU",
                        hardwareType: "cpu",
                        sensorName: "CPU Total",
                        sourceSensorType: "load",
                    }),
                    buildMetricDescriptor({
                        metricId: "lhm.sensor:/gpu/0/load/core",
                        sourceSensorId: "lhm.sensor:/gpu/0/load/core",
                        hardwareId: "/gpu/0",
                        hardwareName: "GPU",
                        hardwareType: "gpu",
                        sensorName: "GPU Core",
                        sourceSensorType: "load",
                    }),
                ],
                catalogMetricDescriptorLoadState: "ready",
                catalogMetricDescriptorSourceStatus: {
                    state: "available",
                },
            },
        });
    });

    await screen.findByRole("combobox", { name: /type/i });
    assert.equal(screen.queryByText("Install ShoMetrics Helper to use advanced sensors."), null);
});

test("app color compensation wizard saves the profile through global settings", async () => {
    const user = userEvent.setup();
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu,
        settings: buildQuickStartSettingsRecord("cpu"),
    });

    renderApp(client);

    await user.click(await screen.findByRole("button", { name: "Color Compensation" }));
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "I See It" }));

    fireEvent.change(screen.getByRole("slider", { name: "Color Strength" }), {
        target: { value: "4" },
    });
    await user.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByRole("slider", { name: "Midtones" }), {
        target: { value: "-2" },
    });
    await user.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByRole("slider", { name: "Dark Detail" }), {
        target: { value: "3" },
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => assert.equal(client.setGlobalSettingsCalls.length, 1));

    assert.deepEqual(readSavedColorCompensationProfile(client.setGlobalSettingsCalls[0]), {
        brightnessAdjustment: 0,
        gammaAdjustment: -2,
        saturationAdjustment: 4,
        shadowAdjustment: 3,
    });
});

test("app color compensation wizard resets a saved profile through global settings", async () => {
    const user = userEvent.setup();
    const savedProfile: ColorCompensationProfile = {
        brightnessAdjustment: 1,
        gammaAdjustment: 2,
        saturationAdjustment: 3,
        shadowAdjustment: 4,
    };
    const client = new TestPropertyInspectorClient({
        actionUuid: STREAM_DECK_ACTION_UUID_BY_KIND.cpu,
        settings: buildQuickStartSettingsRecord("cpu"),
        globalSettings: readTestSettingsRecord(writeStoredColorCompensationProfile(undefined, savedProfile)),
    });

    renderApp(client);

    // The checkmark is part of the accessible name when a saved profile exists.
    await user.click(await screen.findByRole("button", { name: "Color Compensation \u2713" }));
    await user.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() => assert.equal(client.setGlobalSettingsCalls.length, 1));

    assert.deepEqual(
        readSavedColorCompensationProfile(client.setGlobalSettingsCalls[0]),
        DEFAULT_COLOR_COMPENSATION_PROFILE,
    );
});

function buildQuickStartSettingsRecord(actionKind: ActionKind) {
    return readTestSettingsRecord(
        resolveQuickStartStoredWidgetSettings(undefined, actionKind).rawSettings,
    );
}

function renderApp(client: TestPropertyInspectorClient): void {
    render(
        <I18nProvider locale="en">
            <App client={client} />
        </I18nProvider>,
    );
}

function resolveWidgetTarget(rawSettings: unknown): ResolvedMetricTarget {
    const settings = resolveStoredWidgetSettings({
        storedWidgetSettings: readStoredWidgetSettings(rawSettings).settings,
    });

    return requireResolvedSingleMetricWidget(settings).slot.metric.target;
}

function readSavedColorCompensationProfile(rawGlobalSettings: unknown): ColorCompensationProfile {
    return readStoredColorCompensationProfile(readStoredGlobalSettings(rawGlobalSettings).settings);
}

interface MetricDescriptorFixture {
    readonly metricId: string;
    readonly sourceSensorId: string;
    readonly hardwareId: string;
    readonly hardwareName: string;
    readonly hardwareType: string;
    readonly sensorName: string;
    readonly sourceSensorType: string;
}

function buildMetricDescriptor(fixture: MetricDescriptorFixture): MetricDescriptor {
    return {
        metricId: fixture.metricId,
        metricIdKind: MetricIdKind.SOURCE_NATIVE,
        valueKind: MetricValueKind.SCALAR,
        unit: MetricUnit.PERCENT,
        pollingGroupId: "polling-group",
        rawSensorIdentity: {
            sourceSensorId: fixture.sourceSensorId,
            hardwareId: fixture.hardwareId,
            hardwareName: fixture.hardwareName,
            hardwareType: fixture.hardwareType,
            sensorName: fixture.sensorName,
            sourceSensorType: fixture.sourceSensorType,
        },
    };
}
