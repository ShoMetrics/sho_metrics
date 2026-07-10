/** Lists external URLs the Property Inspector is allowed to open in the default browser. */
export const propertyInspectorExternalUrls = {
    colorCompensationFaq: "https://shometrics.github.io/faq/color-compensation/",
    customHttpMetricFaq: "https://shometrics.github.io/faq/custom-http-metric/",
    helperDownload: "https://shometrics.github.io/download/",
    // If node.exe is not installed, it's normal that stream deck log says "war ESDDeepLinksHandler::HandleLink                    Unhandled command: https://shometrics.github.io/faq/plugin-engine-not-responding". The link can actually be opened as of Stream Deck 7.5 on Windows. It is shown as its own literal URL so that, if opening ever fails, the user can still read and copy it by hand.
    pluginEngineNotRespondingFaq: "https://shometrics.github.io/faq/plugin-engine-not-responding/",
} as const;

/** URL values approved for Stream Deck's openUrl command from the Property Inspector. */
export type PropertyInspectorExternalUrl =
    typeof propertyInspectorExternalUrls[keyof typeof propertyInspectorExternalUrls];
