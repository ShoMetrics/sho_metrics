import type { IconNode } from "lucide";

type SvgIconSource = "lucide" | "custom";

export interface SvgViewBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SvgIconDefinition {
    id: string;
    source: SvgIconSource;
    fragment: string;
    viewBox: SvgViewBox;
    opticalScale: number;
    opticalOffsetX: number;
    opticalOffsetY: number;
}

export interface LucideIconOptions {
    id: string;
    node: IconNode;
    color?: string;
    strokeWidth?: number;
    opticalScale?: number;
    opticalOffsetX?: number;
    opticalOffsetY?: number;
}

export interface CustomIconOptions {
    id: string;
    fragment: string;
    viewBox: SvgViewBox;
    opticalScale?: number;
    opticalOffsetX?: number;
    opticalOffsetY?: number;
}
