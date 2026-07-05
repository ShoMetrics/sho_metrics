import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "vitest";
import { JANITOR_SIGNATURE_PATTERNS } from "./node-system-windows-powershell-session";

// The orphan janitor identifies systeminformation's persistent PowerShell child by
// its spawn-argument signature. Those args are an internal detail of the dependency
// with no stability guarantee, and a mismatch silently degrades the janitor to a
// no-op (its failure is debug-swallowed). Pin si's real spawn command against our
// signature so a version bump that changes it fails here instead of in the field.
test("orphan janitor signature matches systeminformation's persistent PowerShell spawn command", () => {
    const require = createRequire(import.meta.url);
    const utilSource = readFileSync(require.resolve("systeminformation/lib/util.js"), "utf8");
    const spawnArgs = extractPowerShellStartSpawnArgs(utilSource);
    const spawnCommandLine = `powershell.exe ${spawnArgs.join(" ")}`;

    for (const pattern of JANITOR_SIGNATURE_PATTERNS) {
        assert.match(
            spawnCommandLine,
            new RegExp(pattern, "iu"),
            `systeminformation's persistent PowerShell spawn command "${spawnCommandLine}" no longer matches janitor signature `
                + `/${pattern}/. Update JANITOR_SIGNATURE_PATTERNS (and the orphan janitor) to si's new startup command.`,
        );
    }
});

/** Extracts the argument vector passed to `spawn(_powerShell, [...])` in si's powerShellStart. */
function extractPowerShellStartSpawnArgs(utilSource: string): readonly string[] {
    const functionIndex = utilSource.indexOf("function powerShellStart(");
    assert.notEqual(functionIndex, -1, "powerShellStart not found in systeminformation util.js");

    const spawnMatch = /spawn\(_powerShell,\s*\[([^\]]*)\]/u.exec(utilSource.slice(functionIndex));
    assert.notEqual(spawnMatch, null, "powerShellStart spawn argument array not found in systeminformation util.js");

    return (spawnMatch?.[1] ?? "")
        .split(",")
        .map(token => token.trim().replace(/^['"]|['"]$/gu, ""))
        .filter(token => token.length > 0);
}
