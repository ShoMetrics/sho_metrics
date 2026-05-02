import type { IconNode, SVGProps } from "lucide";
import { escapeSvgText } from "../../../rendering/svg-utils";
import type { LucideIconOptions, SvgIconDefinition } from "../icon-types";

const LUCIDE_VIEW_BOX = { x: 0, y: 0, width: 24, height: 24 } as const;
const DEFAULT_LUCIDE_COLOR = "rgba(255,255,255,0.88)";
const DEFAULT_LUCIDE_STROKE_WIDTH = 2.2;

export function createLucideIconDefinition(options: LucideIconOptions): SvgIconDefinition {
    const color = options.color ?? DEFAULT_LUCIDE_COLOR;
    const strokeWidth = options.strokeWidth ?? DEFAULT_LUCIDE_STROKE_WIDTH;

    return {
        id: options.id,
        source: "lucide",
        viewBox: LUCIDE_VIEW_BOX,
        opticalScale: options.opticalScale ?? 1,
        opticalOffsetX: options.opticalOffsetX ?? 0,
        opticalOffsetY: options.opticalOffsetY ?? 0,
        fragment: `
            <g fill="none" stroke="${escapeSvgText(color)}" stroke-width="${strokeWidth}"
                stroke-linecap="round" stroke-linejoin="round">
                ${renderLucideIconNode(options.node)}
            </g>
        `,
    };
}

function renderLucideIconNode(iconNode: IconNode): string {
    return iconNode.map(([tagName, attributes]) => renderLucideElement(tagName, attributes)).join("");
}

function renderLucideElement(tagName: string, attributes: SVGProps): string {
    const attributeText = Object.entries(attributes)
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
        .map(([attributeName, attributeValue]) => `${attributeName}="${escapeSvgText(String(attributeValue))}"`)
        .join(" ");

    return `<${tagName} ${attributeText} />`;
}
