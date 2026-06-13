import {
    GENERATED_CUSTOM_METRIC_LUCIDE_ICON_ENTRIES,
    type GeneratedCustomMetricLucideIconEntry,
} from "../../generated/custom-metric-lucide-search-index.generated";

export const CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT = 20;

export interface CustomMetricIconMetadata {
    readonly id: string;
    readonly label: string;
    readonly terms: readonly string[];
}

/** Searches Lucide icon ids, labels, and metadata terms for the icon picker. */
export function searchCustomMetricIconOptions(query: string): {
    readonly options: readonly CustomMetricIconMetadata[];
    readonly totalMatchCount: number;
} {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
        return {
            options: [],
            totalMatchCount: 0,
        };
    }

    const scoredEntries = GENERATED_CUSTOM_METRIC_LUCIDE_ICON_ENTRIES
        .map(entry => ({
            entry,
            score: scoreIconSearchEntry(entry, normalizedQuery),
        }))
        .filter(scoredEntry => scoredEntry.score > 0)
        .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));

    return {
        options: scoredEntries.slice(0, CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT).map(scoredEntry => toMetadata(scoredEntry.entry)),
        totalMatchCount: scoredEntries.length,
    };
}

/** Reads generated Lucide metadata for a stored Custom Metric icon id. */
export function readCustomMetricIconMetadata(iconId: string): CustomMetricIconMetadata | undefined {
    const entry = GENERATED_CUSTOM_METRIC_LUCIDE_ICON_ENTRIES.find(candidate => candidate.id === iconId);
    return entry === undefined ? undefined : toMetadata(entry);
}

function scoreIconSearchEntry(entry: GeneratedCustomMetricLucideIconEntry, query: string): number {
    if (entry.id === query) {
        return 100;
    }
    if (entry.id.startsWith(query)) {
        return 80;
    }
    if (entry.label.toLowerCase().startsWith(query)) {
        return 70;
    }
    if (entry.id.includes(query)) {
        return 50;
    }
    if (entry.label.toLowerCase().includes(query)) {
        return 40;
    }
    return entry.terms.some(term => term.includes(query)) ? 30 : 0;
}

function toMetadata(entry: GeneratedCustomMetricLucideIconEntry): CustomMetricIconMetadata {
    return {
        id: entry.id,
        label: entry.label,
        terms: entry.terms,
    };
}
