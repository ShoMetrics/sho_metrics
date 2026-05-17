export interface DurationAccumulator {
    count: number;
    totalMilliseconds: number;
    maximumMilliseconds: number | null;
}

export interface DurationSummary {
    readonly count: number;
    readonly averageMilliseconds: number | null;
    readonly maximumMilliseconds: number | null;
}

export function createDurationAccumulator(): DurationAccumulator {
    return {
        count: 0,
        totalMilliseconds: 0,
        maximumMilliseconds: null,
    };
}

export function addDurationSample(
    durationAccumulator: DurationAccumulator,
    durationMilliseconds: number | null,
): void {
    if (durationMilliseconds == null) {
        return;
    }

    durationAccumulator.count += 1;
    durationAccumulator.totalMilliseconds += durationMilliseconds;
    durationAccumulator.maximumMilliseconds = durationAccumulator.maximumMilliseconds == null
        ? durationMilliseconds
        : Math.max(durationAccumulator.maximumMilliseconds, durationMilliseconds);
}

export function summarizeDuration(durationAccumulator: DurationAccumulator): DurationSummary {
    if (durationAccumulator.count === 0) {
        return {
            count: 0,
            averageMilliseconds: null,
            maximumMilliseconds: null,
        };
    }

    return {
        count: durationAccumulator.count,
        averageMilliseconds: durationAccumulator.totalMilliseconds / durationAccumulator.count,
        maximumMilliseconds: durationAccumulator.maximumMilliseconds,
    };
}
