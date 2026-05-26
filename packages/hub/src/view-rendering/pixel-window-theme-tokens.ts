export const DEFAULT_PIXEL_WINDOW_PALETTE = {
    outerBorder: "#5931e6",
    innerBorder: "#0ea5ff",
    titleBar: "#d7b5f4",
    titleText: "#4f2bd6",
    clientBackground: "#fff8ff",
    // TODO(pixel-window): Split this from body surface paint if the real frame
    // controls need a different color after the 9.5 visual pass.
    controlButton: "#f6edff",
    bodyAccent: "#5b31d8",
    bodyText: "#5b31d8",
    bodySubtleText: "#2f6f99",
    bodyMutedText: "#9a8ab5",
    bodyTrack: "#d8b6eb",
    bodyGrid: "#82d7f4",
    bodyDivider: "#5931e6",
} as const;
