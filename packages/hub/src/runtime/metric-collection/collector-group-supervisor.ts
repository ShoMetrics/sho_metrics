import { logger } from "../../logging/logger";
import { BackoffPolicy } from "../sources/backoff-policy";
import { WINDOWS_HELPER_SOURCE_ID } from "../sources/source-ids";
import type { SourceRegistry } from "../sources/source-registry";
import {
    isInvalidSourceRefreshDemandError,
    type SourceRefreshDemandGroup,
} from "../sources/source-client";
import type { PlannedCollectorGroup } from "./collector-group-planner";
import {
    CollectorGroupRunner,
    type CollectorGroupRefreshResult,
    type CollectorGroupRunnerTimer,
    type CollectorGroupSnapshotStore,
} from "./collector-group-runner";
import type {
    MetricCollectionRefreshReason,
    MetricCollectionSubscriberRefreshResult,
    MetricCollectionSubscriberRefreshStatus,
} from "./metric-collection-refresh";

const log = logger.for("CollectorGroupSupervisor");
const MISSING_SOURCE_LOG_INTERVAL_MILLISECONDS = 30000;
const REFRESH_DEMAND_SEND_WARNING_INTERVAL_MILLISECONDS = 30000;
const DEMAND_RENEW_INTERVAL_MILLISECONDS = 8000;
const DEMAND_RENEW_RETRY_DELAY_MILLISECONDS = 2000;
const SUBSCRIBER_REFRESH_LOG_INTERVAL_MILLISECONDS = 5000;
const ALL_RUNNER_REFRESH_LOG_INTERVAL_MILLISECONDS = 30000;
const LHM_HARDWARE_POLLING_GROUP_PATTERN = /^lhm:hardware:\/([^/]+)/u;

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
    private readonly timer: CollectorGroupRunnerTimer;
    private readonly runnersByCollectorGroupKey = new Map<string, CollectorGroupRunner>();
    private latestWindowsHelperDemandGroups: readonly SourceRefreshDemandGroup[] = [];
    private latestWindowsHelperDemandFingerprint = buildRefreshDemandFingerprint([]);
    private lastAppliedWindowsHelperDemandFingerprint: string | undefined;
    private refreshDemandTimerHandle: unknown | null = null;
    private refreshDemandSendPromise: Promise<void> | null = null;
    private refreshDemandSendQueued = false;
    private shouldResendRefreshDemandAfterRecovery = false;

    constructor(options: CollectorGroupSupervisorOptions) {
        this.sourceRegistry = options.sourceRegistry;
        this.snapshotStore = options.snapshotStore;
        this.createBackoffPolicy = options.createBackoffPolicy;
        this.timer = options.timer ?? nodeCollectorGroupSupervisorTimer;
    }

    /**
     * Reconciles the latest plan with live background runner instances.
     *
     * This starts new runners, updates existing runners with the same
     * collectorGroupKey, and stops runners whose group disappeared. It does not
     * synchronously read sources; newly started runners wait for their timer.
     */
    reconcile(plannedCollectorGroups: readonly PlannedCollectorGroup[]): void {
        this.reconcileWindowsHelperRefreshDemand(plannedCollectorGroups);

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
        this.clearRefreshDemandTimer();
        this.refreshDemandSendQueued = false;
        this.latestWindowsHelperDemandGroups = [];
        this.latestWindowsHelperDemandFingerprint = buildRefreshDemandFingerprint([]);
        this.lastAppliedWindowsHelperDemandFingerprint = undefined;
        this.shouldResendRefreshDemandAfterRecovery = false;
    }

    /**
     * Requests an immediate pull for every live runner that backs a subscriber.
     *
     * This is subscriber fan-out only. It must not re-plan groups or resolve
     * sources; live runner ownership is established by `reconcile()`.
     */
    async requestSubscriberRefresh(
        subscriberId: string,
        reason: MetricCollectionRefreshReason,
    ): Promise<MetricCollectionSubscriberRefreshResult> {
        const matchingRunners: CollectorGroupRunner[] = [];

        for (const runner of this.runnersByCollectorGroupKey.values()) {
            if (runner.hasSubscriber(subscriberId)) {
                matchingRunners.push(runner);
            }
        }

        if (matchingRunners.length === 0) {
            const result = { status: "missingSubscriber" as const };
            this.recordSubscriberRefreshResult(reason, result.status, 0);
            return result;
        }

        const runnerResults = await Promise.all(
            matchingRunners.map(runner => runner.requestOnDemandRefresh()),
        );
        const result = {
            status: aggregateSubscriberRefreshStatus(runnerResults),
        };
        this.recordSubscriberRefreshResult(reason, result.status, matchingRunners.length);
        return result;
    }

    /**
     * Requests an immediate pull for every live collector group.
     *
     * This is a process-lifecycle recovery hook. It does not re-plan groups;
     * live runner ownership remains established by `reconcile()`.
     */
    async requestAllRefresh(reason: MetricCollectionRefreshReason): Promise<void> {
        // Must run before the demand resend and runner reads below: the first
        // post-resume failures would otherwise re-arm the very source cooldown
        // this recovery pass exists to clear.
        if (reason === "resumeRecovery") {
            this.notifyWindowsHelperProcessResumed();
        }

        this.renewWindowsHelperRefreshDemand(reason);

        const runners = [...this.runnersByCollectorGroupKey.values()];
        const runnerResults = await Promise.all(
            runners.map(runner => runner.requestOnDemandRefresh()),
        );
        const status = runners.length === 0 ? "skipped" : aggregateSubscriberRefreshStatus(runnerResults);

        log.atInfo()
            .everyMs(`all-runner-refresh:${reason}`, ALL_RUNNER_REFRESH_LOG_INTERVAL_MILLISECONDS)
            .log(() => [
                "allRunnerRefresh",
                `reason=${reason}`,
                `status=${status}`,
                `runnerCount=${runners.length}`,
            ].join(" "));
    }

    /**
     * Only the Windows helper client keeps cross-request failure state worth
     * clearing on resume today, so dispatch stays source-specific. Generalize
     * to every live source client when a second implementer appears.
     */
    private notifyWindowsHelperProcessResumed(): void {
        this.sourceRegistry.resolveSourceClient(WINDOWS_HELPER_SOURCE_ID)?.notifyProcessResumed?.();
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
            onRefreshResult: (refreshedCollectorGroup, result) => {
                this.recordCollectorGroupRefreshResult(refreshedCollectorGroup, result);
            },
        });

        this.runnersByCollectorGroupKey.set(collectorGroup.collectorGroupKey, runner);
        runner.start();
    }

    private recordSubscriberRefreshResult(
        reason: MetricCollectionRefreshReason,
        status: MetricCollectionSubscriberRefreshStatus,
        runnerCount: number,
    ): void {
        log.atDebug()
            .everyMs(
                `subscriber-refresh:${reason}:${status}`,
                SUBSCRIBER_REFRESH_LOG_INTERVAL_MILLISECONDS,
            )
            .log(() => [
                "subscriberRefresh",
                `reason=${reason}`,
                `status=${status}`,
                `runnerCount=${runnerCount}`,
            ].join(" "));
    }

    private reconcileWindowsHelperRefreshDemand(
        plannedCollectorGroups: readonly PlannedCollectorGroup[],
    ): void {
        // Windows helper snapshot reads are cache-only. Send demand from the
        // same plan that owns runner cadence so the helper can keep only the
        // visible polling groups warm before the runners read them.
        const nextDemandGroups = buildWindowsHelperRefreshDemand(plannedCollectorGroups);
        const nextDemandFingerprint = buildRefreshDemandFingerprint(nextDemandGroups);

        if (nextDemandFingerprint === this.latestWindowsHelperDemandFingerprint) {
            if (
                nextDemandGroups.length > 0
                && this.lastAppliedWindowsHelperDemandFingerprint !== nextDemandFingerprint
                && this.refreshDemandSendPromise === null
            ) {
                this.sendLatestWindowsHelperRefreshDemand();
                return;
            }

            if (
                nextDemandGroups.length > 0
                && this.refreshDemandTimerHandle === null
                && this.refreshDemandSendPromise === null
            ) {
                this.scheduleRefreshDemandSend(DEMAND_RENEW_INTERVAL_MILLISECONDS);
            }
            return;
        }

        this.latestWindowsHelperDemandGroups = nextDemandGroups;
        this.latestWindowsHelperDemandFingerprint = nextDemandFingerprint;
        this.shouldResendRefreshDemandAfterRecovery = false;
        log.info(() => [
            "windowsHelperRefreshDemandChanged",
            `groupCount=${nextDemandGroups.length}`,
            `metricCount=${countRefreshDemandMetrics(nextDemandGroups)}`,
            `groupKinds=${formatRefreshDemandGroupKinds(nextDemandGroups)}`,
            `minimumIntervalMs=${readMinimumRefreshDemandIntervalMilliseconds(nextDemandGroups)}`,
        ].join(" "));

        if (nextDemandGroups.length === 0) {
            this.clearRefreshDemandTimer();
        }

        this.sendLatestWindowsHelperRefreshDemand();
    }

    private recordCollectorGroupRefreshResult(
        collectorGroup: PlannedCollectorGroup,
        result: CollectorGroupRefreshResult,
    ): void {
        if (collectorGroup.sourceId !== WINDOWS_HELPER_SOURCE_ID) {
            return;
        }

        if (result.status === "failed" && this.latestWindowsHelperDemandGroups.length > 0) {
            this.shouldResendRefreshDemandAfterRecovery = true;
            return;
        }

        if (result.status !== "refreshed"
            || !this.shouldResendRefreshDemandAfterRecovery
            || this.latestWindowsHelperDemandGroups.length === 0) {
            return;
        }

        this.shouldResendRefreshDemandAfterRecovery = false;
        this.lastAppliedWindowsHelperDemandFingerprint = undefined;
        this.sendLatestWindowsHelperRefreshDemand();
    }

    private renewWindowsHelperRefreshDemand(reason: MetricCollectionRefreshReason): void {
        if (this.latestWindowsHelperDemandGroups.length === 0) {
            return;
        }

        this.clearRefreshDemandTimer();
        this.lastAppliedWindowsHelperDemandFingerprint = undefined;
        this.shouldResendRefreshDemandAfterRecovery = false;

        log.debug(() => [
            "windowsHelperRefreshDemandRenewed",
            `reason=${reason}`,
            `groupCount=${this.latestWindowsHelperDemandGroups.length}`,
            `metricCount=${countRefreshDemandMetrics(this.latestWindowsHelperDemandGroups)}`,
        ].join(" "));

        this.sendLatestWindowsHelperRefreshDemand();
    }

    private sendLatestWindowsHelperRefreshDemand(): void {
        if (this.refreshDemandSendPromise) {
            this.refreshDemandSendQueued = true;
            return;
        }

        const demandGroups = this.latestWindowsHelperDemandGroups;
        const demandFingerprint = this.latestWindowsHelperDemandFingerprint;

        if (
            demandFingerprint === this.lastAppliedWindowsHelperDemandFingerprint
            && demandGroups.length > 0
        ) {
            this.scheduleRefreshDemandSend(DEMAND_RENEW_INTERVAL_MILLISECONDS);
            return;
        }

        this.clearRefreshDemandTimer();

        const sourceClient = this.sourceRegistry.resolveSourceClient(WINDOWS_HELPER_SOURCE_ID);

        if (!sourceClient?.setMetricRefreshDemand) {
            log.atWarn()
                .everyMs("windows-helper-demand-source-missing", MISSING_SOURCE_LOG_INTERVAL_MILLISECONDS)
                .log(() => [
                    "windowsHelperRefreshDemandSkipped",
                    "reason=missingDemandClient",
                    `groupCount=${demandGroups.length}`,
                ].join(" "));
            return;
        }

        this.refreshDemandSendPromise = sourceClient.setMetricRefreshDemand(demandGroups)
            .then(() => {
                this.lastAppliedWindowsHelperDemandFingerprint = demandFingerprint;
                this.shouldResendRefreshDemandAfterRecovery = false;

                if (this.latestWindowsHelperDemandGroups.length > 0) {
                    this.scheduleRefreshDemandSend(DEMAND_RENEW_INTERVAL_MILLISECONDS);
                }
            })
            .catch(error => {
                this.recordRefreshDemandSendFailure(error, demandGroups.length);
            })
            .finally(() => {
                this.refreshDemandSendPromise = null;

                if (this.refreshDemandSendQueued) {
                    this.refreshDemandSendQueued = false;
                    this.sendLatestWindowsHelperRefreshDemand();
                }
            });
    }

    private recordRefreshDemandSendFailure(error: unknown, demandGroupCount: number): void {
        const isPermanentDemandFailure = isInvalidSourceRefreshDemandError(error);
        const shouldRetry = demandGroupCount > 0 && !isPermanentDemandFailure;

        if (shouldRetry) {
            this.shouldResendRefreshDemandAfterRecovery = true;
        } else if (isPermanentDemandFailure) {
            // Recovery cannot make the same invalid demand payload valid, so
            // do not keep resending it after an unrelated helper read recovers.
            this.shouldResendRefreshDemandAfterRecovery = false;
        }

        log.atWarn()
            .everyMs("windows-helper-demand-send-failed", REFRESH_DEMAND_SEND_WARNING_INTERVAL_MILLISECONDS)
            .log(() => [
                "windowsHelperRefreshDemandFailed",
                `groupCount=${demandGroupCount}`,
                `retryMs=${shouldRetry ? DEMAND_RENEW_RETRY_DELAY_MILLISECONDS : 0}`,
                `error=${String(error)}`,
            ].join(" "));

        if (shouldRetry) {
            this.scheduleRefreshDemandSend(DEMAND_RENEW_RETRY_DELAY_MILLISECONDS);
        }
    }

    private scheduleRefreshDemandSend(delayMilliseconds: number): void {
        if (this.refreshDemandTimerHandle !== null || this.latestWindowsHelperDemandGroups.length === 0) {
            return;
        }

        this.refreshDemandTimerHandle = this.timer.set(() => {
            this.refreshDemandTimerHandle = null;
            this.lastAppliedWindowsHelperDemandFingerprint = undefined;
            this.sendLatestWindowsHelperRefreshDemand();
        }, delayMilliseconds);
    }

    private clearRefreshDemandTimer(): void {
        if (this.refreshDemandTimerHandle === null) {
            return;
        }

        this.timer.clear(this.refreshDemandTimerHandle);
        this.refreshDemandTimerHandle = null;
    }
}

function aggregateSubscriberRefreshStatus(
    runnerResults: readonly CollectorGroupRefreshResult[],
): MetricCollectionSubscriberRefreshStatus {
    const runnerStatuses = runnerResults.map(result => readSubscriberRefreshStatusComponent(result.status));
    const refreshedCount = runnerStatuses.filter(status => status === "refreshed").length;

    if (refreshedCount === runnerResults.length) {
        return "refreshed";
    }

    if (refreshedCount > 0) {
        return "partial";
    }

    if (runnerStatuses.some(status => status === "failed")) {
        return "failed";
    }

    if (runnerStatuses.some(status => status === "pending")) {
        return "pending";
    }

    if (runnerStatuses.some(status => status === "backoff")) {
        return "backoff";
    }

    return "skipped";
}

function readSubscriberRefreshStatusComponent(
    status: CollectorGroupRefreshResult["status"],
): MetricCollectionSubscriberRefreshStatus {
    switch (status) {
        case "refreshed":
            return "refreshed";
        case "failed":
            return "failed";
        case "skippedPending":
            return "pending";
        case "skippedBackoff":
            return "backoff";
        case "skippedSuperseded":
        case "stopped":
            return "skipped";
    }
}

function buildWindowsHelperRefreshDemand(
    plannedCollectorGroups: readonly PlannedCollectorGroup[],
): readonly SourceRefreshDemandGroup[] {
    return plannedCollectorGroups
        .filter((collectorGroup): collectorGroup is PlannedCollectorGroup & { readonly groupKind: "sourceDeclared" } => (
            collectorGroup.sourceId === WINDOWS_HELPER_SOURCE_ID
            && collectorGroup.groupKind === "sourceDeclared"
        ))
        .map(collectorGroup => ({
            pollingGroupId: collectorGroup.pollingGroupId,
            metricKeys: [...collectorGroup.metricKeys].sort(),
            intervalMilliseconds: collectorGroup.intervalMilliseconds,
        }))
        .sort((left, right) => left.pollingGroupId.localeCompare(right.pollingGroupId));
}

function buildRefreshDemandFingerprint(groups: readonly SourceRefreshDemandGroup[]): string {
    return JSON.stringify(groups
        .map(group => ({
            pollingGroupId: group.pollingGroupId,
            metricKeys: [...group.metricKeys].sort(),
            intervalMilliseconds: group.intervalMilliseconds,
        }))
        .sort(compareRefreshDemandFingerprintGroups));
}

function compareRefreshDemandFingerprintGroups(
    left: RefreshDemandFingerprintGroup,
    right: RefreshDemandFingerprintGroup,
): number {
    return left.pollingGroupId.localeCompare(right.pollingGroupId)
        || left.intervalMilliseconds - right.intervalMilliseconds
        || left.metricKeys.join("\0").localeCompare(right.metricKeys.join("\0"));
}

interface RefreshDemandFingerprintGroup {
    readonly pollingGroupId: string;
    readonly metricKeys: readonly string[];
    readonly intervalMilliseconds: number;
}

function countRefreshDemandMetrics(groups: readonly SourceRefreshDemandGroup[]): number {
    return groups.reduce((metricCount, group) => metricCount + group.metricKeys.length, 0);
}

function readMinimumRefreshDemandIntervalMilliseconds(groups: readonly SourceRefreshDemandGroup[]): number {
    if (groups.length === 0) {
        return 0;
    }

    return Math.min(...groups.map(group => group.intervalMilliseconds));
}

function formatRefreshDemandGroupKinds(groups: readonly SourceRefreshDemandGroup[]): string {
    if (groups.length === 0) {
        return "none";
    }

    const countsByKind = new Map<string, number>();

    for (const group of groups) {
        const groupKind = classifyRefreshDemandPollingGroupForLog(group.pollingGroupId);
        countsByKind.set(groupKind, (countsByKind.get(groupKind) ?? 0) + 1);
    }

    return [...countsByKind.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, count]) => `${kind}:${count}`)
        .join(",");
}

/**
 * Classifies a source-owned polling group id into a coarse log-only bucket.
 *
 * This keeps demand-change logs useful without writing hardware or sensor
 * identity that could expose local machine details.
 * Keep this in sync with SourceRequestHandler.ClassifyDemandPollingGroupForLog.
 * Do not use this for scheduling, routing, security, or UI/product behavior.
 * Runtime behavior must continue to use the helper-owned polling group id.
 */
export function classifyRefreshDemandPollingGroupForLog(pollingGroupId: string): string {
    const normalizedPollingGroupId = pollingGroupId.toLowerCase();

    if (normalizedPollingGroupId === "windows-native:aggregate:disk") {
        return "disk";
    }

    if (normalizedPollingGroupId === "lhm:aggregate:network") {
        return "network";
    }

    const match = LHM_HARDWARE_POLLING_GROUP_PATTERN.exec(normalizedPollingGroupId);
    return match ? classifyLhmHardwareIdentifierRootForLog(match[1] ?? "") : "other";
}

function classifyLhmHardwareIdentifierRootForLog(identifierRoot: string): string {
    if (identifierRoot.startsWith("gpu")) {
        return "gpu";
    }

    switch (identifierRoot) {
        case "intelcpu":
        case "amdcpu":
        case "cpu":
            return "cpu";
        case "ram":
        case "memory":
            return "ram";
        case "nvme":
        case "ssd":
        case "hdd":
        case "storage":
        case "ata":
            return "storage";
        case "nic":
        case "network":
            return "network";
        case "mainboard":
        case "motherboard":
        case "superio":
        case "lpc":
            return "motherboard";
        case "cooler":
        case "battery":
        case "psu":
            return identifierRoot;
        case "ec":
        case "embedded-controller":
            return "embedded-controller";
        case "power-monitor":
            return "power-monitor";
        default:
            return "hardware";
    }
}

const nodeCollectorGroupSupervisorTimer: CollectorGroupRunnerTimer = {
    set: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    clear: handle => clearTimeout(handle as NodeJS.Timeout),
};
