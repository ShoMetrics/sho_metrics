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

export function assertProgressCircleLabel(label: string): asserts label is ProgressCircleLabel {
    if (label.length > PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS) {
        throw new Error(`Progress circle label "${label}" exceeds ${PROGRESS_CIRCLE_MAXIMUM_LABEL_CHARACTERS} characters.`);
    }
}
