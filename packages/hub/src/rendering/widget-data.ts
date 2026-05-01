/**
 * Universal data contract between Data Layer and Rendering Layer.
 * All single-channel widget primitives consume this shape.
 */
export interface WidgetData {
    current: number;
    progress: number;              // 0.0–1.0 normalized
    history: readonly number[];    // Last N samples (oldest first)
    unit: string;                  // "%", "°C", "MB/s"
    label: string;                 // "CPU Usage", "GPU Temp"
    displayValue?: string;         // Optional preformatted value for compact metric-specific displays.
    sampleTimestampMilliseconds?: number;
}

/**
 * Dual-channel data for mirrored traffic graphs (net, disk I/O).
 * Positive = download/read, Negative = upload/write.
 */
export interface DualChannelWidgetData {
    positive: WidgetData;
    negative: WidgetData;
}

export interface KeySize {
    width: number;
    height: number;
}

/** Logical SVG coordinate system. Visual proportions are authored against this size. */
export const WIDGET_LOGICAL_SIZE: KeySize = { width: 144, height: 144 };

/** High-resolution keypad PNG target. Stream Deck downsamples for hardware and keeps virtual keys sharper. */
export const KEYPAD_PNG_SIZE: KeySize = { width: 288, height: 288 };

/** One Stream Deck+ touch strip action region is 200x100; the metric image is centered in that region. */
export const TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE: KeySize = { width: 100, height: 100 };
