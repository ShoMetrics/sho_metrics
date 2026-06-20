import { shellMessages, commonMessages } from "./message-groups/shell";
import { optionMessages } from "./message-groups/options";
import { widgetMessages, cpuMessages, gpuMessages, diskMessages, networkMessages, systemMessages, helperMessages, catalogMessages } from "./message-groups/widgets";
import { colorMessages } from "./message-groups/color";
import { settingsNoticeMessages, globalSettingsMessages } from "./message-groups/settings";
import { colorCompensationMessages } from "./message-groups/color-compensation";

export * from "./message-groups/shell";
export * from "./message-groups/options";
export * from "./message-groups/widgets";
export * from "./message-groups/color";
export * from "./message-groups/settings";
export * from "./message-groups/color-compensation";

export const messageGroups = {
    shellMessages,
    commonMessages,
    optionMessages,
    widgetMessages,
    cpuMessages,
    gpuMessages,
    diskMessages,
    networkMessages,
    systemMessages,
    colorMessages,
    helperMessages,
    catalogMessages,
    settingsNoticeMessages,
    globalSettingsMessages,
    colorCompensationMessages,
} as const;
