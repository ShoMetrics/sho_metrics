import assert from "node:assert/strict";
import test from "node:test";
import type { NativeHidDevice } from "../native-hid-loader-internal";
import {
    LOGITECH_HIDPP_LONG_REPORT_ID,
    LOGITECH_HIDPP_SHORT_REPORT_ID,
} from "./hidpp-protocol";
import type { OpenLogiHidppRequest } from "./openlogi-hidpp-battery-reader";
import { buildOpenLogiTriggerDeviceArrivalRequest } from "./openlogi-hidpp-receiver-registers";
import { OpenLogiNativeHidppTransport } from "./openlogi-native-hidpp-transport";

test("OpenLogi native transport writes a request and returns the matching response", () => {
    const device = new OpenLogiFakeHidDevice([
        [LOGITECH_HIDPP_SHORT_REPORT_ID, 0xFF, 0x11, 0x22, 0x00, 0x00, 0x00],
        [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x01, 0x02, 0x03, 0x00, 0x00, 0x00],
    ]);
    const transport = createTransport(device);

    const result = transport.exchange(createShortRequest());

    assert.deepEqual(result, {
        state: "response",
        report: [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x01, 0x02, 0x03, 0x00, 0x00, 0x00],
    });
    assert.deepEqual(device.writes, [[LOGITECH_HIDPP_SHORT_REPORT_ID, 0x01, 0x02, 0x03, 0x00, 0x00, 0x00]]);
});

test("OpenLogi native transport returns HID++ device errors", () => {
    const device = new OpenLogiFakeHidDevice([
        [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x01, 0xFF, 0x02, 0x03, 0x08, 0x00],
    ]);
    const transport = createTransport(device);

    assert.deepEqual(transport.exchange(createShortRequest()), {
        state: "deviceError",
        errorCode: 0x08,
    });
});

test("OpenLogi native transport returns HID++1.0 protocol fallback frames for root ping", () => {
    const device = new OpenLogiFakeHidDevice([
        [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x02, 0x8F, 0x00, 0x11, 0x01, 0x00],
    ]);
    const transport = createTransport(device);

    assert.deepEqual(transport.exchange(createShortRequest({
        bytes: [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x02, 0x00, 0x11, 0x00, 0x00, 0x00],
        expectedResponse: {
            receiverSlot: 0x02,
            featureIndex: 0x00,
            functionByte: 0x11,
        },
    })), {
        state: "response",
        report: [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x02, 0x8F, 0x00, 0x11, 0x01, 0x00],
    });
});

test("OpenLogi native transport respects request timeout", () => {
    const clock = new OpenLogiFakeClock();
    const device = new OpenLogiFakeHidDevice([], () => clock.advance(20));
    const transport = new OpenLogiNativeHidppTransport(
        device,
        [device],
        {
            supportsShortReports: true,
            supportsLongReports: true,
        },
        () => clock.now(),
    );

    assert.deepEqual(transport.exchange(createShortRequest({ timeoutMilliseconds: 40 })), {
        state: "timeout",
    });
    assert.equal(device.readTimeouts.length, 2);
});

test("OpenLogi native transport widens short requests for long-only routes", () => {
    const device = new OpenLogiFakeHidDevice([
        [LOGITECH_HIDPP_LONG_REPORT_ID, 0x01, 0x02, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    ]);
    const transport = new OpenLogiNativeHidppTransport(
        device,
        [device],
        {
            supportsShortReports: false,
            supportsLongReports: true,
        },
        () => 0,
    );

    assert.deepEqual(transport.exchange(createShortRequest()).state, "response");
    assert.deepEqual(device.writes[0], [
        LOGITECH_HIDPP_LONG_REPORT_ID,
        0x01,
        0x02,
        0x03,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
    ]);
});

test("OpenLogi native transport closes every opened read handle", () => {
    const writeDevice = new OpenLogiFakeHidDevice([]);
    const readDevice = new OpenLogiFakeHidDevice([]);
    const transport = new OpenLogiNativeHidppTransport(
        writeDevice,
        [writeDevice, readDevice],
        {
            supportsShortReports: true,
            supportsLongReports: true,
        },
        () => 0,
    );

    transport.close();

    assert.equal(writeDevice.closeCount, 1);
    assert.equal(readDevice.closeCount, 1);
});

test("OpenLogi native transport keeps arrival events that race the trigger acknowledgement", () => {
    const clock = new OpenLogiFakeClock();
    const triggerRequest = buildOpenLogiTriggerDeviceArrivalRequest();
    const device = new OpenLogiFakeHidDevice([
        [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x02, 0x41, 0x00, 0x22, 0x34, 0x12],
        buildShortRegisterResponse(triggerRequest, [0x00, 0x00, 0x00]),
        [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x03, 0x41, 0x00, 0x21, 0x78, 0x56],
    ], () => clock.advance(20));
    const transport = new OpenLogiNativeHidppTransport(
        device,
        [device],
        {
            supportsShortReports: true,
            supportsLongReports: true,
        },
        () => clock.now(),
    );

    assert.deepEqual(transport.drainReceiverConnectionEvents({
        receiverKind: "bolt",
        triggerRequest,
        timeoutMilliseconds: 40,
    }), [{
        receiverSlot: 0x02,
        deviceKind: "mouse",
        encrypted: true,
        online: true,
        wirelessProductId: 0x1234,
    }, {
        receiverSlot: 0x03,
        deviceKind: "keyboard",
        encrypted: true,
        online: true,
        wirelessProductId: 0x5678,
    }]);
});

test("OpenLogi native transport reports failed arrival trigger as unavailable drain", () => {
    const clock = new OpenLogiFakeClock();
    const triggerRequest = buildOpenLogiTriggerDeviceArrivalRequest();
    const device = new OpenLogiFakeHidDevice([
        [LOGITECH_HIDPP_SHORT_REPORT_ID, 0xFF, 0x8F, 0x80, 0x02, 0x08, 0x00],
    ], () => clock.advance(20));
    const transport = new OpenLogiNativeHidppTransport(
        device,
        [device],
        {
            supportsShortReports: true,
            supportsLongReports: true,
        },
        () => clock.now(),
    );

    assert.equal(transport.drainReceiverConnectionEvents({
        receiverKind: "bolt",
        triggerRequest,
        timeoutMilliseconds: 40,
    }), undefined);
});

function createShortRequest(overrides?: Partial<OpenLogiHidppRequest>): OpenLogiHidppRequest {
    return {
        bytes: [LOGITECH_HIDPP_SHORT_REPORT_ID, 0x01, 0x02, 0x03, 0x00, 0x00, 0x00],
        expectedResponse: {
            receiverSlot: 0x01,
            featureIndex: 0x02,
            functionByte: 0x03,
        },
        timeoutMilliseconds: 100,
        ...overrides,
    };
}

function createTransport(device: OpenLogiFakeHidDevice): OpenLogiNativeHidppTransport {
    return new OpenLogiNativeHidppTransport(
        device,
        [device],
        {
            supportsShortReports: true,
            supportsLongReports: true,
        },
        () => 0,
    );
}

function buildShortRegisterResponse(request: OpenLogiHidppRequest, payload: readonly number[]): readonly number[] {
    return [
        LOGITECH_HIDPP_SHORT_REPORT_ID,
        request.bytes[1] ?? 0,
        request.bytes[2] ?? 0,
        request.bytes[3] ?? 0,
        payload[0] ?? 0,
        payload[1] ?? 0,
        payload[2] ?? 0,
    ];
}

class OpenLogiFakeClock {
    private milliseconds = 0;

    now(): number {
        return this.milliseconds;
    }

    advance(milliseconds: number): void {
        this.milliseconds += milliseconds;
    }
}

class OpenLogiFakeHidDevice implements NativeHidDevice {
    readonly writes: number[][] = [];
    readonly readTimeouts: number[] = [];
    closeCount = 0;
    private readonly reports: Array<readonly number[]>;

    constructor(
        reports: readonly (readonly number[])[],
        private readonly afterReadTimeout?: () => void,
    ) {
        this.reports = [...reports];
    }

    close(): void {
        this.closeCount += 1;
    }

    readTimeout(milliseconds: number): number[] {
        this.readTimeouts.push(milliseconds);
        const report = this.reports.shift() ?? [];
        this.afterReadTimeout?.();
        return [...report];
    }

    write(data: number[] | Buffer): number {
        this.writes.push([...data]);
        return data.length;
    }

    getFeatureReport(): number[] {
        throw new Error("OpenLogi native transport tests do not use feature reports.");
    }

    sendFeatureReport(): number {
        throw new Error("OpenLogi native transport tests do not use feature reports.");
    }
}
