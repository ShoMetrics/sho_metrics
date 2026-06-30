/** Lists external URLs the Property Inspector is allowed to open in the default browser. */
export const propertyInspectorExternalUrls = {
    helperDownload: "https://shometrics.github.io/download/",
} as const;

/** URL values approved for Stream Deck's openUrl command from the Property Inspector. */
export type PropertyInspectorExternalUrl =
    typeof propertyInspectorExternalUrls[keyof typeof propertyInspectorExternalUrls];
