export interface MetricImageResendJitterKeyInput {
    readonly deviceId: string;
    readonly controller: string;
    readonly row: number;
    readonly column: number;
}

export function buildMetricImageResendJitterKey(input: MetricImageResendJitterKeyInput): string {
    return [
        input.deviceId,
        input.controller,
        input.row,
        input.column,
    ].join(":");
}

export function computeStableMetricImageResendJitterMilliseconds(
    jitterKey: string,
    jitterWindowMilliseconds: number,
): number {
    if (!Number.isSafeInteger(jitterWindowMilliseconds) || jitterWindowMilliseconds <= 0) {
        return 0;
    }

    return stableHashString(jitterKey) % jitterWindowMilliseconds;
}

function stableHashString(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash, 31) + value.charCodeAt(index);
        hash >>>= 0;
    }

    return hash;
}
