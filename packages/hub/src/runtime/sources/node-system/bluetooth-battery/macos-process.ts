import { spawn } from "node:child_process";

export const MACOS_BLUETOOTH_COMMAND_TIMEOUT_MILLISECONDS = 5_000;
export const MACOS_BLUETOOTH_COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;

/**
 * Builds the common bounds for macOS Bluetooth subprocess reads.
 */
export function buildMacOsBluetoothExecFileOptions(): {
    readonly timeout: number;
    readonly maxBuffer: number;
} {
    return {
        timeout: MACOS_BLUETOOTH_COMMAND_TIMEOUT_MILLISECONDS,
        maxBuffer: MACOS_BLUETOOTH_COMMAND_MAX_BUFFER_BYTES,
    };
}

/**
 * Converts one plist XML document to an untrusted JavaScript value through plutil.
 */
export async function parsePlistXmlValue(xml: string): Promise<unknown> {
    const stdout = await spawnWithStdin("/usr/bin/plutil", [
        "-convert",
        "json",
        "-o",
        "-",
        "-",
    ], xml);
    return JSON.parse(stdout) as unknown;
}

/**
 * Converts one plist XML document to a dictionary, returning an empty dictionary for other roots.
 */
export async function parsePlistXmlRecord(xml: string): Promise<Record<string, unknown>> {
    return asRecord(await parsePlistXmlValue(xml)) ?? {};
}

/**
 * Runs a subprocess with stdin and returns UTF-8 stdout.
 *
 * The upstream command reads that feed this path are bounded by execFile
 * maxBuffer. This stdin path is bounded by timeout and intentionally does not
 * add a second byte limit until logs show oversized plist chunks in practice.
 */
export async function spawnWithStdin(path: string, arguments_: readonly string[], stdin: string): Promise<string> {
    return await new Promise((resolve, reject) => {
        const child = spawn(path, arguments_, {
            stdio: ["pipe", "pipe", "pipe"],
        });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(`${path} timed out after ${MACOS_BLUETOOTH_COMMAND_TIMEOUT_MILLISECONDS}ms`));
        }, MACOS_BLUETOOTH_COMMAND_TIMEOUT_MILLISECONDS);

        child.stdout.on("data", chunk => {
            stdoutChunks.push(bufferFromProcessChunk(chunk));
        });
        child.stderr.on("data", chunk => {
            stderrChunks.push(bufferFromProcessChunk(chunk));
        });
        child.on("error", error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on("close", code => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(new Error(`${path} exited with code ${code}: ${Buffer.concat(stderrChunks).toString("utf8")}`));
                return;
            }

            resolve(Buffer.concat(stdoutChunks).toString("utf8"));
        });

        child.stdin.end(stdin);
    });
}

/**
 * Narrows an untrusted value to a plain object record.
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

/**
 * Narrows an untrusted value to an array.
 */
export function asArray(value: unknown): readonly unknown[] | undefined {
    return Array.isArray(value) ? value : undefined;
}

function bufferFromProcessChunk(chunk: unknown): Buffer {
    return Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
}
