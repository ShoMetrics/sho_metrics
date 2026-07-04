import { normalizeKnownMetricUnit } from "../../metrics/metric-unit-format";
import { optionMessages } from "../../i18n/message-groups/options";
import type { I18n } from "../../i18n/react";
import type { CatalogMetricCategory, CatalogMetricReadingKind } from "../../settings/resolved-settings";
import type { MetricUnit } from "../../runtime/sources/metric-source";
import {
    MetricIdKind,
    MetricValueKind,
    type MetricDescriptor,
} from "../../runtime/sources/source-client";
import type { SelectOption } from "../inspector/types";

export type CatalogMetricTypeId = Exclude<CatalogMetricCategory, "unspecified">;

// Current and level are stored reading kinds, but they are not picker groups in
// this batch because they have no distinct label, scale, or caption behavior.
type ReadingId = Exclude<CatalogMetricReadingKind, "unspecified" | "current" | "level">;

export interface CatalogMetricSelection {
    readonly typeId: CatalogMetricTypeId | "";
    readonly hardwareId: string;
    readonly readingId: ReadingId | "";
    readonly metricId: string;
}

export interface CatalogMetricOptions {
    readonly typeOptions: readonly SelectOption<CatalogMetricTypeId | "">[];
    readonly hardwareOptions: readonly SelectOption[];
    readonly readingOptions: readonly SelectOption<ReadingId | "">[];
    readonly metricOptions: readonly SelectOption[];
    readonly resolvedSelection: CatalogMetricSelection;
    readonly selectedMetric: SelectedCatalogMetric | undefined;
}

export interface SelectedCatalogMetric {
    readonly metricId: string;
    readonly label: string;
    readonly unit: MetricUnit;
    readonly category: CatalogMetricCategory;
    readonly readingKind: CatalogMetricReadingKind;
}

interface CatalogMetricEntry {
    readonly descriptor: CatalogMetricDescriptor;
    readonly typeId: CatalogMetricTypeId;
    readonly hardwareId: string;
    readonly hardwareBaseLabel: string;
    readonly hardwareLabel: string;
    readonly isNoisyHardware: boolean;
    readonly readingId: ReadingId;
    readonly readingLabel: string;
    readonly metricBaseLabel: string;
    readonly metricLabel: string;
}

type CatalogMetricDescriptor = MetricDescriptor & {
    readonly rawSensorIdentity: NonNullable<MetricDescriptor["rawSensorIdentity"]>;
};

interface HardwareDisplay {
    readonly typeId: CatalogMetricTypeId;
    readonly hardwareId: string;
    readonly baseLabel: string;
    readonly label: string;
    readonly isNoisy: boolean;
}

const CATALOG_TYPE_SORT_ORDER_BY_ID = {
    cpu: 0,
    gpu: 1,
    memory: 2,
    disk: 3,
    network: 4,
    other: 5,
} as const satisfies Record<CatalogMetricTypeId, number>;

const TYPE_LABEL_BY_ID = {
    cpu: "CPU",
    gpu: "GPU",
    memory: "Memory",
    disk: "Disk",
    network: "Network",
    other: "Other",
} as const satisfies Record<CatalogMetricTypeId, string>;

const READING_SORT_ORDER_BY_ID = {
    temperature: 0,
    usage: 1,
    clock: 2,
    voltage: 3,
    power: 4,
    fan: 5,
    control: 6,
    data: 7,
    throughput: 8,
    timing: 9,
    other: 10,
} as const satisfies Record<ReadingId, number>;

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
    i18n?: I18n,
): CatalogMetricOptions {
    const entries = buildCatalogMetricEntries(descriptors);
    const storedMetricEntry = selection.metricId
        ? entries.find(entry => entry.descriptor.metricId === selection.metricId)
        : undefined;
    const resolvedSelection = resolveSelection(entries, selection, storedMetricEntry);
    const selectedEntry = entries.find(entry => entry.descriptor.metricId === resolvedSelection.metricId);

    return {
        typeOptions: buildTypeOptions(entries, i18n),
        hardwareOptions: buildHardwareOptions(entries, resolvedSelection.typeId, i18n),
        readingOptions: buildReadingOptions(entries, resolvedSelection.typeId, resolvedSelection.hardwareId, i18n),
        metricOptions: buildMetricOptions(
            entries,
            resolvedSelection.typeId,
            resolvedSelection.hardwareId,
            resolvedSelection.readingId,
            i18n,
        ),
        resolvedSelection,
        selectedMetric: selectedEntry
            ? {
                metricId: selectedEntry.descriptor.metricId,
                label: selectedEntry.metricLabel,
                unit: normalizeKnownMetricUnit(selectedEntry.descriptor.unit),
                category: selectedEntry.typeId,
                readingKind: selectedEntry.readingId,
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

function isPickerDescriptor(descriptor: MetricDescriptor): descriptor is CatalogMetricDescriptor {
    return descriptor.valueKind === MetricValueKind.SCALAR
        && descriptor.metricId.length > 0
        && descriptor.pollingGroupId.length > 0
        && descriptor.rawSensorIdentity !== undefined;
}

function deduplicateDescriptors(descriptors: readonly CatalogMetricDescriptor[]): readonly CatalogMetricDescriptor[] {
    const descriptorsByReadingKey = new Map<string, CatalogMetricDescriptor>();

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

function buildSourceReadingKey(descriptor: CatalogMetricDescriptor): string | undefined {
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

function shouldReplaceDescriptor(
    existingDescriptor: CatalogMetricDescriptor,
    nextDescriptor: CatalogMetricDescriptor,
): boolean {
    // Built-in widgets own stable aliases with ranked failover. The catalog
    // picker intentionally exposes the raw long-tail sensor when both describe
    // the same source reading, so users are choosing the exact sensor they saw.
    if (
        existingDescriptor.metricIdKind === MetricIdKind.STABLE_ALIAS
        && nextDescriptor.metricIdKind === MetricIdKind.SOURCE_NATIVE
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

function classifyDescriptorType(descriptor: CatalogMetricDescriptor): CatalogMetricTypeId {
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
    descriptor: CatalogMetricDescriptor,
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
    i18n: I18n | undefined,
): readonly SelectOption<CatalogMetricTypeId | "">[] {
    const presentTypeIds = new Set(entries.map(entry => entry.typeId));

    return [
        i18n ? { value: "", label: i18n.t(optionMessages.chooseTypeOption) } : TOP_LEVEL_PLACEHOLDER_OPTION,
        ...[...presentTypeIds]
            .sort(compareTypeId)
            .map(typeId => ({
                value: typeId,
                label: readTypeLabel(typeId, i18n),
            })),
    ];
}

function buildHardwareOptions(
    entries: readonly CatalogMetricEntry[],
    typeId: CatalogMetricTypeId | "",
    i18n: I18n | undefined,
): readonly SelectOption[] {
    if (typeId.length === 0) {
        return [buildEmptyHardwareOption(i18n)];
    }

    const hardwareDisplays = uniqueBy(
        entries.filter(entry => entry.typeId === typeId),
        entry => entry.hardwareId,
    ).sort(compareHardwareEntries);

    return hardwareDisplays.length === 0
        ? [buildEmptyHardwareOption(i18n)]
        : hardwareDisplays.map(entry => ({
            value: entry.hardwareId,
            label: entry.hardwareLabel,
        }));
}

function buildReadingOptions(
    entries: readonly CatalogMetricEntry[],
    typeId: CatalogMetricTypeId | "",
    hardwareId: string,
    i18n: I18n | undefined,
): readonly SelectOption<ReadingId | "">[] {
    if (typeId.length === 0 || hardwareId.length === 0) {
        return [buildEmptyReadingOption(i18n)];
    }

    const readingEntries = uniqueBy(
        entries.filter(entry => entry.typeId === typeId && entry.hardwareId === hardwareId),
        entry => entry.readingId,
    ).sort(compareReadingEntries);

    return readingEntries.length === 0
        ? [buildEmptyReadingOption(i18n)]
        : readingEntries.map(entry => ({
            value: entry.readingId,
            label: readReadingLabel(entry.readingId, i18n),
        }));
}

function readReadingLabel(readingId: ReadingId, i18n: I18n | undefined): string {
    if (!i18n) {
        return READING_LABEL_BY_ID[readingId];
    }

    switch (readingId) {
        case "temperature":
            return i18n.t(optionMessages.temperatureOption);
        case "usage":
            return i18n.t(optionMessages.usageOption);
        case "clock":
            return i18n.t(optionMessages.clockOption);
        case "voltage":
            return i18n.t(optionMessages.voltageOption);
        case "power":
            return i18n.t(optionMessages.powerOption);
        case "fan":
            return i18n.t(optionMessages.fanOption);
        case "control":
            return i18n.t(optionMessages.controlOption);
        case "data":
            return i18n.t(optionMessages.dataOption);
        case "throughput":
            return i18n.t(optionMessages.throughputOption);
        case "timing":
            return i18n.t(optionMessages.timingOption);
        case "other":
            return i18n.t(optionMessages.otherOption);
    }
}

function readTypeLabel(typeId: CatalogMetricTypeId, i18n: I18n | undefined): string {
    if (!i18n) {
        return TYPE_LABEL_BY_ID[typeId];
    }

    switch (typeId) {
        case "cpu":
        case "gpu":
            return TYPE_LABEL_BY_ID[typeId];
        case "memory":
            return i18n.t(optionMessages.memoryOption);
        case "disk":
            return i18n.t(optionMessages.diskOption);
        case "network":
            return i18n.t(optionMessages.networkOption);
        case "other":
            return i18n.t(optionMessages.otherOption);
    }
}

function buildEmptyHardwareOption(i18n: I18n | undefined): SelectOption {
    return i18n
        ? { value: "", label: i18n.t(optionMessages.noHardwareMetricsOption), disabled: true }
        : EMPTY_HARDWARE_OPTION;
}

function buildEmptyReadingOption(i18n: I18n | undefined): SelectOption<ReadingId | ""> {
    return i18n
        ? { value: "", label: i18n.t(optionMessages.noReadingsOption), disabled: true }
        : EMPTY_READING_OPTION;
}

function buildEmptyMetricOption(i18n: I18n | undefined): SelectOption {
    return i18n
        ? { value: "", label: i18n.t(optionMessages.noMetricsOption), disabled: true }
        : EMPTY_METRIC_OPTION;
}

function buildMetricOptions(
    entries: readonly CatalogMetricEntry[],
    typeId: CatalogMetricTypeId | "",
    hardwareId: string,
    readingId: string,
    i18n: I18n | undefined,
): readonly SelectOption[] {
    if (typeId.length === 0 || hardwareId.length === 0 || readingId.length === 0) {
        return [buildEmptyMetricOption(i18n)];
    }

    const metricEntries = entries
        .filter(entry =>
            entry.typeId === typeId
            && entry.hardwareId === hardwareId
            && entry.readingId === readingId)
        .sort(compareMetricEntries);

    return metricEntries.length === 0
        ? [buildEmptyMetricOption(i18n)]
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
    // A vanished stored metricId is not preserved as an unavailable option in
    // this picker today: after an explicit type choice, the remaining fields
    // re-complete within that type. Revisit with preserveMissingCurrentOption
    // if helper or catalog churn strands stored catalog widgets in practice.
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

function selectExistingOrFirst<TValue extends string>(
    values: readonly TValue[],
    selectedValue: string | undefined,
): TValue | "" {
    const existingValue = selectedValue === undefined
        ? undefined
        : values.find(value => value === selectedValue);

    return existingValue ?? values[0] ?? "";
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

function isNoisyHardware(typeId: CatalogMetricTypeId, descriptor: CatalogMetricDescriptor): boolean {
    const labels = [
        descriptor.rawSensorIdentity.hardwareName,
        descriptor.rawSensorIdentity.sensorName,
    ].map(value => sanitizeLabel(value, "").toLowerCase());
    const tokens = typeId === "network"
        ? [...COMMON_NOISY_TOKENS, ...NETWORK_NOISY_TOKENS]
        : COMMON_NOISY_TOKENS;

    return labels.some(label => tokens.some(token => label.includes(token)));
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
    return compareValues(READING_SORT_ORDER_BY_ID[left.readingId], READING_SORT_ORDER_BY_ID[right.readingId])
        || compareNaturalText(left.readingLabel, right.readingLabel);
}

function compareMetricEntries(left: CatalogMetricEntry, right: CatalogMetricEntry): number {
    return compareNaturalText(left.metricLabel, right.metricLabel)
        || compareNaturalText(left.descriptor.metricId, right.descriptor.metricId);
}

function compareTypeId(left: CatalogMetricTypeId, right: CatalogMetricTypeId): number {
    return compareValues(CATALOG_TYPE_SORT_ORDER_BY_ID[left], CATALOG_TYPE_SORT_ORDER_BY_ID[right]);
}

function compareValues(left: number, right: number): number {
    return left === right ? 0 : left < right ? -1 : 1;
}

function compareNaturalText(left: string, right: string): number {
    return NATURAL_TEXT_COLLATOR.compare(left, right)
        || left.localeCompare(right, "en")
        || compareValues(left.length, right.length);
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
