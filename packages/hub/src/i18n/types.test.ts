import type { LocalizedMessage } from "./types";

const completeMessage = {
    en: "Widget",
    zh_CN: "组件",
    ja: "ウィジェット",
} satisfies LocalizedMessage;

void completeMessage;

const incompleteMessage = {
    en: "Widget",
    zh_CN: "组件",
};

// @ts-expect-error LocalizedMessage requires every supported locale.
const missingJapaneseMessage: LocalizedMessage = incompleteMessage;

void missingJapaneseMessage;
