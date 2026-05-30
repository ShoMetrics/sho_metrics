export interface WidgetData {
    current: number;
    progress: number;              // 0.0-1.0 normalized.
    history: readonly number[];    // Last N samples, oldest first.
    unit: string;                  // Examples: "%", "deg C", "MB/s".
    label: string;                 // Examples: "CPU Usage", "GPU Temp".
    displayValue?: string;         // Optional preformatted value for compact metric-specific displays.
    unavailableDisplayValue?: string; // Optional short key copy for render-owned no-data states.
    secondaryDisplayValue?: string;
    barLabel?: string;
    barDisplayValue?: string;
    barUnit?: string;
    barValueIconFragment?: string;
    barValueIconColor?: string;
    barChannels?: readonly BarChannelWidgetData[];
    sparklineScale?: SparklineScale;
    sampleTimestampMilliseconds?: number;
}

export type SparklineScale =
    | AdaptiveSparklineScale
    | FixedSparklineScale;

interface AdaptiveSparklineScale {
    mode: "adaptive";
    minimumValue?: number;
}

/**
 * Fixed sparkline scale is a sparkline-specific contract. It should be set only
 * when the metric has a user-meaningful domain maximum for line height, not
 * merely because another widget has a progress value.
 */
interface FixedSparklineScale {
    mode: "fixed";
    minimumValue: number;
    maximumValue: number;
}

interface BarChannelWidgetData {
    label: string;
    displayValue: string;
    unit: string;
    progress: number;
    color: string;
    iconFragment: string;
}

/**
 * Dual-channel data for mirrored traffic charts (net, disk I/O).
 * Positive and negative identify chart channels, not fixed metric directions.
 */
export interface DualChannelWidgetData {
    positive: WidgetData;
    negative: WidgetData;
}

export interface KeySize {
    width: number;
    height: number;
}

// Render-owned no-data signal for a known metric whose helper polling group has
// not produced its first snapshot. Do not reuse this for generic loading copy.
export const PENDING_REFRESH_UNAVAILABLE_DISPLAY_VALUE = "...";

/** Logical SVG coordinate system. Visual proportions are authored against this size. */
export const WIDGET_LOGICAL_SIZE: KeySize = { width: 144, height: 144 };

/** Stream Deck+ gives each dial action one 200x100 px touch strip quarter. */
export const TOUCH_STRIP_LOGICAL_SIZE: KeySize = { width: 200, height: 100 };

/** High-resolution keypad PNG target. Stream Deck downsamples for hardware and keeps virtual keys sharper. */
export const KEYPAD_PNG_SIZE: KeySize = { width: 288, height: 288 };

/** Full-width Stream Deck+ touch strip action region, used by wide bar views. */
export const TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE: KeySize = { width: 200, height: 100 };
