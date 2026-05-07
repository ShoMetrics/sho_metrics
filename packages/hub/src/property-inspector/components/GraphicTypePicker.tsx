import { PreviewOptionPicker } from "./PreviewOptionPicker";
import { buildGraphicTypePreviewUri } from "../graphic-type-preview";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";
import type { GraphicType } from "../settings";

interface GraphicTypePickerProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
    onSettingChange: (key: PropertyInspectorSettingKey, value: string) => void;
    disabled?: boolean;
}

export function GraphicTypePicker({ field, context, onSettingChange, disabled = false }: GraphicTypePickerProps): React.JSX.Element {
    return (
        <PreviewOptionPicker
            field={field}
            context={context}
            onSettingChange={onSettingChange}
            buildPreviewUri={(value) => buildGraphicTypePreviewUri(value as GraphicType)}
            disabled={disabled}
        />
    );
}
