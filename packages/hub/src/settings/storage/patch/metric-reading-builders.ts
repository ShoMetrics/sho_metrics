import { create } from "@bufbuild/protobuf";
import {
    CpuMetricTarget_PowerSchema,
    CpuMetricTarget_TemperatureSchema,
    CpuMetricTarget_UsageSchema,
    GpuMetricTarget_PowerSchema,
    GpuMetricTarget_TemperatureSchema,
    GpuMetricTarget_UsageSchema,
    GpuMetricTarget_VramSchema,
    type CpuMetricTarget as StoredCpuMetricTarget,
    type GpuMetricTarget as StoredGpuMetricTarget,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import { assertNever } from "./patch-errors";

type StoredCpuReadingCase = NonNullable<StoredCpuMetricTarget["reading"]["case"]>;
type StoredGpuReadingCase = NonNullable<StoredGpuMetricTarget["reading"]["case"]>;

export function buildDefaultCpuMetricReading(kind: StoredCpuReadingCase): StoredCpuMetricTarget["reading"] {
    switch (kind) {
        case "usage":
            return { case: "usage", value: create(CpuMetricTarget_UsageSchema) };
        case "temperature":
            return { case: "temperature", value: create(CpuMetricTarget_TemperatureSchema) };
        case "power":
            return { case: "power", value: create(CpuMetricTarget_PowerSchema) };
    }

    return assertNever(kind);
}

export function buildDefaultGpuMetricReading(kind: StoredGpuReadingCase): StoredGpuMetricTarget["reading"] {
    switch (kind) {
        case "usage":
            return { case: "usage", value: create(GpuMetricTarget_UsageSchema) };
        case "temperature":
            return { case: "temperature", value: create(GpuMetricTarget_TemperatureSchema) };
        case "vram":
            return { case: "vram", value: create(GpuMetricTarget_VramSchema) };
        case "power":
            return { case: "power", value: create(GpuMetricTarget_PowerSchema) };
    }

    return assertNever(kind);
}
