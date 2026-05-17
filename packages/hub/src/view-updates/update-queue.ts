export type MetricViewUpdatePriority = "settings-change" | "metric-tick";

/**
 * Queue for metric view updates.
 *
 * Settings changes are user-visible control feedback, so they are allowed to
 * move ahead of ordinary metric ticks without increasing global render
 * concurrency. Each action id appears at most once; repeated requests collapse
 * into the latest pending options stored by the caller.
 */
export class MetricViewUpdateQueue {
    private readonly settingsActionIds: string[] = [];
    private readonly metricActionIds: string[] = [];
    private readonly priorityByActionId = new Map<string, MetricViewUpdatePriority>();

    enqueue(actionId: string, priority: MetricViewUpdatePriority): void {
        const existingPriority = this.priorityByActionId.get(actionId);

        if (existingPriority === "settings-change" || existingPriority === priority) {
            return;
        }

        if (existingPriority === "metric-tick" && priority === "settings-change") {
            removeArrayItem(this.metricActionIds, actionId);
            this.settingsActionIds.push(actionId);
            this.priorityByActionId.set(actionId, priority);
            return;
        }

        this.priorityByActionId.set(actionId, priority);

        if (priority === "settings-change") {
            this.settingsActionIds.push(actionId);
            return;
        }

        this.metricActionIds.push(actionId);
    }

    dequeue(): string | undefined {
        const actionId = this.settingsActionIds.shift() ?? this.metricActionIds.shift();

        if (actionId) {
            this.priorityByActionId.delete(actionId);
        }

        return actionId;
    }

    remove(actionId: string): void {
        const priority = this.priorityByActionId.get(actionId);

        if (!priority) {
            return;
        }

        if (priority === "settings-change") {
            removeArrayItem(this.settingsActionIds, actionId);
        } else {
            removeArrayItem(this.metricActionIds, actionId);
        }

        this.priorityByActionId.delete(actionId);
    }

    has(actionId: string): boolean {
        return this.priorityByActionId.has(actionId);
    }

    get length(): number {
        return this.settingsActionIds.length + this.metricActionIds.length;
    }
}

function removeArrayItem(items: string[], item: string): void {
    const itemIndex = items.indexOf(item);

    if (itemIndex >= 0) {
        items.splice(itemIndex, 1);
    }
}
