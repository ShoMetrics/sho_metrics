import {
    hasColorCompensationProfileEffect,
    normalizeColorCompensationProfile,
    type ColorCompensationProfile,
} from "../../color-compensation/types";
import { resolveColorCompensationFilterValues } from "../../color-compensation/transform";

export function wrapSvgWithColorCompensationFilter(
    svg: string,
    profile: ColorCompensationProfile,
): string {
    if (!hasColorCompensationProfileEffect(profile)) {
        return svg;
    }

    const filterId = "runtime-color-compensation";
    const defsCloseIndex = svg.indexOf("</defs>");
    const svgCloseIndex = svg.lastIndexOf("</svg>");

    if (defsCloseIndex === -1 || svgCloseIndex === -1 || defsCloseIndex > svgCloseIndex) {
        return svg;
    }

    const defsCloseEndIndex = defsCloseIndex + "</defs>".length;

    // TODO(color-compensation): Replace this runtime string injection with a
    // renderer-owned SVG output wrapper once hardware-only image compensation
    // exits the temporary setup path.
    return [
        svg.slice(0, defsCloseIndex),
        renderColorCompensationFilterDef(profile, filterId),
        svg.slice(defsCloseIndex, defsCloseEndIndex),
        `<g filter="url(#${filterId})">`,
        svg.slice(defsCloseEndIndex, svgCloseIndex),
        "</g>",
        svg.slice(svgCloseIndex),
    ].join("");
}

export function renderColorCompensationFilterDef(
    profile: ColorCompensationProfile,
    filterId: string,
): string {
    const normalizedProfile = normalizeColorCompensationProfile(profile);
    const filterValues = resolveColorCompensationFilterValues(normalizedProfile);

    return `
        <filter id="${filterId}" color-interpolation-filters="sRGB">
            <feComponentTransfer>
                <feFuncR type="gamma"
                    amplitude="${formatFilterNumber(filterValues.brightnessAmplitude)}"
                    exponent="${formatFilterNumber(filterValues.gammaExponent)}"
                    offset="${formatFilterNumber(filterValues.shadowOffset)}" />
                <feFuncG type="gamma"
                    amplitude="${formatFilterNumber(filterValues.brightnessAmplitude)}"
                    exponent="${formatFilterNumber(filterValues.gammaExponent)}"
                    offset="${formatFilterNumber(filterValues.shadowOffset)}" />
                <feFuncB type="gamma"
                    amplitude="${formatFilterNumber(filterValues.brightnessAmplitude)}"
                    exponent="${formatFilterNumber(filterValues.gammaExponent)}"
                    offset="${formatFilterNumber(filterValues.shadowOffset)}" />
            </feComponentTransfer>
            <feColorMatrix type="saturate" values="${formatFilterNumber(filterValues.saturationMultiplier)}" />
        </filter>
    `;
}

function formatFilterNumber(value: number): string {
    return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
