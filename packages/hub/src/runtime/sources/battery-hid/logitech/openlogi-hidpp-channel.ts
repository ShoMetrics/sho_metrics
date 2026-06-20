/**
 * OpenLogi-isomorphic HID++ pending-response matching.
 *
 * Source: OpenLogi
 * File: `crates/openlogi-hidpp/src/channel.rs`
 * Commit: `87a8d21a1fff1c562ff3c0f63445a985a254eebd`
 * License: MIT OR Apache-2.0
 */

export type OpenLogiHidppResponseMatcher = (report: readonly number[]) => boolean;
export type OpenLogiHidppMessageListener = (report: readonly number[], matched: boolean) => void;

export interface OpenLogiPendingResponse {
    readonly id: number;
}

export interface OpenLogiIncomingResponseMatch {
    readonly matched: boolean;
    readonly pendingResponseId?: number;
}

/**
 * Tracks pending HID++ requests the way OpenLogi's channel read loop does.
 *
 * The real OpenLogi channel registers a response predicate before writing a
 * request, then the read thread removes the first pending entry whose predicate
 * accepts an incoming report. A timeout or write failure removes only that
 * request's entry, so a later response cannot satisfy a future transaction.
 */
export class OpenLogiPendingResponseQueue {
    private readonly pendingResponses: OpenLogiPendingResponseEntry[] = [];
    private readonly messageListeners = new Map<number, OpenLogiHidppMessageListener>();
    private nextPendingResponseId = 1;
    private nextMessageListenerId = 1;

    addPendingResponse(matchesResponse: OpenLogiHidppResponseMatcher): OpenLogiPendingResponse {
        const pendingResponse = {
            id: this.nextPendingResponseId,
            matchesResponse,
        };
        this.nextPendingResponseId += 1;
        this.pendingResponses.push(pendingResponse);
        return {
            id: pendingResponse.id,
        };
    }

    removePendingResponse(pendingResponse: OpenLogiPendingResponse): void {
        const pendingIndex = this.pendingResponses.findIndex(entry => entry.id === pendingResponse.id);
        if (pendingIndex >= 0) {
            this.pendingResponses.splice(pendingIndex, 1);
        }
    }

    matchIncomingResponse(report: readonly number[]): OpenLogiIncomingResponseMatch {
        const pendingIndex = this.pendingResponses.findIndex(entry => entry.matchesResponse(report));
        if (pendingIndex < 0) {
            this.notifyMessageListeners(report, false);
            return {
                matched: false,
            };
        }

        const [matchedEntry] = this.pendingResponses.splice(pendingIndex, 1);
        this.notifyMessageListeners(report, true);
        return {
            matched: true,
            pendingResponseId: matchedEntry?.id,
        };
    }

    addMessageListener(listener: OpenLogiHidppMessageListener): number {
        const listenerId = this.nextMessageListenerId;
        this.nextMessageListenerId += 1;
        this.messageListeners.set(listenerId, listener);
        return listenerId;
    }

    removeMessageListener(listenerId: number): boolean {
        return this.messageListeners.delete(listenerId);
    }

    pendingResponseCount(): number {
        return this.pendingResponses.length;
    }

    private notifyMessageListeners(report: readonly number[], matched: boolean): void {
        for (const listener of this.messageListeners.values()) {
            listener(report, matched);
        }
    }
}

interface OpenLogiPendingResponseEntry {
    readonly id: number;
    readonly matchesResponse: OpenLogiHidppResponseMatcher;
}
