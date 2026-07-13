import type { HelperUpdateUrgency } from "../../../runtime/helper-update/helper-update-notice";

/**
 * One thing the Property Inspector does about an available Helper update.
 *
 * Every value names an action the panel takes, never one it withholds. A value
 * like `hideInPropertyInspectorPanel` would encode today's default into the
 * vocabulary, and the day the default flips, every reader has to invert the
 * meaning of the name in their head. Adding a behavior to a level is then just
 * adding it to that level's list.
 */
export type HelperUpdateNoticeBehavior =
    | "showInPropertyInspectorPanel"
    | "emphasizeAsRequired";

/**
 * What the panel does at each urgency.
 *
 * Every update is announced, including a routine one. The panel is already a
 * place the user chose to open and the notice is one quiet line in it, so
 * withholding routine updates would buy no calm and would cost the only reliable
 * way a user learns their Helper is behind. A required update keeps that line
 * and adds the emphasis, rather than replacing it with a different mechanism.
 *
 * Today this table collapses: `showInPropertyInspectorPanel` is true at every
 * urgency, so the only thing that actually varies is the emphasis, and a reader
 * is right to notice that `urgency === "required"` would say the same. It is
 * kept as a table anyway, and the reason is what the table is for rather than
 * what it currently holds.
 *
 * An urgency is a statement about how fast the user should act. What the product
 * does about that is a separate decision that has already changed once and will
 * change again: a key badge, a blocked save, a Control Panel toast. Whenever that
 * decision lives in the rendering code, each new response arrives as one more
 * boolean read off the urgency at the point of use, and the set of things an
 * urgency means ends up spread across every component that asks. Keeping the
 * responses in one list per urgency means adding one is adding a value to a list,
 * and reading what an urgency means is reading one line.
 *
 * The cost of being wrong about this is bounded and symmetric: if a third
 * behavior never arrives, this file stays a two-row table nobody has to think
 * about. Delete it if that day comes and the second behavior is still the only
 * one.
 */
export const HELPER_UPDATE_NOTICE_BEHAVIORS_BY_URGENCY = {
    routine: ["showInPropertyInspectorPanel"],
    required: ["showInPropertyInspectorPanel", "emphasizeAsRequired"],
} as const satisfies Record<HelperUpdateUrgency, readonly HelperUpdateNoticeBehavior[]>;

/** Reports whether the panel takes one behavior at the given urgency. */
export function hasHelperUpdateNoticeBehavior(
    urgency: HelperUpdateUrgency,
    behavior: HelperUpdateNoticeBehavior,
): boolean {
    const behaviors: readonly HelperUpdateNoticeBehavior[] = HELPER_UPDATE_NOTICE_BEHAVIORS_BY_URGENCY[urgency];
    return behaviors.includes(behavior);
}
