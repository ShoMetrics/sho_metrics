/**
 * Resolves whether ShoMetrics should expose vendor USB HID battery reads.
 *
 * This feature is intentionally Windows-only. macOS requires the frightening
 * Input Monitoring TCC permission for HID access, and the current ASUS/ROG
 * route logic is based on Windows HID paths.
 *
 * The check is platform-scoped, not architecture-scoped: Windows x64 and ARM64
 * are both supported when the package includes the matching native addon.
 */
export function shouldEnableVendorHidBatterySupport(platform: string | undefined): boolean {
    return platform === "win32";
}
