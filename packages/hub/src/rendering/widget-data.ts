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
    secondaryDisplayValue?: string;
    linearLabel?: string;
    linearDisplayValue?: string;
    linearUnit?: string;
    linearChannels?: readonly LinearChannelWidgetData[];
    sparklineScale?: SparklineScale;
    sampleTimestampMilliseconds?: number;
}

export type SparklineScale =
    | AdaptiveSparklineScale
    | FixedSparklineScale;

export interface AdaptiveSparklineScale {
    mode: "adaptive";
    minimumValue?: number;
}

/**
 * Fixed sparkline scale is a graph-specific contract. It should be set only
 * when the metric has a user-meaningful domain maximum for line height, not
 * merely because another widget has a progress value.
 */
export interface FixedSparklineScale {
    mode: "fixed";
    minimumValue: number;
    maximumValue: number;
}

export interface LinearChannelWidgetData {
    label: string;
    displayValue: string;
    unit: string;
    progress: number;
    color: string;
    iconFragment: string;
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

/** Stream Deck+ gives each dial action one 200x100 px touch strip quarter. */
export const TOUCH_STRIP_LOGICAL_SIZE: KeySize = { width: 200, height: 100 };

/** High-resolution keypad PNG target. Stream Deck downsamples for hardware and keeps virtual keys sharper. */
export const KEYPAD_PNG_SIZE: KeySize = { width: 288, height: 288 };

/** Full-width Stream Deck+ touch strip action region, used by wide graphs such as linear bars. */
export const TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE: KeySize = { width: 200, height: 100 };

/** Centered square region inside a Stream Deck+ touch strip quarter, used by circular graphs. */
export const TOUCH_STRIP_SINGLE_METRIC_SQUARE_PNG_SIZE: KeySize = { width: 100, height: 100 };
