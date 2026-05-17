export type HardwareModelKind = "cpu" | "gpu";

const MODEL_SUFFIX_PATTERN = /\b(?:\d+-core|processor|cpu|graphics|mobile)\b/gi;
const TRADEMARK_PATTERN = /\((?:r|tm|c)\)|[®™©]/gi;
const SPACE_PATTERN = /\s+/g;

/**
 * Produces short hardware model labels for constrained Stream Deck bar views.
 * The formatter removes vendor boilerplate and marketing suffixes while keeping
 * the recognizable product family and SKU.
 */
export function formatCompactHardwareModelLabel(modelText: string | undefined, kind: HardwareModelKind): string | undefined {
    if (!modelText) {
        return undefined;
    }

    const normalizedModel = modelText
        .replace(TRADEMARK_PATTERN, " ")
        .replace(/\b\d+(?:\.\d+)?\s*GHz\b.*$/i, " ")
        .replace(/\s*@\s*.*$/i, " ")
        .replace(MODEL_SUFFIX_PATTERN, " ")
        .replace(SPACE_PATTERN, " ")
        .trim();

    if (normalizedModel.length === 0) {
        return undefined;
    }

    if (kind === "cpu") {
        return formatCompactCpuModelLabel(normalizedModel);
    }

    return formatCompactGpuModelLabel(normalizedModel);
}

function formatCompactCpuModelLabel(modelText: string): string {
    return modelText
        .replace(/^AMD\s+/i, "")
        .replace(/^Intel\s+/i, "")
        .replace(/^Core\s+Ultra\s+/i, "Core Ultra ")
        .replace(/^Core\s+/i, "Core ")
        .replace(SPACE_PATTERN, " ")
        .trim();
}

function formatCompactGpuModelLabel(modelText: string): string {
    return modelText
        .replace(/^NVIDIA\s+/i, "")
        .replace(/^GeForce\s+/i, "")
        .replace(/^AMD\s+/i, "")
        .replace(/^Radeon\s+/i, "Radeon ")
        .replace(SPACE_PATTERN, " ")
        .trim();
}
