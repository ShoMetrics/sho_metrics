import { InspectorItem } from "../components/InspectorItem";
import { colorMessages } from "../../i18n/message-groups/color";
import { useI18n } from "../../i18n/react";
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
    const { t } = useI18n();

    return (
        <>
            <InspectorItem label={t(colorMessages.transparencyLabel)}>
                <div className="override-toggle-control">
                    <label className="native-checkbox-row">
                        <input
                            type="checkbox"
                            checked={value.enabled}
                            disabled={disabled}
                            onChange={(event) => onPatch({ enabled: event.currentTarget.checked })}
                        />
                        <span>{t(colorMessages.transparentBackgroundLabel)}</span>
                    </label>
                    <p className="section-note">
                        {t(colorMessages.transparencyNote)}
                    </p>
                </div>
            </InspectorItem>
            <RangeSetting
                label={t(colorMessages.backgroundOpacityLabel)}
                value={value.backgroundOpacityPercent}
                onValueChange={(backgroundOpacityPercent) => onPatch({ backgroundOpacityPercent })}
                disabled={disabled}
            />
            <RangeSetting
                label={t(colorMessages.textOutlineLabel)}
                value={value.textOutlinePercent}
                onValueChange={(textOutlinePercent) => onPatch({ textOutlinePercent })}
                disabled={disabled}
            />
            <RangeSetting
                label={t(colorMessages.shapeOutlineLabel)}
                value={value.shapeOutlinePercent}
                onValueChange={(shapeOutlinePercent) => onPatch({ shapeOutlinePercent })}
                disabled={disabled}
            />
        </>
    );
}
