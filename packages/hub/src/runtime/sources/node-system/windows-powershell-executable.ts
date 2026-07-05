import { existsSync } from "node:fs";

// Windows PowerShell 5.1 location relative to the Windows directory. This
// mirrors systeminformation's getPowershell() in
// node_modules/systeminformation/lib/util.js (lowercase "system32" included) so
// the resolved executable string is byte-identical to si's.
const WINDOWS_POWERSHELL_RELATIVE_PATH = "system32\\WindowsPowerShell\\v1.0\\powershell.exe";

/**
 * Resolves the same PowerShell executable that systeminformation invokes on
 * Windows: the absolute Windows PowerShell 5.1 path when it exists, otherwise
 * the bare name for PATH resolution.
 *
 * Our own Windows PowerShell callers (the orphan janitor and the Bluetooth
 * battery reads) must resolve to the exact interpreter si uses. Otherwise a
 * machine where si's PowerShell is blocked or a PATH is poisoned could leave
 * one path working while the other fails, which is far harder to debug than a
 * consistent failure. Aligning means we fail together with si.
 *
 * No platform guard by design: every caller already invokes this only on win32
 * (the janitor's session is created for win32 only, and the Bluetooth readers
 * run only inside win32 branches). Off-win32 it would fall through to the bare
 * name and a later spawn would fail, but that path is never reached.
 */
export function resolveWindowsPowerShellExecutablePath(
    fileExists: (path: string) => boolean = existsSync,
    environment: NodeJS.ProcessEnv = process.env,
): string {
    // Match si's falsy fallback (||, not ??): an empty WINDIR must resolve to
    // C:\Windows exactly as getPowershell() does, or the two paths diverge.
    const windowsDirectory = environment.WINDIR || "C:\\Windows";
    const absolutePath = `${windowsDirectory}\\${WINDOWS_POWERSHELL_RELATIVE_PATH}`;
    return fileExists(absolutePath) ? absolutePath : "powershell.exe";
}
