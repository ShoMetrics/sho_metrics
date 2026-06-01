import { InspectorItem } from "../components/InspectorItem";
import { RangeSetting } from "./RangeSetting";
import type { ResolvedTransparentSurfaceSettings } from "../../settings/resolved-settings";
import type { ResolvedTransparentSurfaceSettingsOverride } from "../../settings/appearance-overrides";

interface TransparentSurfaceSettingProps {
    readonly value: ResolvedTransparentSurfaceSettings;
    readonly onPatch: (patch: ResolvedTransparentSurfaceSettingsOverride) => void;
    readonly disabled?: boolean;
}

export function TransparentSurfaceSetting({
    value,
    onPatch,
    disabled = false,
}: TransparentSurfaceSettingProps): React.JSX.Element {
    return (
        <>
            <InspectorItem label="Transparency">
                <div className="override-toggle-control">
                    <label className="native-checkbox-row">
                        <input
                            type="checkbox"
                            checked={value.enabled}
                            disabled={disabled}
                            onChange={(event) => onPatch({ enabled: event.currentTarget.checked })}
                        />
                        <span>Transparent background</span>
                    </label>
                    <p className="section-note">
                        Affects theme background and chrome only. Metrics stay opaque.
                    </p>
                </div>
            </InspectorItem>
            <RangeSetting
                label="Background Opacity"
                value={value.backgroundOpacityPercent}
                onValueChange={(backgroundOpacityPercent) => onPatch({ backgroundOpacityPercent })}
                disabled={disabled}
            />
            <RangeSetting
                label="Text Outline"
                value={value.textOutlinePercent}
                onValueChange={(textOutlinePercent) => onPatch({ textOutlinePercent })}
                disabled={disabled}
            />
            <RangeSetting
                label="Shape Outline"
                value={value.shapeOutlinePercent}
                onValueChange={(shapeOutlinePercent) => onPatch({ shapeOutlinePercent })}
                disabled={disabled}
            />
        </>
    );
}
