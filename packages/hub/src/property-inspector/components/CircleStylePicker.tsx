import { PreviewOptionPicker } from "./PreviewOptionPicker";
import { buildCircleStylePreviewUri } from "../circle-style-preview";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";
import type { CircleStyle } from "../settings";

interface CircleStylePickerProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    onSettingChange: (key: PropertyInspectorSettingKey, value: string) => void;
    disabled?: boolean;
}

export function CircleStylePicker({ field, context, onSettingChange, disabled = false }: CircleStylePickerProps): React.JSX.Element {
    return (
        <PreviewOptionPicker
            field={field}
            context={context}
            onSettingChange={onSettingChange}
            buildPreviewUri={(value) => buildCircleStylePreviewUri(value as CircleStyle)}
            disabled={disabled}
        />
    );
}
