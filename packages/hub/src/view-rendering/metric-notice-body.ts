import type { MetricRenderAppearance } from "./render-appearance";
import { buildSvgFilterAttributes } from "./render-svg-effects";
import { renderStyledSvgText } from "./svg-utils";
import type { KeySize } from "./widget-data";

const NOTICE_BODY_LAYOUT = {
    horizontalPadding: 14,
    singleLineYRatio: 0.52,
    firstLineYRatio: 0.44,
    secondLineYRatio: 0.64,
    fontSize: 28,
    fitOptions: { minimumFontScale: 0.72, widthGuardRatio: 1.06 },
} as const;

/**
 * Renders static action-owned onboarding copy instead of a selected metric view.
 *
 * This body is for controlled short strings such as `Install helper` and
 * `Choose metric`; ordinary no-data states should stay in the selected
 * primitive and render `N/A`.
 */
export function renderMetricNoticeBody(options: {
    readonly text: string;
    readonly visual: MetricRenderAppearance;
    readonly renderSize: KeySize;
}): string {
    const lines = splitNoticeText(options.text);
    const textStyle = options.visual.textStyles.title;
    const textWidth = Math.max(
        24,
        options.renderSize.width - NOTICE_BODY_LAYOUT.horizontalPadding * 2,
    );
    const yCoordinates = lines.length === 1
        ? [options.renderSize.height * NOTICE_BODY_LAYOUT.singleLineYRatio]
        : [
            options.renderSize.height * NOTICE_BODY_LAYOUT.firstLineYRatio,
            options.renderSize.height * NOTICE_BODY_LAYOUT.secondLineYRatio,
        ];

    return lines.map((line, index) => {
        const yCoordinate = yCoordinates[index]
            ?? options.renderSize.height * NOTICE_BODY_LAYOUT.singleLineYRatio;

        return renderStyledSvgText({
            id: `metric-notice-line-${index}`,
            text: line,
            xCoordinate: options.renderSize.width / 2,
            yCoordinate,
            maxWidth: textWidth,
            baseFontSize: NOTICE_BODY_LAYOUT.fontSize,
            fill: options.visual.paints.primaryText,
            textStyle,
            textAnchor: "middle",
            extraAttributes: buildSvgFilterAttributes(textStyle.filter),
            fitOptions: NOTICE_BODY_LAYOUT.fitOptions,
        });
    }).join("");
}

function splitNoticeText(text: string): readonly string[] {
    // Notice copy is product-controlled and intentionally short. Split once to
    // avoid a general text-layout policy inside this special onboarding body.
    const trimmedText = text.trim();
    const splitIndex = trimmedText.indexOf(" ");

    if (splitIndex < 0) {
        return [trimmedText];
    }

    return [
        trimmedText.slice(0, splitIndex),
        trimmedText.slice(splitIndex + 1),
    ];
}
