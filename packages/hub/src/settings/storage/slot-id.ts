export type SlotIdGenerator = () => string;

let fallbackSlotIdCounter = 0;
const MAX_UNIQUE_SLOT_ID_GENERATION_ATTEMPTS = 16;

/** Creates a stable id for a new multi-slot widget item. */
export function createDefaultSlotId(): string {
    return globalThis.crypto?.randomUUID?.()
        ?? `metric-slot-${(++fallbackSlotIdCounter).toString(36)}`;
}

/** Creates a multi-slot widget item id that does not collide with existing ids. */
export function createUniqueSlotId(
    existingSlotIds: ReadonlySet<string>,
    createSlotId: SlotIdGenerator,
): string {
    for (let attemptCount = 0; attemptCount < MAX_UNIQUE_SLOT_ID_GENERATION_ATTEMPTS; attemptCount += 1) {
        const slotId = createSlotId();
        if (!existingSlotIds.has(slotId)) {
            return slotId;
        }
    }

    throw new Error("Could not generate a unique dense metric slot id.");
}
