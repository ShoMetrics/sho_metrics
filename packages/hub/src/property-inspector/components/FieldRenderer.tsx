import { ColorBandField } from "./ColorBandField";
import { ColorField } from "./ColorField";
import { CircleStylePicker } from "./CircleStylePicker";
import { GraphicTypePicker } from "./GraphicTypePicker";
import { NumberField } from "./NumberField";
import { RangeField } from "./RangeField";
import { ReadonlyField } from "./ReadonlyField";
import { SectionHeading } from "./SectionHeading";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface FieldRendererProps {
    field: FieldSchema;
    context: VisibilityContext;
    onSettingChange: (key: PropertyInspectorSettingKey, value: string) => void;
    disabled?: boolean;
}

export function FieldRenderer({
    field,
    context,
    onSettingChange,
    disabled = false,
}: FieldRendererProps): React.JSX.Element {
    if (field.kind === "heading") {
        return <SectionHeading text={field.text ?? ""} />;
    }

    if (field.kind === "note") {
        const noteVariant = field.noteVariant ?? "default";

        return (
            <sdpi-item className={`note-item note-item-${noteVariant}`}>
                <p className="section-note">{field.text ?? ""}</p>
            </sdpi-item>
        );
    }

    if (field.kind === "readonly") {
        return (
            <sdpi-item label={field.label ?? ""}>
                <ReadonlyField field={field} context={context} />
            </sdpi-item>
        );
    }

    if (!field.key) {
        return <sdpi-item />;
    }

    const keyedField = field as FieldSchema & { key: PropertyInspectorSettingKey };

    return (
        <sdpi-item label={field.label ?? ""}>
            {renderFieldControl(keyedField, context, onSettingChange, disabled)}
        </sdpi-item>
    );
}

function renderFieldControl(
    field: FieldSchema & { key: PropertyInspectorSettingKey },
    context: VisibilityContext,
    onSettingChange: (key: PropertyInspectorSettingKey, value: string) => void,
    disabled: boolean,
): React.JSX.Element {
    switch (field.kind) {
        case "select":
            return <SelectField field={field} context={context} disabled={disabled} />;
        case "graphic-type-picker":
            return <GraphicTypePicker field={field} context={context} onSettingChange={onSettingChange} disabled={disabled} />;
        case "circle-style-picker":
            return <CircleStylePicker field={field} context={context} onSettingChange={onSettingChange} disabled={disabled} />;
        case "color":
            return <ColorField field={field} context={context} disabled={disabled} />;
        case "number":
            return <NumberField field={field} context={context} disabled={disabled} />;
        case "text":
            return <TextField field={field} context={context} onSettingChange={onSettingChange} disabled={disabled} />;
        case "range":
            return <RangeField field={field} context={context} disabled={disabled} />;
        case "color-band":
            return <ColorBandField field={field} context={context} disabled={disabled} />;
        case "heading":
        case "note":
        case "readonly":
            return <span />;
    }
}
