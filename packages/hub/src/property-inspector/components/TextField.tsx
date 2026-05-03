import { resolveDiskAutoLinearLabel } from "../options";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface TextFieldProps {
    field: FieldSchema & { key: PropertyInspectorSettingKey };
    context: VisibilityContext;
}

export function TextField({ field, context }: TextFieldProps): React.JSX.Element {
    const placeholder = field.placeholderSource === "diskAutoLinearLabel"
        ? resolveDiskAutoLinearLabel(context)
        : field.placeholder;

    return (
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
}
