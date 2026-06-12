import {
    icons as lucideIcons,
    type Icons,
    type IconNode,
} from "lucide";
import type { SvgIconDefinition } from "./icon-types";
import { renderCenteredIconFragment } from "./render-icon";
import { createLucideIconDefinition } from "./sources/lucide";

export const CUSTOM_METRIC_DEFAULT_ICON_ID = "activity";

const customMetricIconDefinitionById = new Map<string, SvgIconDefinition>();
const lucideIconNodes: Icons = lucideIcons;

/** Normalizes user or AI supplied icon ids and rejects unknown Lucide ids. */
export function normalizeCustomMetricIconId(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalizedId = normalizeLucideIconId(value);
    return readLucideIconNode(normalizedId) === undefined ? undefined : normalizedId;
}

/** Checks whether a value names a supported Custom Metric Lucide icon. */
export function isCustomMetricIconId(value: string | undefined): boolean {
    return normalizeCustomMetricIconId(value) !== undefined;
}

/** Renders a centered SVG fragment for a Custom Metric icon id when it is known. */
export function getCustomMetricIconFragment(iconId: string | undefined, size = 45): string | undefined {
    const normalizedIconId = normalizeCustomMetricIconId(iconId);
    if (normalizedIconId === undefined) {
        return undefined;
    }

    return renderCenteredIconFragment(getCustomMetricIconDefinition(normalizedIconId), size);
}

/** Renders the fallback Custom Metric icon fragment. */
export function getDefaultCustomMetricIconFragment(size = 45): string {
    return renderCenteredIconFragment(getCustomMetricIconDefinition(CUSTOM_METRIC_DEFAULT_ICON_ID), size);
}

/** Builds the small standalone SVG used by Property Inspector icon previews. */
export function buildCustomMetricIconPreviewSvg(iconId: string): string {
    const iconFragment = getCustomMetricIconFragment(iconId, 15) ?? getDefaultCustomMetricIconFragment(15);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24">${iconFragment}</svg>`;
}

function getCustomMetricIconDefinition(iconId: string): SvgIconDefinition {
    const cachedDefinition = customMetricIconDefinitionById.get(iconId);
    if (cachedDefinition !== undefined) {
        return cachedDefinition;
    }

    const iconNode = readLucideIconNode(iconId);
    if (iconNode === undefined) {
        throw new Error(`Unknown Custom Metric icon id: ${iconId}`);
    }

    const definition = createLucideIconDefinition({
        id: `custom-metric.${iconId}`,
        node: iconNode,
        strokeWidth: 2.35,
    });
    customMetricIconDefinitionById.set(iconId, definition);
    return definition;
}

function readLucideIconNode(iconId: string): IconNode | undefined {
    return lucideIconNodes[toLucideExportName(iconId)];
}

function normalizeLucideIconId(value: string): string {
    return value.trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function toLucideExportName(iconId: string): string {
    return iconId
        .split("-")
        .map(part => part.length === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`)
        .join("");
}
