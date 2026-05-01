export const ARC_GAUGE_LABELS = {
    cpu: "CPU",
    gpu: "GPU",
    ram: "RAM",
    vram: "VRAM",
    disk: "DISK",
    download: "DOWN",
    upload: "UP",
} as const;

export type ArcGaugeLabel = typeof ARC_GAUGE_LABELS[keyof typeof ARC_GAUGE_LABELS];

export const ARC_GAUGE_MAXIMUM_LABEL_CHARACTERS = 4;

export function assertArcGaugeLabel(label: string): asserts label is ArcGaugeLabel {
    if (label.length > ARC_GAUGE_MAXIMUM_LABEL_CHARACTERS) {
        throw new Error(`Arc gauge label "${label}" exceeds ${ARC_GAUGE_MAXIMUM_LABEL_CHARACTERS} characters.`);
    }
}
