import { shometrics } from "../../generated/snapshot.js";

export type IMetricSnapshot = shometrics.v1.IMetricSnapshot;
export type IMetricValue = shometrics.v1.IMetricValue;

/**
 * Metric source interface.
 * All sources (built-in, native probes, push API) implement this contract.
 * The Scheduler consumes this interface — never a concrete implementation.
 */
export interface IMetricSource {
    /** Human-readable identifier, e.g. "builtin-node", "win-native" */
    readonly sourceId: string;

    /** Fetch the latest metrics snapshot in the universal protobuf-defined format. */
    poll(): Promise<IMetricSnapshot>;

    /** Optional cleanup on shutdown. */
    dispose?(): void;
}
