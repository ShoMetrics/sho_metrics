import { create } from "@bufbuild/protobuf";
import {
    CatalogMetricTargetSchema,
    CpuMetricTargetSchema,
    CpuMetricTarget_UsageSchema,
    CustomMetricTargetSchema,
    DiskMetricTargetSchema,
    GpuMetricTargetSchema,
    MemoryMetricTarget_UsageSchema,
    MemoryMetricTargetSchema,
    MetricSelectionSchema,
    MetricSlotSchema,
    NetworkMetricTargetSchema,
    NetworkMetricTarget_TrafficSchema,
    SingleMetricWidgetSchema,
    SystemBatteryMetricTargetSchema,
    SystemMetricTargetSchema,
    type MetricSelection as StoredMetricSelection,
    type SingleMetricWidget as StoredSingleMetricWidget,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import type { ResolvedMetricTarget } from "../../resolved-settings";

export function buildDefaultSingleMetricWidget(domain: ResolvedMetricTarget["domain"]): StoredSingleMetricWidget {
    return create(SingleMetricWidgetSchema, {
        slot: create(MetricSlotSchema, {
            metric: create(MetricSelectionSchema, {
                target: buildDefaultSingleMetricTarget(domain),
            }),
        }),
    });
}

function buildDefaultSingleMetricTarget(domain: ResolvedMetricTarget["domain"]): StoredMetricSelection["target"] {
    switch (domain) {
        case "cpu":
            return {
                case: "cpu",
                value: create(CpuMetricTargetSchema, {
                    reading: {
                        case: "usage",
                        value: create(CpuMetricTarget_UsageSchema),
                    },
                }),
            };
        case "gpu":
            return {
                case: "gpu",
                value: create(GpuMetricTargetSchema),
            };
        case "memory":
            return {
                case: "memory",
                value: create(MemoryMetricTargetSchema, {
                    reading: {
                        case: "usage",
                        value: create(MemoryMetricTarget_UsageSchema),
                    },
                }),
            };
        case "disk":
            return {
                case: "disk",
                value: create(DiskMetricTargetSchema),
            };
        case "network":
            return {
                case: "network",
                value: create(NetworkMetricTargetSchema, {
                    reading: {
                        case: "traffic",
                        value: create(NetworkMetricTarget_TrafficSchema),
                    },
                }),
            };
        case "catalog":
            return {
                case: "catalog",
                value: create(CatalogMetricTargetSchema),
            };
        case "system":
            return {
                case: "system",
                value: create(SystemMetricTargetSchema, {
                    reading: {
                        case: "battery",
                        value: create(SystemBatteryMetricTargetSchema),
                    },
                }),
            };
        case "customMetric":
            return {
                case: "custom",
                value: create(CustomMetricTargetSchema),
            };
    }
}
