import { resolveDiskAutoLinearLabel, resolveSelectedDiskVolumeLabel } from "../options";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface TextFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    onSettingChange: (key: PropertyInspectorSettingKey, value: string) => void;
}

export function TextField({ field, context, onSettingChange }: TextFieldProps): React.JSX.Element {
    const placeholder = field.placeholderSource === "diskAutoLinearLabel"
        ? resolveDiskAutoLinearLabel(context)
        : field.placeholder;
    const input = (
        <input
            id={field.id}
            className="native-input"
            type="text"
            data-setting-key={field.key}
            placeholder={placeholder ?? ""}
            value={String(context.settings[field.key] ?? "")}
            onChange={() => undefined}
        />
    );

    if (field.key !== "diskLinearLabel") {
        return input;
    }

    const detectedLabel = resolveSelectedDiskVolumeLabel(context);
    const canUseDetectedLabel = detectedLabel.length > 0
        && detectedLabel !== "-"
        && context.settings.diskLinearLabel.trim() !== detectedLabel;

    const useDetectedLabel = (): void => {
        if (!canUseDetectedLabel) {
            return;
        }

        onSettingChange(field.key, detectedLabel);
    };

    return (
        <div className="text-field-with-action">
            {input}
            <button
                className="inline-action-button"
                type="button"
                disabled={!canUseDetectedLabel}
                onClick={useDetectedLabel}
                aria-label="Use detected label as custom label"
            >
                Use Detected
            </button>
        </div>
    );
}
