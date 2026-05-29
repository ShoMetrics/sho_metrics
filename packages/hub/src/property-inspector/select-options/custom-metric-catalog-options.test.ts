import assert from "node:assert/strict";
import test from "node:test";
import { MetricUnit } from "../../runtime/sources/metric-source";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
} from "../../runtime/sources/source-client";
import { buildCustomMetricCatalogOptions } from "./custom-metric-catalog-options";

test("catalog options stay unselected until the user chooses a type", () => {
    const descriptors = [
        buildDescriptor({
            metricId: "lhm.sensor:/cpu/0/temperature/package",
            sourceSensorId: "cpu-package-temp",
            hardwareId: "cpu0",
            hardwareName: "Intel Core",
            hardwareType: "Cpu",
            sensorName: "CPU Package",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
        buildDescriptor({
            metricId: "lhm.sensor:/cpu/0/load/total",
            sourceSensorId: "cpu-total-load",
            hardwareId: "cpu0",
            hardwareName: "Intel Core",
            hardwareType: "Cpu",
            sensorName: "CPU Total",
            sourceSensorType: "Load",
            unit: MetricUnit.PERCENT,
        }),
    ];

    const initialOptions = buildCustomMetricCatalogOptions(descriptors);
    const cpuOptions = buildCustomMetricCatalogOptions(descriptors, { typeId: "cpu" });

    assert.deepEqual(initialOptions.resolvedSelection, {
        typeId: "",
        hardwareId: "",
        readingId: "",
        metricId: "",
    });
    assert.equal(initialOptions.selectedMetric, undefined);
    assert.equal(cpuOptions.resolvedSelection.metricId, "lhm.sensor:/cpu/0/temperature/package");
    assert.deepEqual(cpuOptions.readingOptions.map(option => option.label), ["Temperature", "Usage"]);
});

test("catalog options keep raw source sensors over duplicate stable aliases", () => {
    const descriptors = [
        buildDescriptor({
            metricId: "cpu.temperature",
            metricIdKind: MetricIdKind.STABLE_ALIAS,
            sourceSensorId: "cpu-package-temp",
            hardwareId: "cpu0",
            hardwareName: "Intel Core",
            hardwareType: "Cpu",
            sensorName: "CPU Package",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
        buildDescriptor({
            metricId: "lhm.sensor:/cpu/0/temperature/package",
            sourceSensorId: "cpu-package-temp",
            hardwareId: "cpu0",
            hardwareName: "Intel Core",
            hardwareType: "Cpu",
            sensorName: "CPU Package",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
    ];

    const options = buildCustomMetricCatalogOptions(descriptors, { typeId: "cpu" });

    assert.equal(options.selectedMetric?.metricId, "lhm.sensor:/cpu/0/temperature/package");
    assert.deepEqual(options.metricOptions.map(option => option.value), ["lhm.sensor:/cpu/0/temperature/package"]);
});

test("catalog options disambiguate duplicate hardware and metric labels deterministically", () => {
    const descriptors = [
        buildDescriptor({
            metricId: "lhm.sensor:/gpu/1/temperature/core",
            sourceSensorId: "gpu1-temp",
            hardwareId: "gpu1",
            hardwareName: "NVIDIA RTX",
            hardwareType: "GpuNvidia",
            sensorName: "GPU Core",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
        buildDescriptor({
            metricId: "lhm.sensor:/gpu/0/temperature/core",
            sourceSensorId: "gpu0-temp",
            hardwareId: "gpu0",
            hardwareName: "NVIDIA RTX",
            hardwareType: "GpuNvidia",
            sensorName: "GPU Core",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
    ];

    const options = buildCustomMetricCatalogOptions(descriptors, {
        metricId: "lhm.sensor:/gpu/1/temperature/core",
    });

    assert.deepEqual(options.hardwareOptions.map(option => option.label), ["NVIDIA RTX", "NVIDIA RTX #2"]);
    assert.equal(options.selectedMetric?.label, "GPU Core (NVIDIA RTX #2)");
});

test("catalog options keep noisy network adapters selectable but sort them last", () => {
    const descriptors = [
        buildDescriptor({
            metricId: "lhm.sensor:/network/wfp/load",
            sourceSensorId: "network-wfp-load",
            hardwareId: "network-wfp",
            hardwareName: "WFP Native MAC Layer LightWeight Filter",
            hardwareType: "Network",
            sensorName: "Network Utilization",
            sourceSensorType: "Load",
            unit: MetricUnit.PERCENT,
        }),
        buildDescriptor({
            metricId: "lhm.sensor:/network/ethernet/load",
            sourceSensorId: "network-ethernet-load",
            hardwareId: "network-ethernet",
            hardwareName: "Intel Ethernet",
            hardwareType: "Network",
            sensorName: "Network Utilization",
            sourceSensorType: "Load",
            unit: MetricUnit.PERCENT,
        }),
    ];

    const options = buildCustomMetricCatalogOptions(descriptors, { typeId: "network" });

    assert.deepEqual(options.hardwareOptions.map(option => option.label), [
        "Intel Ethernet",
        "WFP Native MAC Layer LightWeight Filter",
    ]);
});

test("catalog options filter non-scalar descriptors and sanitize labels", () => {
    const descriptors = [
        buildDescriptor({
            metricId: "text.metric",
            valueKind: MetricValueKind.TEXT,
            sourceSensorId: "text",
        }),
        buildDescriptor({
            metricId: "lhm.sensor:/board/temperature/1",
            sourceSensorId: "board-temp",
            hardwareId: "board0",
            hardwareName: "Board\u000aName",
            hardwareType: "Mainboard",
            sensorName: "Temperature\u0007 #1",
            sourceSensorType: "Temperature",
            unit: MetricUnit.CELSIUS,
        }),
    ];

    const options = buildCustomMetricCatalogOptions(descriptors, { typeId: "other" });

    assert.deepEqual(options.typeOptions.map(option => option.label), ["Choose type", "Other"]);
    assert.deepEqual(options.hardwareOptions.map(option => option.label), ["BoardName"]);
    assert.equal(options.selectedMetric?.label, "Temperature #1");
});

test("catalog options fall back to empty text for unknown metric units", () => {
    const descriptors = [
        buildDescriptor({
            metricId: "future-unit.metric",
            unit: 999_999 as MetricUnit,
        }),
    ];

    const options = buildCustomMetricCatalogOptions(descriptors, { typeId: "cpu" });

    assert.equal(options.selectedMetric?.unit, "");
});

interface MetricDescriptorFixture {
    readonly metricId?: string;
    readonly valueKind?: MetricValueKind;
    readonly unit?: MetricUnit;
    readonly metricIdKind?: MetricIdKind;
    readonly pollingGroupId?: string;
    readonly sourceSensorId?: string;
    readonly hardwareId?: string;
    readonly hardwareName?: string;
    readonly hardwareType?: string;
    readonly sensorName?: string;
    readonly sourceSensorType?: string;
}

function buildDescriptor(overrides: MetricDescriptorFixture = {}): MetricDescriptor {
    return {
        metricId: overrides.metricId ?? "metric",
        valueKind: overrides.valueKind ?? MetricValueKind.SCALAR,
        unit: overrides.unit ?? MetricUnit.UNSPECIFIED,
        metricIdKind: overrides.metricIdKind ?? MetricIdKind.SOURCE_SENSOR,
        pollingGroupId: overrides.pollingGroupId ?? "polling-group",
        rawSensorIdentity: {
            sourceSensorId: overrides.sourceSensorId ?? "sensor",
            hardwareId: overrides.hardwareId ?? "hardware",
            hardwareName: overrides.hardwareName ?? "Hardware",
            hardwareType: overrides.hardwareType ?? "Cpu",
            sensorName: overrides.sensorName ?? "Sensor",
            sourceSensorType: overrides.sourceSensorType ?? "Load",
        },
    };
}
