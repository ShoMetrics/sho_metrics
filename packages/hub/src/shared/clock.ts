/**
 * Monotonic elapsed-time clock.
 *
 * Use this for durations, TTLs, cooldowns, cache freshness, retry windows, and
 * throttling. It is intentionally not tied to the user's system clock, so NTP
 * sync or manual clock edits cannot make internal timers jump backward.
 */
export function monotonicNowMilliseconds(): number {
    return globalThis.performance.now();
}

/**
 * Wall-clock Unix timestamp in milliseconds.
 *
 * Use this only when the value leaves the process as an event/sample timestamp
 * or is displayed as a human time. Do not use it for elapsed-time decisions.
 */
export function wallClockNowMilliseconds(): number {
    return Date.now();
}
