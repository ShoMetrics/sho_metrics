import assert from "node:assert/strict";
import {
    type DenseMultiMetricWidget as StoredDenseMultiMetricWidget,
    type HardwareSummaryWidget as StoredHardwareSummaryWidget,
    type MetricSlot as StoredMetricSlot,
    type StackedMetricWidget as StoredStackedMetricWidget,
} from "../../../../generated/proto/shometrics/v1/settings_pb";
import { readStoredWidgetSettings } from "../../codec";

export function readSingleMetricSlot(rawSettings: unknown): StoredMetricSlot | undefined {
    const widget = readStoredWidgetSettings(rawSettings).settings.widget;
    if (widget.case !== "singleMetric") {
        assert.fail(`Expected singleMetric widget, received ${String(widget.case)}`);
    }

    return widget.value.slot;
}

export function readHardwareSummaryWidget(rawSettings: unknown): StoredHardwareSummaryWidget {
    const widget = readStoredWidgetSettings(rawSettings).settings.widget;
    if (widget.case !== "hardwareSummary") {
        assert.fail(`Expected hardwareSummary widget, received ${String(widget.case)}`);
    }

    return widget.value;
}

export function readDenseMultiMetricWidget(rawSettings: unknown): StoredDenseMultiMetricWidget {
    const widget = readStoredWidgetSettings(rawSettings).settings.widget;
    if (widget.case !== "denseMultiMetric") {
        assert.fail(`Expected denseMultiMetric widget, received ${String(widget.case)}`);
    }

    return widget.value;
}

export function readStackedMetricWidget(rawSettings: unknown): StoredStackedMetricWidget {
    const widget = readStoredWidgetSettings(rawSettings).settings.widget;
    if (widget.case !== "stackedMetric") {
        assert.fail(`Expected stackedMetric widget, received ${String(widget.case)}`);
    }

    return widget.value;
}
