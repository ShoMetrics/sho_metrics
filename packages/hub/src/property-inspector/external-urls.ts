/** Lists external URLs the Property Inspector is allowed to open in the default browser. */
export const propertyInspectorExternalUrls = {
    colorCompensationFaq: "https://shometrics.github.io/faq/color-compensation/",
    customHttpMetricFaq: "https://shometrics.github.io/faq/custom-http-metric/",
    helperDownload: "https://shometrics.github.io/download/",
} as const;

/** URL values approved for Stream Deck's openUrl command from the Property Inspector. */
export type PropertyInspectorExternalUrl =
    typeof propertyInspectorExternalUrls[keyof typeof propertyInspectorExternalUrls];
