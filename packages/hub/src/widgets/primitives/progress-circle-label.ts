export const PROGRESS_CIRCLE_LABELS = {
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    vram: "VRAM",
    disk: "DISK",
    network: "NET",
    download: "DOWN",
    upload: "UP",
} as const;

export type ProgressCircleLabel = typeof PROGRESS_CIRCLE_LABELS[keyof typeof PROGRESS_CIRCLE_LABELS];

export const PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS = 4;

/** Compacts a display label to the progress-circle center-label contract. */
export function compactProgressCircleLabel(label: string): string {
    const labelCharacters = Array.from(label);
    if (labelCharacters.length <= PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS) {
        return label;
    }

    const compactLabel = label
        .split(/[\s._#-]+/u)
        .filter(word => word.length > 0)
        .map(word => Array.from(word)[0])
        .join("");
    const candidate = compactLabel.length >= 2 ? compactLabel : label;
    return Array.from(candidate.toUpperCase())
        .slice(0, PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS)
        .join("");
}

export function assertProgressCircleLabel(label: string): asserts label is ProgressCircleLabel {
    if (label.length > PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS) {
        throw new Error(`Progress circle label "${label}" exceeds ${PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS} characters.`);
    }
}
