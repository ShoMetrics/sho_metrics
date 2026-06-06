export type HubLocale = "en" | "zh_CN" | "ja";

export type LocalizedMessage = Record<HubLocale, string>;

export type LocalizedMessages = Record<string, LocalizedMessage>;

export type PlaceholderValue = string | number | boolean;

export type PlaceholderValues = Record<string, PlaceholderValue>;
