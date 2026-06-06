import {
    hasColorCompensationProfileEffect,
    type ColorCompensationProfile,
} from "../../color-compensation/types";
import { colorCompensationMessages } from "../../i18n/message-groups/color-compensation";
import { commonMessages } from "../../i18n/message-groups/shell";
import { useI18n } from "../../i18n/react";
import { InspectorItem } from "../components/InspectorItem";

interface ColorCompensationControlsProps {
    readonly profile: ColorCompensationProfile;
    readonly onOpenColorCompensation: () => void;
}

export function ColorCompensationControls({
    profile,
    onOpenColorCompensation,
}: ColorCompensationControlsProps): React.JSX.Element {
    const { t } = useI18n();
    const hasProfile = hasColorCompensationProfileEffect(profile);
    const buttonLabel = t(colorCompensationMessages.colorCompensationTitle);

    return (
        <InspectorItem label={t(commonMessages.colorLabel)}>
            <div className="advanced-action-stack">
                <button
                    className="inline-action-button"
                    type="button"
                    onClick={onOpenColorCompensation}
                >
                    {hasProfile ? `${buttonLabel} ✓` : buttonLabel}
                </button>
            </div>
        </InspectorItem>
    );
}
