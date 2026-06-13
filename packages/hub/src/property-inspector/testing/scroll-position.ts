/**
 * Sets every browser scroll owner that can be active in the Stream Deck PI shell.
 */
export function setPropertyInspectorScrollTopForTest(scrollTop: number): void {
    if (document.scrollingElement != null) {
        document.scrollingElement.scrollTop = scrollTop;
    }
    document.documentElement.scrollTop = scrollTop;
    document.body.scrollTop = scrollTop;
}

/**
 * Reads the effective Stream Deck PI scroll offset across browser implementations.
 */
export function readPropertyInspectorScrollTopForTest(): number {
    return Math.max(
        document.scrollingElement?.scrollTop ?? 0,
        document.documentElement.scrollTop,
        document.body.scrollTop,
    );
}
