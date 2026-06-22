import assert from "node:assert/strict";
import { test } from "vitest";
import { isWindowsServiceNotInstalledQueryError } from "./windows-helper-service-status";

test("Windows helper service status recognizes SC 1060 exit code", () => {
    assert.equal(
        isWindowsServiceNotInstalledQueryError({
            code: 1060,
            message: "Command failed: sc.exe query ShoMetrics Source Windows\n",
            stdout: "[SC] EnumQueryServicesStatus:OpenService FAILED 1060:\r\n\r\n",
            stderr: "",
        }),
        true,
    );
});

test("Windows helper service status recognizes SC 1060 string exit code", () => {
    assert.equal(
        isWindowsServiceNotInstalledQueryError({
            code: "1060",
            message: "Command failed: sc.exe query ShoMetrics Source Windows\n",
            stdout: "",
            stderr: "",
        }),
        true,
    );
});

test("Windows helper service status recognizes SC 1060 output text", () => {
    assert.equal(
        isWindowsServiceNotInstalledQueryError({
            code: 1,
            message: "Command failed: sc.exe query ShoMetrics Source Windows\n",
            stdout: "[SC] EnumQueryServicesStatus:OpenService FAILED 1060:\r\n\r\n",
            stderr: "",
        }),
        true,
    );
});

test("Windows helper service status recognizes service-missing output text", () => {
    assert.equal(
        isWindowsServiceNotInstalledQueryError({
            code: 1,
            message: "Command failed: sc.exe query ShoMetrics Source Windows\n",
            stdout: "The specified service does not exist as an installed service.",
            stderr: "",
        }),
        true,
    );
});

test("Windows helper service status rejects unrelated query failures", () => {
    assert.equal(
        isWindowsServiceNotInstalledQueryError({
            code: 5,
            message: "Command failed: sc.exe query ShoMetrics Source Windows\n",
            stdout: "Access is denied.",
            stderr: "",
        }),
        false,
    );
});
