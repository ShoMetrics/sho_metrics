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

/** Standard Stream Deck key size (HiDPI). */
export const KEY_SIZE_144: KeySize = { width: 144, height: 144 };
