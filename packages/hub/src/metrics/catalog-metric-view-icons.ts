import type { CatalogMetricReadingKind } from "../settings/resolved-settings";
import {
    isMetricStatusIconKind,
    type MetricStatusIconKind,
} from "../widgets/icons/metric-status-icons";

type CatalogReadingStatusIconKind = Extract<CatalogMetricReadingKind, MetricStatusIconKind>;
type CatalogReadingKindWithoutStatusIcon = Exclude<CatalogMetricReadingKind, CatalogReadingStatusIconKind>;

const METRIC_STATUS_ICON_KIND_BY_CATALOG_READING_OVERRIDE = {
    unspecified: "percentage",
    usage: "percentage",
    other: "percentage",
} satisfies Record<CatalogReadingKindWithoutStatusIcon, MetricStatusIconKind>;

/**
 * Resolves catalog reading metadata to the compact status glyph used by metric views.
 */
export function metricStatusIconForCatalogReadingKind(kind: CatalogMetricReadingKind): MetricStatusIconKind {
    if (isMetricStatusIconKind(kind)) {
        return kind;
    }

    return METRIC_STATUS_ICON_KIND_BY_CATALOG_READING_OVERRIDE[kind];
}
