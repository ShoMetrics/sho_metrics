import type { DualTextMetricContent } from "../../widgets/primitives/text-metric";
import type {
    TitleCardDualMetricContent,
    TitleCardSingleMetricContent,
} from "../../widgets/primitives/title-card-text-metric";
import type { WidgetData } from "../widget-data";
import { formatCompactDataRateUnitText, formatRenderUnitText } from "./render-unit-text";

export const TITLE_CARD_BATTERY_CAPTION_TEXT = "電池量";

/** Builds title-card text content for a single metric value. */
export function buildTitleCardSingleMetricContent(data: WidgetData): TitleCardSingleMetricContent {
    const codeText = resolveTitleCardCodeText(data.label);

    return {
        codeText,
        compactCodeText: resolveTitleCardCompactCodeText(codeText),
        // TODO: Carry metric target context into title-card content so custom labels
        // cannot mask target-specific captions such as battery.
        threeCharacterCaptionText: data.titleCardCaptionText ?? resolveTitleCardSingleCaptionText(codeText, data.unit),
        unitText: formatTitleCardUnitText(data.unit),
    };
}

/** Builds title-card text content for paired positive/negative metric values. */
export function buildTitleCardDualMetricContent(content: DualTextMetricContent): TitleCardDualMetricContent {
    const codeText = resolveTitleCardCodeText(content.titleText);

    return {
        codeText,
        compactCodeText: resolveTitleCardCompactCodeText(codeText),
        threeCharacterCaptionText: resolveTitleCardDualCaptionText(codeText),
        positiveLabelText: formatTitleCardChannelLabel(content.positive.labelText),
        positiveUnitText: formatTitleCardUnitText(content.positive.unitText),
        negativeLabelText: formatTitleCardChannelLabel(content.negative.labelText),
        negativeUnitText: formatTitleCardUnitText(content.negative.unitText),
    };
}

function resolveTitleCardSingleCaptionText(codeText: string, unitText: string): string {
    const normalizedUnitText = unitText.toUpperCase();

    // TODO: Carry metric target context into title-card content so captions do not depend on display labels.
    if (isTitleCardPercentageUnit(normalizedUnitText) && isTitleCardUsageCode(codeText)) {
        return "使用率";
    }

    if (isTitleCardTemperatureUnit(normalizedUnitText)) {
        return "温度計";
    }

    if (isTitleCardPowerUnit(normalizedUnitText)) {
        return "消費電";
    }

    if (isTitleCardMemoryCode(codeText)) {
        return "記憶量";
    }

    if (isTitleCardReadCode(codeText)) {
        return "読込速";
    }

    if (isTitleCardWriteCode(codeText)) {
        return "書込速";
    }

    if (isTitleCardRateUnit(normalizedUnitText)) {
        return "転送速";
    }

    if (isTitleCardDiskStorageCode(codeText) || isTitleCardByteUnit(normalizedUnitText)) {
        return "蓄積量";
    }

    return "計測値";
}

function resolveTitleCardDualCaptionText(codeText: string): string {
    if (codeText === "NET") {
        return "転送速";
    }

    if (isTitleCardDiskStorageCode(codeText)) {
        return "転送速";
    }

    if (isTitleCardReadCode(codeText)) {
        return "読込速";
    }

    if (isTitleCardWriteCode(codeText)) {
        return "書込速";
    }

    return "計測値";
}

function resolveTitleCardCodeText(labelText: string): string {
    const normalizedLabelText = labelText.trim().toUpperCase().replace(/\s+/gu, "");

    if (normalizedLabelText.length === 0) {
        return "SYS";
    }

    return Array.from(normalizedLabelText).slice(0, 4).join("");
}

function resolveTitleCardCompactCodeText(codeText: string): string {
    if (codeText === "DISK") {
        return "DSK";
    }

    if (codeText === "VRAM") {
        return "VRM";
    }

    return Array.from(codeText).slice(0, 3).join("");
}

function formatTitleCardUnitText(unitText: string): string {
    const normalizedUnitText = unitText.toUpperCase();

    if (normalizedUnitText.endsWith("B/S")) {
        return formatCompactDataRateUnitText(normalizedUnitText);
    }

    if (normalizedUnitText === "C" || normalizedUnitText === "F") {
        return formatRenderUnitText(normalizedUnitText);
    }

    return unitText;
}

function formatTitleCardChannelLabel(labelText: string): string {
    const normalizedLabelText = labelText.trim().toUpperCase();

    if (normalizedLabelText === "UP" || normalizedLabelText === "RD") {
        return "↑";
    }

    if (normalizedLabelText === "DN" || normalizedLabelText === "DOWN" || normalizedLabelText === "WR") {
        return "↓";
    }

    return Array.from(normalizedLabelText).slice(0, 2).join("");
}

function isTitleCardUsageCode(codeText: string): boolean {
    return codeText === "CPU" || codeText === "GPU";
}

function isTitleCardMemoryCode(codeText: string): boolean {
    return codeText === "RAM" || codeText === "MEM" || codeText === "VRAM";
}

function isTitleCardDiskStorageCode(codeText: string): boolean {
    return codeText === "DISK" || /^[A-Z]:$/u.test(codeText);
}

function isTitleCardReadCode(codeText: string): boolean {
    return codeText === "READ" || codeText === "RD";
}

function isTitleCardWriteCode(codeText: string): boolean {
    return codeText === "WRIT" || codeText === "WR";
}

function isTitleCardPercentageUnit(unitText: string): boolean {
    return unitText === "%";
}

function isTitleCardTemperatureUnit(unitText: string): boolean {
    return unitText === "C" || unitText === "F" || unitText.includes("°");
}

function isTitleCardPowerUnit(unitText: string): boolean {
    return unitText === "W";
}

function isTitleCardRateUnit(unitText: string): boolean {
    return unitText.includes("/S");
}

function isTitleCardByteUnit(unitText: string): boolean {
    return unitText.includes("B") && !isTitleCardRateUnit(unitText);
}
