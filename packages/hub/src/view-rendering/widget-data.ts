export interface WidgetData {
    current: number;
    progress: number;              // 0.0-1.0 normalized.
    history: readonly number[];    // Last N samples, oldest first.
    unit: string;                  // Examples: "%", "deg C", "MB/s".
    label: string;                 // Examples: "CPU Usage", "GPU Temp".
    // TODO: Move display precision to one owner or make displayValue required
    // for rendered metric data. Primitive fallbacks currently guess precision.
    displayValue?: string;         // Optional preformatted value for compact metric-specific displays.
    unavailableDisplayValue?: string; // Optional short key copy for render-owned no-data states.
    secondaryDisplayValue?: string;
    /** Renderer hint for title-card's fixed three-character caption column. */
    titleCardCaptionText?: string;
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
    | FitToDataSparklineScale
    | FixedSparklineScale;

/**
 * Explicit fit-to-data mode for metrics whose value domain is genuinely
 * unknown. Do not use it as a fallback for a missing metric maximum.
 */
interface FitToDataSparklineScale {
    mode: "fitToData";
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
    sampleTimestampMilliseconds: number | undefined;
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

/**
 * Default keypad PNG target.
 *
 * A global 288x288 target was tested for virtual-key sharpness and showed no
 * visible benefit on most themes. It increased terminal-vintage PNG output from
 * about 24-25 KB to about 71 KB and pushed worst-case rasterization from about
 * 80-103 ms to about 266-336 ms. Do not raise the global default without a
 * measured visual gain; larger PNGs also add I/O pressure during bursty startup
 * and refresh rendering.
 */
export const KEYPAD_PNG_SIZE: KeySize = { width: 144, height: 144 };

/**
 * Pixel Window renders metric content inside a nested framed viewport; the 2x
 * target preserves that second-stage composition better without taxing other
 * themes on every refresh.
 */
export const PIXEL_WINDOW_KEYPAD_PNG_SIZE: KeySize = { width: 288, height: 288 };

/** Full-width Stream Deck+ touch strip action region, used by wide bar views. */
export const TOUCH_STRIP_SINGLE_METRIC_PNG_SIZE: KeySize = { width: 200, height: 100 };
