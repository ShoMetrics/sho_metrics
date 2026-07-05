import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "vitest";
import { resolveWindowsPowerShellExecutablePath } from "./windows-powershell-executable";

test("resolves the absolute Windows PowerShell path when it exists", () => {
    const resolved = resolveWindowsPowerShellExecutablePath(
        () => true,
        { WINDIR: "D:\\Windows" } as NodeJS.ProcessEnv,
    );

    assert.equal(resolved, "D:\\Windows\\system32\\WindowsPowerShell\\v1.0\\powershell.exe");
});

test("falls back to the bare executable name when the absolute path is missing", () => {
    const resolved = resolveWindowsPowerShellExecutablePath(
        () => false,
        { WINDIR: "D:\\Windows" } as NodeJS.ProcessEnv,
    );

    assert.equal(resolved, "powershell.exe");
});

test("defaults an empty or unset WINDIR to C:\\Windows like systeminformation's falsy fallback", () => {
    for (const environment of [{} as NodeJS.ProcessEnv, { WINDIR: "" } as NodeJS.ProcessEnv]) {
        assert.equal(
            resolveWindowsPowerShellExecutablePath(() => true, environment),
            "C:\\Windows\\system32\\WindowsPowerShell\\v1.0\\powershell.exe",
        );
    }
});

// Our janitor and Bluetooth PowerShell calls must invoke the exact interpreter
// systeminformation invokes, so a machine that blocks si's PowerShell fails our
// queries the same way instead of diverging. Pin our resolution against si's
// real getPowershell() source so a version bump that changes it fails here.
test("matches systeminformation's getPowershell resolution", () => {
    const require = createRequire(import.meta.url);
    const utilSource = readFileSync(require.resolve("systeminformation/lib/util.js"), "utf8");

    const windirMatch = /const WINDIR = process\.env\.WINDIR \|\| '([^']*)'/u.exec(utilSource);
    assert.notEqual(windirMatch, null, "systeminformation util.js no longer defines WINDIR with a C:\\Windows fallback");
    assert.equal(windirMatch?.[1], "C:\\\\Windows");

    const defaultPathMatch = /const defaultPath = `\$\{WINDIR\}\\\\([^`]*)`/u.exec(utilSource);
    assert.notEqual(defaultPathMatch, null, "systeminformation getPowershell no longer builds the v1.0 PowerShell path");
    assert.equal(defaultPathMatch?.[1], "system32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe");
});
