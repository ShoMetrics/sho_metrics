import type {
    TransparentSurfaceSettings as StoredTransparentSurfaceSettings,
} from "../../generated/shometrics/v1/settings_pb.js";
import type { ResolvedTransparentSurfaceSettingsOverride } from "../appearance-overrides";

/**
 * Applies an app-owned sparse transparent-surface override to a stored protobuf message.
 *
 * @param transparentSurface Stored generated message to mutate at the storage boundary.
 * @param patch Sparse resolved-setting override whose omitted fields must leave stored fields unchanged.
 */
export function applyStoredTransparentSurfacePatch(
    transparentSurface: StoredTransparentSurfaceSettings,
    patch: ResolvedTransparentSurfaceSettingsOverride,
): void {
    if (patch.enabled !== undefined) {
        transparentSurface.enabled = patch.enabled;
    }
    if (patch.backgroundOpacityPercent !== undefined) {
        transparentSurface.backgroundOpacityPercent = patch.backgroundOpacityPercent;
    }
    if (patch.textOutlinePercent !== undefined) {
        transparentSurface.textOutlinePercent = patch.textOutlinePercent;
    }
    if (patch.shapeOutlinePercent !== undefined) {
        transparentSurface.shapeOutlinePercent = patch.shapeOutlinePercent;
    }
}
