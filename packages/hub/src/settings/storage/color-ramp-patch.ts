import type { ColorRamp as StoredColorRamp } from "../../generated/shometrics/v1/settings_pb.js";
import type { ResolvedColorRamp } from "../resolved-settings";

export type ColorRampPatch = Partial<ResolvedColorRamp>;

export function applyColorRampPatch(
    colorRamp: StoredColorRamp,
    patch: ColorRampPatch,
): void {
    if (patch.solidColor !== undefined) {
        colorRamp.solidColor = patch.solidColor;
    }
    if (patch.lowColor !== undefined) {
        colorRamp.lowColor = patch.lowColor;
    }
    if (patch.mediumColor !== undefined) {
        colorRamp.mediumColor = patch.mediumColor;
    }
    if (patch.highColor !== undefined) {
        colorRamp.highColor = patch.highColor;
    }
}
