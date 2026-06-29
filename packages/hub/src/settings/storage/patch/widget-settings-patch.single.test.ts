import assert from "node:assert/strict";
import { test } from "vitest";
import {
    CatalogMetricCategory as StoredCatalogMetricCategory,
    CatalogMetricReadingKind as StoredCatalogMetricReadingKind,
    ColorMode as StoredColorMode,
    MetricSourcePolicy_FailureMode as StoredSourceFailureMode,
    MetricTheme as StoredMetricTheme,
    NetworkDisplaySettings_UnitBase as StoredNetworkUnitBase,
    NetworkMetricTarget_Traffic_Direction as StoredNetworkDirection,
    SystemPeripheralBindingTransport as StoredSystemPeripheralBindingTransport,
    SystemPeripheralReceiverKind as StoredSystemPeripheralReceiverKind,
    TerminalPalettePreset as StoredTerminalPalettePreset,
    TerminalThemeVariant as StoredTerminalThemeVariant,
    TemperatureUnit as StoredTemperatureUnit,
    TextViewVariant as StoredTextViewVariant,
} from "../../../generated/proto/shometrics/v1/settings_pb";
import { MetricUnit } from "../../../runtime/sources/metric-source";
import { resolveQuickStartStoredWidgetSettings } from "../quick-start-widget-settings";
import { writeStoredWidgetSettingsPatch } from "./widget-settings-patch";
import { readSingleMetricSlot } from "./testing/widget-settings-patch-test-helpers";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
} from "../../../runtime/sources/source-ids";

test("widget patch fails before quick-start metric initialization", () => {
    assert.throws(
        () => writeStoredWidgetSettingsPatch(undefined, {
            network: {
                direction: "download",
            },
        }),
        /quick-start widget initialization/,
    );
});

test("widget patch fails when the patch domain does not match the current metric", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    assert.throws(
        () => writeStoredWidgetSettingsPatch(cpuSettings, {
            network: {
                direction: "download",
            },
        }),
        /non-network metric/,
    );
});

test("widget patch fails when a catalog patch targets a non-catalog metric", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    assert.throws(
        () => writeStoredWidgetSettingsPatch(cpuSettings, {
            catalog: {
                metricId: "source.sensor:/gpu/temperature",
            },
        }),
        /non-catalog metric/,
    );
});

test("widget patch updates catalog metric target", () => {
    const catalogSettings = resolveQuickStartStoredWidgetSettings(undefined, "catalog").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(catalogSettings, {
        catalog: {
            metricId: "source.sensor:/gpu/temperature",
            detectedLabel: "GPU Hot Spot",
            detectedUnit: MetricUnit.CELSIUS,
            detectedCategory: "gpu",
            detectedReadingKind: "temperature",
            customLabel: "Hot",
            customMaximumValue: 120,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "catalog");
    if (target?.case === "catalog") {
        assert.equal(target.value.metricId, "source.sensor:/gpu/temperature");
        assert.equal(target.value.detectedLabel, "GPU Hot Spot");
        assert.equal(target.value.detectedUnit, MetricUnit.CELSIUS);
        assert.equal(target.value.detectedCategory, StoredCatalogMetricCategory.GPU);
        assert.equal(target.value.detectedReadingKind, StoredCatalogMetricReadingKind.TEMPERATURE);
        assert.equal(target.value.customLabel, "Hot");
        assert.equal(target.value.customMaximumValue, 120);
    }
});

test("widget patch can clear catalog display hints and overrides", () => {
    const catalogSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "catalog").rawSettings,
        {
            catalog: {
                metricId: "source.sensor:/gpu/temperature",
                detectedLabel: "GPU Hot Spot",
                detectedUnit: MetricUnit.CELSIUS,
                detectedCategory: "gpu",
                detectedReadingKind: "temperature",
                customLabel: "Hot",
                customMaximumValue: 120,
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(catalogSettings, {
        catalog: {
            detectedLabel: undefined,
            detectedUnit: undefined,
            detectedCategory: undefined,
            detectedReadingKind: undefined,
            customLabel: undefined,
            customMaximumValue: undefined,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "catalog");
    if (target?.case === "catalog") {
        assert.equal(target.value.metricId, "source.sensor:/gpu/temperature");
        assert.equal(target.value.detectedLabel, undefined);
        assert.equal(target.value.detectedUnit, undefined);
        assert.equal(target.value.detectedCategory, undefined);
        assert.equal(target.value.detectedReadingKind, undefined);
        assert.equal(target.value.customLabel, undefined);
        assert.equal(target.value.customMaximumValue, undefined);
    }
});

test("widget patch fails when a Custom Metric patch targets a non-Custom Metric", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    assert.throws(
        () => writeStoredWidgetSettingsPatch(cpuSettings, {
            customMetric: {
                url: "https://api.example.com/current",
            },
        }),
        /non-Custom Metric/,
    );
});

test("widget patch updates Custom Metric user intent", () => {
    const customMetricSettings = resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(customMetricSettings, {
        customMetric: {
            url: "https://api.example.com/current?city=tokyo",
            userIntent: "Display current temperature",
            jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "custom");
    if (target?.case === "custom") {
        assert.equal(target.value.source.case, "http");
        if (target.value.source.case === "http") {
            assert.equal(target.value.source.value.plan.case, "singleRequest");
            if (target.value.source.value.plan.case === "singleRequest") {
                assert.equal(target.value.source.value.plan.value.url, "https://api.example.com/current?city=tokyo");
                assert.equal(target.value.source.value.plan.value.userIntent, "Display current temperature");
                assert.equal(
                    target.value.source.value.plan.value.jqTransform,
                    "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
                );
            }
        }
    }
});

test("widget patch writes Custom Metric HTTP request settings", () => {
    const customMetricSettings = resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(customMetricSettings, {
        customMetric: {
            timeoutSeconds: 10,
            retryCount: 2,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "custom");
    if (target?.case === "custom") {
        assert.equal(target.value.source.case, "http");
        if (target.value.source.case === "http") {
            assert.equal(target.value.source.value.plan.case, "singleRequest");
            if (target.value.source.value.plan.case === "singleRequest") {
                assert.equal(target.value.source.value.plan.value.requestSettings?.timeoutSeconds, 10);
                assert.equal(target.value.source.value.plan.value.requestSettings?.retryCount, 2);
            }
        }
    }
});

test("widget patch writes and clears Custom Metric HTTP auth reference", () => {
    const customMetricSettings = resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings;

    const settingsWithAuth = writeStoredWidgetSettingsPatch(customMetricSettings, {
        customMetric: {
            credentialId: "credential-1",
            allowPublicHttpCredentials: true,
        },
    });
    const clearedSettings = writeStoredWidgetSettingsPatch(settingsWithAuth, {
        customMetric: {
            credentialId: undefined,
            allowPublicHttpCredentials: undefined,
        },
    });

    const targetWithAuth = readSingleMetricSlot(settingsWithAuth)?.metric?.target;
    assert.equal(targetWithAuth?.case, "custom");
    if (targetWithAuth?.case === "custom") {
        assert.equal(targetWithAuth.value.source.case, "http");
        if (targetWithAuth.value.source.case === "http") {
            assert.equal(targetWithAuth.value.source.value.plan.case, "singleRequest");
            if (targetWithAuth.value.source.value.plan.case === "singleRequest") {
                assert.equal(targetWithAuth.value.source.value.plan.value.auth?.credentialId, "credential-1");
                assert.equal(targetWithAuth.value.source.value.plan.value.auth?.allowPublicHttpCredentials, true);
            }
        }
    }

    const clearedTarget = readSingleMetricSlot(clearedSettings)?.metric?.target;
    assert.equal(clearedTarget?.case, "custom");
    if (clearedTarget?.case === "custom") {
        assert.equal(clearedTarget.value.source.case, "http");
        if (clearedTarget.value.source.case === "http") {
            assert.equal(clearedTarget.value.source.value.plan.case, "singleRequest");
            if (clearedTarget.value.source.value.plan.case === "singleRequest") {
                assert.equal(clearedTarget.value.source.value.plan.value.auth, undefined);
            }
        }
    }
});

test("widget patch can clear Custom Metric user intent", () => {
    const customMetricSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings,
        {
            customMetric: {
                url: "https://api.example.com/current?city=tokyo",
                userIntent: "Display current temperature",
                jqTransform: "{ metric: { label: \"TEMP\", value: .temp, unit: \"celsius\" } }",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(customMetricSettings, {
        customMetric: {
            url: undefined,
            userIntent: undefined,
            jqTransform: undefined,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "custom");
    if (target?.case === "custom") {
        assert.equal(target.value.source.case, "http");
        if (target.value.source.case === "http") {
            assert.equal(target.value.source.value.plan.case, "singleRequest");
            if (target.value.source.value.plan.case === "singleRequest") {
                assert.equal(target.value.source.value.plan.value.url, undefined);
                assert.equal(target.value.source.value.plan.value.userIntent, undefined);
                assert.equal(target.value.source.value.plan.value.jqTransform, undefined);
            }
        }
    }
});

test("widget patch updates Custom Metric icon without creating an HTTP source", () => {
    const customMetricSettings = resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(customMetricSettings, {
        customMetric: {
            customIconId: "cloud-sun",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "custom");
    if (target?.case === "custom") {
        assert.equal(target.value.customIcon?.id, "cloud-sun");
        assert.equal(target.value.source.case, undefined);
    }
});

test("widget patch clears Custom Metric icon", () => {
    const customMetricSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "customMetric").rawSettings,
        {
            customMetric: {
                customIconId: "cloud-sun",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(customMetricSettings, {
        customMetric: {
            customIconId: undefined,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "custom");
    if (target?.case === "custom") {
        assert.equal(target.value.customIcon, undefined);
    }
});

test("widget patch updates GPU reading within the GPU action domain", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        gpu: {
            kind: "power",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "gpu");
    if (target?.case === "gpu") {
        assert.equal(target.value.reading.case, "power");
    }
});

test("widget patch writes black-white color mode", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                flat: {
                    paint: {
                        colorMode: "black-white",
                    },
                },
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.flat?.paint?.colorMode, StoredColorMode.BLACK_WHITE);
});

test("widget patch switches network traffic to ping and writes target host", () => {
    const networkSettings = resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(networkSettings, {
        network: {
            kind: "ping",
            pingTargetHost: "https://Example.COM/path?q=1",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "network");
    if (target?.case === "network") {
        assert.equal(target.value.reading.case, "ping");
        assert.equal(target.value.reading.value?.targetHost, "example.com");
    }
});

test("widget patch switches network ping to traffic and writes traffic settings", () => {
    const pingSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            network: {
                kind: "ping",
                pingTargetHost: "example.com",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(pingSettings, {
        network: {
            kind: "traffic",
            direction: "download",
            interfaceId: "Ethernet",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "network");
    if (target?.case === "network") {
        assert.equal(target.value.reading.case, "traffic");
        assert.equal(target.value.reading.value?.direction, StoredNetworkDirection.DOWNLOAD);
        assert.equal(target.value.reading.value?.interfaceId, "Ethernet");
    }
});

test("widget patch keeps network display overrides traffic-only", () => {
    const networkSettings = resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings;

    const pingSettings = writeStoredWidgetSettingsPatch(networkSettings, {
        network: {
            kind: "ping",
            pingTargetHost: "example.com",
        },
    });
    const trafficSettings = writeStoredWidgetSettingsPatch(networkSettings, {
        network: {
            unitBase: "bit",
        },
    });

    const pingOverrides = readSingleMetricSlot(pingSettings)?.overrides;
    const trafficOverrides = readSingleMetricSlot(trafficSettings)?.overrides;

    assert.equal(pingOverrides?.network, undefined);
    assert.equal(trafficOverrides?.network?.unitBase, StoredNetworkUnitBase.BIT);
});

test("widget patch does not write traffic display overrides while stored network target is ping", () => {
    const pingSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "network").rawSettings,
        {
            network: {
                kind: "ping",
                pingTargetHost: "example.com",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(pingSettings, {
        network: {
            unitBase: "bit",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "network");
    if (target?.case === "network") {
        assert.equal(target.value.reading.case, "ping");
        assert.equal(target.value.reading.value?.targetHost, "example.com");
    }
    assert.equal(readSingleMetricSlot(nextSettings)?.overrides?.network, undefined);
});

test("widget patch updates CPU reading within the CPU action domain", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        cpu: {
            kind: "temperature",
            temperatureUnit: "fahrenheit",
            maximumTemperatureCelsius: 95,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "cpu");
    if (target?.case === "cpu") {
        assert.equal(target.value.reading.case, "temperature");
        assert.equal(target.value.reading.value?.temperatureUnit, StoredTemperatureUnit.FAHRENHEIT);
        assert.equal(target.value.reading.value?.maximumTemperatureCelsius, 95);
    }
});

test("widget patch writes sparse CPU target changes without resolved defaults", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        cpu: {
            kind: "temperature",
        },
    });

    assert.deepEqual(nextSettings, {
        singleMetric: {
            slot: {
                metric: {
                    cpu: {
                        temperature: {},
                    },
                },
            },
        },
    });
});

test("widget patch keeps disk volume id on the usage reading only", () => {
    const diskSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "disk").rawSettings,
        {
            disk: {
                volumeId: "E:\\",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(diskSettings, {
        disk: {
            kind: "throughput",
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "disk");
    if (target?.case === "disk") {
        assert.equal(target.value.reading.case, "throughput");
    }
});

test("widget patch writes optional CPU power maximum", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        cpu: {
            kind: "power",
            maximumPowerWatts: 180,
        },
    });

    const target = readSingleMetricSlot(nextSettings)?.metric?.target;
    assert.equal(target?.case, "cpu");
    if (target?.case === "cpu") {
        assert.equal(target.value.reading.case, "power");
        assert.equal(target.value.reading.value?.maximumPowerWatts, 180);
    }
});

test("widget patch replaces metric source policy with helper preference and fallback", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
            fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        },
    });

    const sourcePolicy = readSingleMetricSlot(nextSettings)?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID]);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch replaces metric source policy with node preference and fallback", () => {
    const gpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
            fallbackSourceProfileIds: [BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID],
            failureMode: "useFallback",
        },
    });

    const sourcePolicy = readSingleMetricSlot(nextSettings)?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, [BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID]);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.USE_FALLBACK);
});

test("widget patch clears source policy fallback state when returning to auto", () => {
    const gpuSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "gpu").rawSettings,
        {
            source: {
                primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
                fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
                failureMode: "useFallback",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(gpuSettings, {
        source: {
            primarySourceProfileId: undefined,
            fallbackSourceProfileIds: [],
            failureMode: "showUnavailable",
        },
    });

    const sourcePolicy = readSingleMetricSlot(nextSettings)?.metric?.sourcePolicy;
    assert.equal(sourcePolicy?.primarySourceProfileId, undefined);
    assert.deepEqual(sourcePolicy?.fallbackSourceProfileIds, []);
    assert.equal(sourcePolicy?.failureMode, StoredSourceFailureMode.SHOW_UNAVAILABLE);
});

test("widget patch writes terminal theme", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.selectedTheme, StoredMetricTheme.TERMINAL);
});

test("widget patch writes pixel window theme", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "pixel-window",
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.selectedTheme, StoredMetricTheme.PIXEL_WINDOW);
});

test("widget patch writes text view variant", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            view: {
                selectedView: "text",
                textVariant: "title-card",
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.view?.textVariant, StoredTextViewVariant.TITLE_CARD);
});

test("widget patch writes terminal variant", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
                terminal: {
                    variant: "vintage",
                },
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.terminal?.variant, StoredTerminalThemeVariant.VINTAGE);
});

test("widget patch writes terminal palette", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            theme: {
                selectedTheme: "terminal",
                terminal: {
                    paint: {
                        preset: "amber",
                    },
                },
            },
        },
    });

    const appearance = readSingleMetricSlot(nextSettings)?.overrides?.appearance;
    assert.equal(appearance?.theme?.terminal?.paint?.preset, StoredTerminalPalettePreset.AMBER);
});

test("widget patch writes widget transparent surface settings", () => {
    const cpuSettings = resolveQuickStartStoredWidgetSettings(undefined, "cpu").rawSettings;

    const nextSettings = writeStoredWidgetSettingsPatch(cpuSettings, {
        appearance: {
            transparentSurface: {
                enabled: true,
                backgroundOpacityPercent: 10,
                textOutlinePercent: 20,
                shapeOutlinePercent: 30,
            },
        },
    });

    const transparentSurface = readSingleMetricSlot(nextSettings)?.overrides?.appearance?.transparentSurface;

    assert.equal(transparentSurface?.enabled, true);
    assert.equal(transparentSurface?.backgroundOpacityPercent, 10);
    assert.equal(transparentSurface?.textOutlinePercent, 20);
    assert.equal(transparentSurface?.shapeOutlinePercent, 30);
});

test("widget patch writes selected System peripheral battery identity", () => {
    const nextSettings = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "system").rawSettings,
        {
            system: {
                peripheralIdentity: {
                    evidence: {
                        kind: "vendorHid",
                        vendorId: 0x046D,
                        productId: 0xC548,
                        manufacturer: "Logitech",
                        productName: "MX Master 4",
                        serialNumber: undefined,
                        interfaceNumber: 2,
                        usagePage: 0xFF00,
                        usageId: undefined,
                        bindingTransport: "usbReceiver",
                        receiverKind: "bolt",
                        vendorUnitId: "unit-2",
                        modelId: "mx-master-4",
                        receiverSlot: 2,
                    },
                },
                detectedPeripheralDisplayName: "MX Master 4",
                customLabel: "Mouse",
                customIconId: "cloud-sun",
            },
        },
    );
    const target = readSingleMetricSlot(nextSettings)?.metric?.target;

    assert.equal(target?.case, "system");
    if (target?.case === "system") {
        assert.equal(target.value.reading.case, "battery");
        const identity = target.value.reading.value.peripheralIdentity;
        assert.equal(identity?.evidence.case, "vendorHidIdentity");
        const vendorHidIdentity = identity?.evidence.case === "vendorHidIdentity"
            ? identity.evidence.value
            : undefined;
        assert.equal(vendorHidIdentity?.vendorId, 0x046D);
        assert.equal(vendorHidIdentity?.productId, 0xC548);
        assert.equal(vendorHidIdentity?.manufacturer, "Logitech");
        assert.equal(vendorHidIdentity?.productName, "MX Master 4");
        assert.equal(vendorHidIdentity?.interfaceNumber, 2);
        assert.equal(vendorHidIdentity?.usagePage, 0xFF00);
        assert.equal(vendorHidIdentity?.bindingTransport, StoredSystemPeripheralBindingTransport.USB_RECEIVER);
        assert.equal(vendorHidIdentity?.receiverKind, StoredSystemPeripheralReceiverKind.BOLT);
        assert.equal(vendorHidIdentity?.vendorUnitId, "unit-2");
        assert.equal(vendorHidIdentity?.modelId, "mx-master-4");
        assert.equal(vendorHidIdentity?.receiverSlot, 2);
        assert.equal(target.value.reading.value.detectedPeripheralDisplayName, "MX Master 4");
        assert.equal(target.value.reading.value.customLabel, "Mouse");
        assert.equal(target.value.reading.value.customIcon?.id, "cloud-sun");
    }
});

test("widget patch clears System battery icon", () => {
    const settingsWithIcon = writeStoredWidgetSettingsPatch(
        resolveQuickStartStoredWidgetSettings(undefined, "system").rawSettings,
        {
            system: {
                customIconId: "cloud-sun",
            },
        },
    );

    const nextSettings = writeStoredWidgetSettingsPatch(settingsWithIcon, {
        system: {
            customIconId: undefined,
        },
    });
    const target = readSingleMetricSlot(nextSettings)?.metric?.target;

    assert.equal(target?.case, "system");
    if (target?.case === "system") {
        assert.equal(target.value.reading.case, "battery");
        assert.equal(target.value.reading.value.customIcon, undefined);
    }
});
