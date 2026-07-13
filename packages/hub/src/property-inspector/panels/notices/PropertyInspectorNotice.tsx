import { InspectorItem } from "../../components/InspectorItem";

/**
 * How loudly one Property Inspector notice presents itself.
 *
 * This is emphasis, not the situation that produced it. Naming a tone after its
 * first caller is how the panel would end up with two tones that render the same
 * grey text because the second caller could not honestly claim to be loading.
 *
 * `warning` and `critical` are a budget, not a scale. `critical` is reserved for
 * something the user has to act on, currently a required Helper update, and
 * `warning` for something wrong they should look at. A notice that is merely
 * worth reading takes `plain`: colouring it spends the budget and leaves nothing
 * for the notice that has to interrupt them.
 */
export type PropertyInspectorNoticeTone = "plain" | "warning" | "critical";

/**
 * Renders one notice in the Property Inspector's notice area.
 *
 * Notices all sit above the tabs and share this frame so a second one added
 * later cannot quietly invent its own spacing and colors. The tone chooses the
 * existing settings-notice styling; the content stays with whichever slot owns
 * it, because their bodies genuinely differ.
 */
export function PropertyInspectorNotice({
    children,
    tone,
    className,
}: {
    readonly children: React.ReactNode;
    readonly tone: PropertyInspectorNoticeTone;
    readonly className?: string;
}): React.JSX.Element {
    // `plain` emits no modifier: the default .section-note colour is what it
    // wants, so a .settings-notice-plain class would match no rule and be one
    // more dead hook for someone to hang styling on by accident.
    const noticeClassNames = [
        "settings-notice",
        tone === "plain" ? undefined : `settings-notice-${tone}`,
        className,
    ]
        .filter(noticeClassName => noticeClassName !== undefined)
        .join(" ");

    return <InspectorItem className={noticeClassNames}>{children}</InspectorItem>;
}
