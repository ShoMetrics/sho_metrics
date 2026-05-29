import { MetricUnit } from "../../runtime/sources/metric-source";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
} from "../../runtime/sources/source-client";
import type { SelectOption } from "../inspector/types";

export type CatalogMetricTypeId =
    | "cpu"
    | "gpu"
    | "memory"
    | "disk"
    | "network"
    | "other";

export interface CatalogMetricSelection {
    readonly typeId: CatalogMetricTypeId | "";
    readonly hardwareId: string;
    readonly readingId: string;
    readonly metricId: string;
}

export interface CatalogMetricOptions {
    readonly typeOptions: readonly SelectOption<CatalogMetricTypeId | "">[];
    readonly hardwareOptions: readonly SelectOption[];
    readonly readingOptions: readonly SelectOption[];
    readonly metricOptions: readonly SelectOption[];
    readonly resolvedSelection: CatalogMetricSelection;
    readonly selectedDescriptor: MetricDescriptor | undefined;
    readonly selectedMetric: SelectedCatalogMetric | undefined;
}

export interface SelectedCatalogMetric {
    readonly metricId: string;
    readonly label: string;
    readonly unit: string;
}

interface CatalogMetricEntry {
    readonly descriptor: MetricDescriptor;
    readonly typeId: CatalogMetricTypeId;
    readonly hardwareId: string;
    readonly hardwareBaseLabel: string;
    readonly hardwareLabel: string;
    readonly isNoisyHardware: boolean;
    readonly readingId: string;
    readonly readingLabel: string;
    readonly metricBaseLabel: string;
    readonly metricLabel: string;
    readonly unit: string;
}

interface HardwareDisplay {
    readonly typeId: CatalogMetricTypeId;
    readonly hardwareId: string;
    readonly baseLabel: string;
    readonly label: string;
    readonly isNoisy: boolean;
}

const CATALOG_TYPE_ORDER: readonly CatalogMetricTypeId[] = [
    "cpu",
    "gpu",
    "memory",
    "disk",
    "network",
    "other",
];

const TYPE_LABEL_BY_ID = {
    cpu: "CPU",
    gpu: "GPU",
    memory: "Memory",
    disk: "Disk",
    network: "Network",
    other: "Other",
} as const satisfies Record<CatalogMetricTypeId, string>;

const READING_ORDER = [
    "temperature",
    "usage",
    "clock",
    "voltage",
    "power",
    "fan",
    "control",
    "data",
    "throughput",
    "timing",
    "other",
] as const;

type ReadingId = typeof READING_ORDER[number];

const READING_LABEL_BY_ID = {
    temperature: "Temperature",
    usage: "Usage",
    clock: "Clock",
    voltage: "Voltage",
    power: "Power",
    fan: "Fan",
    control: "Control",
    data: "Data",
    throughput: "Throughput",
    timing: "Timing",
    other: "Other",
} as const satisfies Record<ReadingId, string>;

const TOP_LEVEL_PLACEHOLDER_OPTION = { value: "", label: "Choose type" } as const;
const EMPTY_HARDWARE_OPTION = { value: "", label: "No hardware metrics", disabled: true } as const;
const EMPTY_READING_OPTION = { value: "", label: "No readings", disabled: true } as const;
const EMPTY_METRIC_OPTION = { value: "", label: "No metrics", disabled: true } as const;

const MAXIMUM_LABEL_LENGTH = 96;
const UNKNOWN_HARDWARE_LABEL = "Unknown Hardware";
const UNKNOWN_METRIC_LABEL = "Metric";

const NETWORK_NOISY_TOKENS = [
    "wfp",
    "qos",
    "lightweight filter",
    "kernel debugger",
    "bluetooth",
    "teredo",
    "isatap",
] as const;

const COMMON_NOISY_TOKENS = [
    "virtual",
    "basic render",
    "software",
    "shared",
    "d3d",
    "filter",
    "miniport",
    "loopback",
] as const;

// Hardware catalogs often use numbered labels such as E-Core #2, Wi-Fi 4, and
// Voltage #11. Natural sorting keeps those labels in user-expected order.
const NATURAL_TEXT_COLLATOR = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
});

/** Builds PI-only picker options from helper descriptors without changing source demand. */
export function buildCatalogMetricOptions(
    descriptors: readonly MetricDescriptor[],
    selection: Partial<CatalogMetricSelection> = {},
): CatalogMetricOptions {
    const entries = buildCatalogMetricEntries(descriptors);
    const storedMetricEntry = selection.metricId
        ? entries.find(entry => entry.descriptor.metricId === selection.metricId)
        : undefined;
    const resolvedSelection = resolveSelection(entries, selection, storedMetricEntry);
    const selectedEntry = entries.find(entry => entry.descriptor.metricId === resolvedSelection.metricId);

    return {
        typeOptions: buildTypeOptions(entries),
        hardwareOptions: buildHardwareOptions(entries, resolvedSelection.typeId),
        readingOptions: buildReadingOptions(entries, resolvedSelection.typeId, resolvedSelection.hardwareId),
        metricOptions: buildMetricOptions(
            entries,
            resolvedSelection.typeId,
            resolvedSelection.hardwareId,
            resolvedSelection.readingId,
        ),
        resolvedSelection,
        selectedDescriptor: selectedEntry?.descriptor,
        selectedMetric: selectedEntry
            ? {
                metricId: selectedEntry.descriptor.metricId,
                label: selectedEntry.metricLabel,
                unit: selectedEntry.unit,
            }
            : undefined,
    };
}

function buildCatalogMetricEntries(descriptors: readonly MetricDescriptor[]): readonly CatalogMetricEntry[] {
    const filteredDescriptors = deduplicateDescriptors(descriptors.filter(isPickerDescriptor));
    const baseEntries = filteredDescriptors.map(descriptor => {
        const typeId = classifyDescriptorType(descriptor);
        const hardwareBaseLabel = sanitizeLabel(descriptor.rawSensorIdentity.hardwareName, UNKNOWN_HARDWARE_LABEL);
        const readingId = classifyReading(descriptor.rawSensorIdentity.sourceSensorType);
        const metricBaseLabel = sanitizeLabel(descriptor.rawSensorIdentity.sensorName, UNKNOWN_METRIC_LABEL);

        return {
            descriptor,
            typeId,
            hardwareId: resolveHardwareOptionId(descriptor, typeId, hardwareBaseLabel),
            hardwareBaseLabel,
            hardwareLabel: hardwareBaseLabel,
            isNoisyHardware: isNoisyHardware(typeId, descriptor),
            readingId,
            readingLabel: READING_LABEL_BY_ID[readingId],
            metricBaseLabel,
            metricLabel: metricBaseLabel,
            unit: formatMetricUnit(descriptor.unit),
        };
    });
    const hardwareDisplays = buildHardwareDisplays(baseEntries);
    const entriesWithHardwareLabels = baseEntries.map(entry => {
        const hardwareDisplay = hardwareDisplays.get(hardwareMapKey(entry.typeId, entry.hardwareId));

        return {
            ...entry,
            hardwareLabel: hardwareDisplay?.label ?? entry.hardwareBaseLabel,
        };
    });

    return [...disambiguateMetricLabels(entriesWithHardwareLabels)]
        .sort(compareCatalogMetricEntries);
}

function isPickerDescriptor(descriptor: MetricDescriptor): boolean {
    return descriptor.valueKind === MetricValueKind.SCALAR
        && descriptor.metricId.length > 0
        && descriptor.pollingGroupId.length > 0;
}

function deduplicateDescriptors(descriptors: readonly MetricDescriptor[]): readonly MetricDescriptor[] {
    const descriptorsByReadingKey = new Map<string, MetricDescriptor>();

    for (const descriptor of descriptors) {
        const readingKey = buildSourceReadingKey(descriptor);
        if (readingKey === undefined) {
            descriptorsByReadingKey.set(`metric:${descriptor.metricId}`, descriptor);
            continue;
        }

        const existingDescriptor = descriptorsByReadingKey.get(readingKey);
        if (!existingDescriptor || shouldReplaceDescriptor(existingDescriptor, descriptor)) {
            descriptorsByReadingKey.set(readingKey, descriptor);
        }
    }

    return Array.from(descriptorsByReadingKey.values());
}

function buildSourceReadingKey(descriptor: MetricDescriptor): string | undefined {
    const rawSensorIdentity = descriptor.rawSensorIdentity;
    if (rawSensorIdentity.sourceSensorId.length === 0) {
        return undefined;
    }

    return [
        rawSensorIdentity.sourceSensorId,
        rawSensorIdentity.hardwareId,
        rawSensorIdentity.sourceSensorType,
        rawSensorIdentity.sensorName,
        descriptor.unit,
    ].join("\u001f");
}

function shouldReplaceDescriptor(existingDescriptor: MetricDescriptor, nextDescriptor: MetricDescriptor): boolean {
    // Built-in widgets own stable aliases with ranked failover. The catalog
    // picker intentionally exposes the raw long-tail sensor when both describe
    // the same source reading, so users are choosing the exact sensor they saw.
    if (
        existingDescriptor.metricIdKind === MetricIdKind.STABLE_ALIAS
        && nextDescriptor.metricIdKind === MetricIdKind.SOURCE_SENSOR
    ) {
        return true;
    }

    if (
        existingDescriptor.metricIdKind === nextDescriptor.metricIdKind
        && nextDescriptor.metricId < existingDescriptor.metricId
    ) {
        return true;
    }

    return false;
}

function classifyDescriptorType(descriptor: MetricDescriptor): CatalogMetricTypeId {
    const normalizedHardwareType = normalizeIdentifier(descriptor.rawSensorIdentity.hardwareType);
    const hardwareTypeBucket = classifyNormalizedHardwareType(normalizedHardwareType);

    if (hardwareTypeBucket !== undefined) {
        return hardwareTypeBucket;
    }

    return classifyMetricIdPrefix(descriptor.metricId) ?? "other";
}

function classifyNormalizedHardwareType(value: string): CatalogMetricTypeId | undefined {
    switch (value) {
        case "cpu":
            return "cpu";
        case "gpunvidia":
        case "gpuamd":
        case "gpuintel":
            return "gpu";
        case "memory":
            return "memory";
        case "storage":
            return "disk";
        case "network":
            return "network";
        default:
            return undefined;
    }
}

function classifyMetricIdPrefix(metricId: string): CatalogMetricTypeId | undefined {
    if (metricId.startsWith("cpu.")) {
        return "cpu";
    }
    if (metricId.startsWith("gpu.")) {
        return "gpu";
    }
    if (metricId.startsWith("ram.")) {
        return "memory";
    }
    if (metricId.startsWith("disk.")) {
        return "disk";
    }
    if (metricId.startsWith("net.")) {
        return "network";
    }

    return undefined;
}

function classifyReading(sourceSensorType: string): ReadingId {
    switch (normalizeIdentifier(sourceSensorType)) {
        case "temperature":
            return "temperature";
        case "load":
            return "usage";
        case "clock":
            return "clock";
        case "voltage":
            return "voltage";
        case "power":
            return "power";
        case "fan":
            return "fan";
        case "control":
            return "control";
        case "data":
        case "smalldata":
            return "data";
        case "throughput":
            return "throughput";
        case "timing":
            return "timing";
        default:
            return "other";
    }
}

function resolveHardwareOptionId(
    descriptor: MetricDescriptor,
    typeId: CatalogMetricTypeId,
    hardwareBaseLabel: string,
): string {
    const hardwareId = descriptor.rawSensorIdentity.hardwareId.trim();

    return hardwareId.length > 0
        ? hardwareId
        : `hardware:${typeId}:${hardwareBaseLabel}`;
}

function buildHardwareDisplays(entries: readonly CatalogMetricEntry[]): ReadonlyMap<string, HardwareDisplay> {
    const hardwareDisplays = new Map<string, HardwareDisplay>();

    for (const entry of entries) {
        const mapKey = hardwareMapKey(entry.typeId, entry.hardwareId);
        const existingDisplay = hardwareDisplays.get(mapKey);

        if (
            existingDisplay === undefined
            || compareBaseHardwareDisplay(entry, existingDisplay) < 0
        ) {
            hardwareDisplays.set(mapKey, {
                typeId: entry.typeId,
                hardwareId: entry.hardwareId,
                baseLabel: entry.hardwareBaseLabel,
                label: entry.hardwareBaseLabel,
                isNoisy: entry.isNoisyHardware,
            });
        }
    }

    const displaysByDuplicateKey = groupBy(
        Array.from(hardwareDisplays.values()).sort(compareHardwareDisplays),
        display => `${display.typeId}\u001f${display.baseLabel}`,
    );

    for (const duplicateDisplays of displaysByDuplicateKey.values()) {
        if (duplicateDisplays.length < 2) {
            continue;
        }

        duplicateDisplays
            .sort((left, right) => compareNaturalText(left.hardwareId, right.hardwareId))
            .forEach((display, index) => {
                hardwareDisplays.set(hardwareMapKey(display.typeId, display.hardwareId), {
                    ...display,
                    label: index === 0 ? display.baseLabel : `${display.baseLabel} #${index + 1}`,
                });
            });
    }

    return hardwareDisplays;
}

function compareBaseHardwareDisplay(entry: CatalogMetricEntry, display: HardwareDisplay): number {
    return compareValues(Number(entry.isNoisyHardware), Number(display.isNoisy))
        || compareNaturalText(entry.hardwareBaseLabel, display.baseLabel)
        || compareNaturalText(entry.hardwareId, display.hardwareId);
}

function disambiguateMetricLabels(entries: readonly CatalogMetricEntry[]): readonly CatalogMetricEntry[] {
    const entriesNeedingHardwareLabel = new Set<CatalogMetricEntry>();

    for (const duplicateEntries of groupBy(
        entries,
        entry => `${entry.typeId}\u001f${entry.readingId}\u001f${entry.metricBaseLabel}`,
    ).values()) {
        if (duplicateEntries.length > 1) {
            duplicateEntries.forEach(entry => entriesNeedingHardwareLabel.add(entry));
        }
    }

    const firstPassEntries = entries.map(entry => {
        if (!entriesNeedingHardwareLabel.has(entry)) {
            return entry;
        }

        return {
            ...entry,
            metricLabel: `${entry.metricBaseLabel} (${entry.hardwareLabel})`,
        };
    });
    const outputEntries: CatalogMetricEntry[] = [];

    for (const duplicateEntries of groupBy(
        firstPassEntries,
        entry => `${entry.typeId}\u001f${entry.hardwareId}\u001f${entry.readingId}\u001f${entry.metricLabel}`,
    ).values()) {
        duplicateEntries
            .sort((left, right) => compareNaturalText(left.descriptor.metricId, right.descriptor.metricId))
            .forEach((entry, index) => {
                outputEntries.push(index === 0
                    ? entry
                    : {
                        ...entry,
                        metricLabel: `${entry.metricLabel} #${index + 1}`,
                    });
            });
    }

    return outputEntries;
}

function buildTypeOptions(
    entries: readonly CatalogMetricEntry[],
): readonly SelectOption<CatalogMetricTypeId | "">[] {
    const presentTypeIds = new Set(entries.map(entry => entry.typeId));

    return [
        TOP_LEVEL_PLACEHOLDER_OPTION,
        ...CATALOG_TYPE_ORDER
            .filter(typeId => presentTypeIds.has(typeId))
            .map(typeId => ({
                value: typeId,
                label: TYPE_LABEL_BY_ID[typeId],
            })),
    ];
}

function buildHardwareOptions(
    entries: readonly CatalogMetricEntry[],
    typeId: CatalogMetricTypeId | "",
): readonly SelectOption[] {
    if (typeId.length === 0) {
        return [EMPTY_HARDWARE_OPTION];
    }

    const hardwareDisplays = uniqueBy(
        entries.filter(entry => entry.typeId === typeId),
        entry => entry.hardwareId,
    ).sort(compareHardwareEntries);

    return hardwareDisplays.length === 0
        ? [EMPTY_HARDWARE_OPTION]
        : hardwareDisplays.map(entry => ({
            value: entry.hardwareId,
            label: entry.hardwareLabel,
        }));
}

function buildReadingOptions(
    entries: readonly CatalogMetricEntry[],
    typeId: CatalogMetricTypeId | "",
    hardwareId: string,
): readonly SelectOption[] {
    if (typeId.length === 0 || hardwareId.length === 0) {
        return [EMPTY_READING_OPTION];
    }

    const readingEntries = uniqueBy(
        entries.filter(entry => entry.typeId === typeId && entry.hardwareId === hardwareId),
        entry => entry.readingId,
    ).sort(compareReadingEntries);

    return readingEntries.length === 0
        ? [EMPTY_READING_OPTION]
        : readingEntries.map(entry => ({
            value: entry.readingId,
            label: entry.readingLabel,
        }));
}

function buildMetricOptions(
    entries: readonly CatalogMetricEntry[],
    typeId: CatalogMetricTypeId | "",
    hardwareId: string,
    readingId: string,
): readonly SelectOption[] {
    if (typeId.length === 0 || hardwareId.length === 0 || readingId.length === 0) {
        return [EMPTY_METRIC_OPTION];
    }

    const metricEntries = entries
        .filter(entry =>
            entry.typeId === typeId
            && entry.hardwareId === hardwareId
            && entry.readingId === readingId)
        .sort(compareMetricEntries);

    return metricEntries.length === 0
        ? [EMPTY_METRIC_OPTION]
        : metricEntries.map(entry => ({
            value: entry.descriptor.metricId,
            label: entry.metricLabel,
        }));
}

function resolveSelection(
    entries: readonly CatalogMetricEntry[],
    selection: Partial<CatalogMetricSelection>,
    storedMetricEntry: CatalogMetricEntry | undefined,
): CatalogMetricSelection {
    if (storedMetricEntry) {
        return {
            typeId: storedMetricEntry.typeId,
            hardwareId: storedMetricEntry.hardwareId,
            readingId: storedMetricEntry.readingId,
            metricId: storedMetricEntry.descriptor.metricId,
        };
    }

    if (!selection.typeId) {
        return {
            typeId: "",
            hardwareId: "",
            readingId: "",
            metricId: selection.metricId ?? "",
        };
    }

    // Once the user picks a type, complete the lower levels to the first valid
    // concrete metric. Before that, keep the picker unselected and avoid writes.
    const typeEntries = entries.filter(entry => entry.typeId === selection.typeId);
    const hardwareId = selectExistingOrFirst(
        typeEntries.map(entry => entry.hardwareId),
        selection.hardwareId,
    );
    const hardwareEntries = typeEntries.filter(entry => entry.hardwareId === hardwareId);
    const readingId = selectExistingOrFirst(
        hardwareEntries.map(entry => entry.readingId),
        selection.readingId,
    );
    const metricEntries = hardwareEntries.filter(entry => entry.readingId === readingId);
    const metricId = selectExistingOrFirst(
        metricEntries.map(entry => entry.descriptor.metricId),
        selection.metricId,
    );

    return {
        typeId: selection.typeId,
        hardwareId,
        readingId,
        metricId,
    };
}

function selectExistingOrFirst(values: readonly string[], selectedValue: string | undefined): string {
    if (selectedValue !== undefined && values.includes(selectedValue)) {
        return selectedValue;
    }

    return values[0] ?? "";
}

function sanitizeLabel(value: string, fallback: string): string {
    const sanitizedValue = Array.from(value)
        .filter(character => !isControlCharacter(character))
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAXIMUM_LABEL_LENGTH);

    return sanitizedValue.length > 0 ? sanitizedValue : fallback;
}

function isControlCharacter(character: string): boolean {
    const code = character.charCodeAt(0);

    return code < 0x20 || code === 0x7f;
}

function normalizeIdentifier(value: string): string {
    return value.toLowerCase().replace(/[\s_.-]+/g, "");
}

function isNoisyHardware(typeId: CatalogMetricTypeId, descriptor: MetricDescriptor): boolean {
    const labels = [
        descriptor.rawSensorIdentity.hardwareName,
        descriptor.rawSensorIdentity.sensorName,
    ].map(value => sanitizeLabel(value, "").toLowerCase());
    const tokens = typeId === "network"
        ? [...COMMON_NOISY_TOKENS, ...NETWORK_NOISY_TOKENS]
        : COMMON_NOISY_TOKENS;

    return labels.some(label => tokens.some(token => label.includes(token)));
}

function formatMetricUnit(unit: MetricUnit): string {
    switch (unit) {
        case MetricUnit.PERCENT:
            return "%";
        case MetricUnit.CELSIUS:
            return "C";
        case MetricUnit.VOLTS:
            return "V";
        case MetricUnit.AMPERES:
            return "A";
        case MetricUnit.WATTS:
            return "W";
        case MetricUnit.HERTZ:
            return "Hz";
        case MetricUnit.BYTES:
            return "B";
        case MetricUnit.BYTES_PER_SECOND:
            return "B/s";
        case MetricUnit.REVOLUTIONS_PER_MINUTE:
            return "RPM";
        case MetricUnit.LITERS_PER_HOUR:
            return "L/h";
        case MetricUnit.SECONDS:
            return "s";
        case MetricUnit.WATT_HOURS:
            return "Wh";
        case MetricUnit.DECIBELS_A_WEIGHTED:
            return "dBA";
        case MetricUnit.SIEMENS_PER_CENTIMETER:
            return "S/cm";
        case MetricUnit.MILLISECONDS:
            return "ms";
        case MetricUnit.UNSPECIFIED:
        case MetricUnit.UNITLESS:
            return "";
    }

    // Protobuf enums are open at runtime. A newer helper may send a unit this
    // plugin does not know yet; keep the picker usable and persist no unit hint.
    return "";
}

function compareCatalogMetricEntries(left: CatalogMetricEntry, right: CatalogMetricEntry): number {
    return compareTypeId(left.typeId, right.typeId)
        || compareHardwareEntries(left, right)
        || compareReadingEntries(left, right)
        || compareMetricEntries(left, right);
}

function compareHardwareDisplays(left: HardwareDisplay, right: HardwareDisplay): number {
    return compareTypeId(left.typeId, right.typeId)
        || compareValues(Number(left.isNoisy), Number(right.isNoisy))
        || compareNaturalText(left.label, right.label)
        || compareNaturalText(left.hardwareId, right.hardwareId);
}

function compareHardwareEntries(left: CatalogMetricEntry, right: CatalogMetricEntry): number {
    return compareValues(Number(left.isNoisyHardware), Number(right.isNoisyHardware))
        || compareNaturalText(left.hardwareLabel, right.hardwareLabel)
        || compareNaturalText(left.hardwareId, right.hardwareId);
}

function compareReadingEntries(left: CatalogMetricEntry, right: CatalogMetricEntry): number {
    return compareValues(readReadingOrder(left.readingId), readReadingOrder(right.readingId))
        || compareNaturalText(left.readingLabel, right.readingLabel);
}

function compareMetricEntries(left: CatalogMetricEntry, right: CatalogMetricEntry): number {
    return compareNaturalText(left.metricLabel, right.metricLabel)
        || compareNaturalText(left.descriptor.metricId, right.descriptor.metricId);
}

function compareTypeId(left: CatalogMetricTypeId, right: CatalogMetricTypeId): number {
    return compareValues(CATALOG_TYPE_ORDER.indexOf(left), CATALOG_TYPE_ORDER.indexOf(right));
}

function compareValues(left: number, right: number): number {
    return left === right ? 0 : left < right ? -1 : 1;
}

function compareNaturalText(left: string, right: string): number {
    return NATURAL_TEXT_COLLATOR.compare(left, right)
        || left.localeCompare(right, "en")
        || compareValues(left.length, right.length);
}

function readReadingOrder(readingId: string): number {
    const index = READING_ORDER.indexOf(readingId as ReadingId);

    return index < 0 ? READING_ORDER.length : index;
}

function hardwareMapKey(typeId: CatalogMetricTypeId, hardwareId: string): string {
    return `${typeId}\u001f${hardwareId}`;
}

function uniqueBy<TItem>(
    items: readonly TItem[],
    readKey: (item: TItem) => string,
): TItem[] {
    const seenKeys = new Set<string>();
    const outputItems: TItem[] = [];

    for (const item of items) {
        const key = readKey(item);
        if (seenKeys.has(key)) {
            continue;
        }

        seenKeys.add(key);
        outputItems.push(item);
    }

    return outputItems;
}

function groupBy<TItem>(
    items: readonly TItem[],
    readKey: (item: TItem) => string,
): Map<string, TItem[]> {
    // TODO: Replace this with Map.groupBy after the repo-level TypeScript lib
    // target moves beyond ES2022. Node 24 supports it, but the current TS
    // config intentionally does not expose that API yet.
    const groups = new Map<string, TItem[]>();

    for (const item of items) {
        const key = readKey(item);
        const group = groups.get(key);
        if (group) {
            group.push(item);
            continue;
        }

        groups.set(key, [item]);
    }

    return groups;
}
