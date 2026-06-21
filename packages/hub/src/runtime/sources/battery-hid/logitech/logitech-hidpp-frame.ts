/** Defines the ShoMetrics-owned HID++ frame shape shared by protocol readers. */

export const LOGITECH_HIDPP_SHORT_REPORT_ID = 0x10;
export const LOGITECH_HIDPP_LONG_REPORT_ID = 0x11;

/** HID++ receiver paired-device slot, called device index in HID++ framing. */
export type LogitechReceiverSlot = number;

export interface LogitechHidppRequest {
    readonly bytes: readonly number[];
    readonly expectedResponse: LogitechHidppExpectedResponse;
}

/** Strict response header expected for one HID++ request. */
export interface LogitechHidppExpectedResponse {
    readonly receiverSlot: LogitechReceiverSlot;
    readonly featureIndex: number;
    readonly functionByte: number;
}
