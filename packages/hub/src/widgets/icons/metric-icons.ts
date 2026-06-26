import {
    icons as lucideIcons,
    type Icons,
    type IconNode,
} from "lucide";
import type { SvgIconDefinition } from "./icon-types";
import { renderCenteredIconFragment } from "./render-icon";
import { createLucideIconDefinition } from "./sources/lucide";

export const METRIC_DEFAULT_ICON_ID = "activity";

const metricIconDefinitionById = new Map<string, SvgIconDefinition>();
const lucideIconNodes: Icons = lucideIcons;

/** Normalizes user or AI supplied icon ids and rejects unknown Lucide ids. */
export function normalizeMetricIconId(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const normalizedId = normalizeLucideIconId(value);
    return readLucideIconNode(normalizedId) === undefined ? undefined : normalizedId;
}

/** Checks whether a value names a supported user-selectable metric icon. */
export function isMetricIconId(value: string | undefined): boolean {
    return normalizeMetricIconId(value) !== undefined;
}

/** Renders a centered SVG fragment for a user-selectable metric icon id when it is known. */
export function getMetricIconFragment(iconId: string | undefined, size = 45): string | undefined {
    const normalizedIconId = normalizeMetricIconId(iconId);
    if (normalizedIconId === undefined) {
        return undefined;
    }

    return renderCenteredIconFragment(getMetricIconDefinition(normalizedIconId), size);
}

/** Renders the fallback metric icon fragment. */
export function getDefaultMetricIconFragment(size = 45): string {
    return renderCenteredIconFragment(getMetricIconDefinition(METRIC_DEFAULT_ICON_ID), size);
}

/** Builds the small standalone SVG used by Property Inspector icon previews. */
export function buildMetricIconPreviewSvg(iconId: string): string {
    const iconFragment = getMetricIconFragment(iconId, 15) ?? getDefaultMetricIconFragment(15);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24">${iconFragment}</svg>`;
}

function getMetricIconDefinition(iconId: string): SvgIconDefinition {
    const cachedDefinition = metricIconDefinitionById.get(iconId);
    if (cachedDefinition !== undefined) {
        return cachedDefinition;
    }

    const iconNode = readLucideIconNode(iconId);
    if (iconNode === undefined) {
        throw new Error(`Unknown metric icon id: ${iconId}`);
    }

    const definition = createLucideIconDefinition({
        id: `metric-icon.${iconId}`,
        node: iconNode,
        strokeWidth: 2.35,
    });
    metricIconDefinitionById.set(iconId, definition);
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
