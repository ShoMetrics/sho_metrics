import type { StoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";
import type { StoredCustomHttpCredentialInput } from "../../settings/storage/global-settings-patch";
import type { StoredGlobalSettingsPatch } from "../../settings/storage/global-settings-patch";
import type { VisibilityContext } from "../inspector/types";

export interface WidgetSettingsPanelProps {
    context: VisibilityContext;
    onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
    onGlobalSettingsPatch?: ((patch: StoredGlobalSettingsPatch) => void) | undefined;
    onCustomHttpCredentialUpsert?: ((credential: StoredCustomHttpCredentialInput) => void) | undefined;
    onCustomHttpCredentialDelete?: ((credentialId: string) => void) | undefined;
    /** Reports whether the current panel is showing a focused child page that should hide outer widget chrome. */
    onWidgetChromeSuppressionChange?: ((isSuppressed: boolean) => void) | undefined;
    viewDisabled?: boolean | undefined;
    themeDisabled?: boolean | undefined;
    transparentSurfaceDisabled?: boolean | undefined;
    colorDisabled?: boolean | undefined;
    showPolling?: boolean | undefined;
}
