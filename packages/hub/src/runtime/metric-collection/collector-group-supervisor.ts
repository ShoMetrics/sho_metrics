import { logger } from "../../logging/logger";
import { BackoffPolicy } from "../sources/backoff-policy";
import type { SourceRegistry } from "../sources/source-registry";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import {
    CollectorGroupRunner,
    type CollectorGroupRunnerTimer,
    type CollectorGroupSnapshotStore,
} from "./collector-group-runner";

const log = logger.for("CollectorGroupSupervisor");
const MISSING_SOURCE_LOG_INTERVAL_MILLISECONDS = 30000;

export type CollectorGroupBackoffPolicyFactory = (collectorGroup: PlannedCollectorGroup) => BackoffPolicy;

export interface CollectorGroupSupervisorOptions {
    readonly sourceRegistry: Pick<SourceRegistry, "resolveSourceClient">;
    readonly snapshotStore: CollectorGroupSnapshotStore;
    readonly createBackoffPolicy: CollectorGroupBackoffPolicyFactory;
    readonly timer?: CollectorGroupRunnerTimer;
}

/**
 * Owns CollectorGroupRunner lifecycles for planned background collector groups.
 *
 * "Supervisor" is intentional: this class supervises runner lifecycles only.
 * It is not a manager for planning, fallback composition, store reads, or
 * rendering.
 *
 * It does not plan groups, compose fallbacks, read MetricStore, or render
 * widgets. It only reconciles the latest planned groups with running loops.
 */
export class CollectorGroupSupervisor {
    private readonly sourceRegistry: Pick<SourceRegistry, "resolveSourceClient">;
    private readonly snapshotStore: CollectorGroupSnapshotStore;
    private readonly createBackoffPolicy: CollectorGroupBackoffPolicyFactory;
    private readonly timer?: CollectorGroupRunnerTimer;
    private readonly runnersByCollectorGroupKey = new Map<string, CollectorGroupRunner>();

    constructor(options: CollectorGroupSupervisorOptions) {
        this.sourceRegistry = options.sourceRegistry;
        this.snapshotStore = options.snapshotStore;
        this.createBackoffPolicy = options.createBackoffPolicy;
        this.timer = options.timer;
    }

    /**
     * Reconciles the latest plan with live background runner instances.
     *
     * This starts new runners, updates existing runners with the same
     * collectorGroupKey, and stops runners whose group disappeared. It does not
     * synchronously read sources; newly started runners wait for their timer.
     */
    reconcile(plannedCollectorGroups: readonly PlannedCollectorGroup[]): void {
        const nextCollectorGroupKeys = new Set(
            plannedCollectorGroups.map(collectorGroup => collectorGroup.collectorGroupKey),
        );
        const collectorGroupKeysToStop: string[] = [];

        for (const collectorGroupKey of this.runnersByCollectorGroupKey.keys()) {
            if (!nextCollectorGroupKeys.has(collectorGroupKey)) {
                collectorGroupKeysToStop.push(collectorGroupKey);
            }
        }

        for (const collectorGroupKey of collectorGroupKeysToStop) {
            const runner = this.runnersByCollectorGroupKey.get(collectorGroupKey);
            if (!runner) {
                continue;
            }
            runner.stop();
            this.runnersByCollectorGroupKey.delete(collectorGroupKey);
        }

        for (const collectorGroup of plannedCollectorGroups) {
            const existingRunner = this.runnersByCollectorGroupKey.get(collectorGroup.collectorGroupKey);

            if (existingRunner) {
                existingRunner.updateCollectorGroup(collectorGroup);
                continue;
            }

            this.startRunner(collectorGroup);
        }
    }

    stopAll(): void {
        for (const runner of this.runnersByCollectorGroupKey.values()) {
            runner.stop();
        }

        this.runnersByCollectorGroupKey.clear();
    }

    private startRunner(collectorGroup: PlannedCollectorGroup): void {
        const sourceClient = this.sourceRegistry.resolveSourceClient(collectorGroup.sourceId);

        if (!sourceClient) {
            log.atWarn()
                .everyMs(`missing-source:${collectorGroup.sourceId}`, MISSING_SOURCE_LOG_INTERVAL_MILLISECONDS)
                .log(() => [
                    "collectorGroupSkipped",
                    "reason=missingSource",
                    `sourceId=${collectorGroup.sourceId}`,
                    `sourceScopeId=${collectorGroup.sourceScopeId}`,
                    `metricCount=${collectorGroup.metricKeys.length}`,
                ].join(" "));
            return;
        }

        const runner = new CollectorGroupRunner({
            collectorGroup,
            sourceClient,
            snapshotStore: this.snapshotStore,
            backoffPolicy: this.createBackoffPolicy(collectorGroup),
            timer: this.timer,
        });

        this.runnersByCollectorGroupKey.set(collectorGroup.collectorGroupKey, runner);
        runner.start();
    }
}
