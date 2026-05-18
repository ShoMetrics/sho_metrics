import {
    hasColorCompensationProfileEffect,
    type ColorCompensationProfile,
} from "../../color-compensation/types";
import { InspectorItem } from "../components/InspectorItem";

interface ColorCompensationControlsProps {
    readonly profile: ColorCompensationProfile;
    readonly onOpenColorCompensation: () => void;
}

export function ColorCompensationControls({
    profile,
    onOpenColorCompensation,
}: ColorCompensationControlsProps): React.JSX.Element {
    const hasProfile = hasColorCompensationProfileEffect(profile);

    return (
        <InspectorItem label="Color">
            <div className="advanced-action-stack">
                <button
                    className="inline-action-button"
                    type="button"
                    onClick={onOpenColorCompensation}
                >
                    {hasProfile ? "Color Compensation ✓" : "Color Compensation"}
                </button>
            </div>
        </InspectorItem>
    );
}
