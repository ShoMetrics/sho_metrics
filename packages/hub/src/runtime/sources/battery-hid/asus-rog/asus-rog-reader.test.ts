import assert from "node:assert/strict";
import test from "node:test";
import type { NativeHidDevice } from "../native-hid-loader-internal";
import {
    buildAsusRogKeyboardOmniBatteryRequest,
    parseAsusRogKeyboardOmniBatteryReport,
} from "./asus-rog-protocol";
import { NativeAsusRogHidTransport } from "./asus-rog-reader";

test("ASUS ROG reader maps malformed matching reports to no-data", () => {
    const transport = new NativeAsusRogHidTransport(new FakeNativeHidDevice([
        [0x02, 0x12, 0x01],
    ]));

    const result = transport.exchange(
        buildAsusRogKeyboardOmniBatteryRequest(),
        parseAsusRogKeyboardOmniBatteryReport,
    );

    assert.deepEqual(result, {
        state: "noData",
        reason: "malformed",
        unrelatedReportCount: 0,
    });
});

class FakeNativeHidDevice implements NativeHidDevice {
    constructor(private readonly reports: number[][]) {}

    close(): void {}

    getFeatureReport(): number[] {
        return [];
    }

    readTimeout(): number[] {
        return this.reports.shift() ?? [];
    }

    sendFeatureReport(): number {
        return 0;
    }

    write(data: number[] | Buffer): number {
        return data.length;
    }
}
