import { ColorBandField } from "./ColorBandField";
import { ColorField } from "./ColorField";
import { CircleStylePicker } from "./CircleStylePicker";
import { GraphicTypePicker } from "./GraphicTypePicker";
import { InspectorItem } from "./InspectorItem";
import { NumberField } from "./NumberField";
import { RangeField } from "./RangeField";
import { ReadonlyField } from "./ReadonlyField";
import { SectionHeading } from "./SectionHeading";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";
import type {
    AppearanceColorBinding,
    FieldSchema,
    InspectorSettingTarget,
    PropertyInspectorSettingKey,
    VisibilityContext,
} from "../schema";

type KeyedFieldSchema = FieldSchema & { key: PropertyInspectorSettingKey };
type ColorBoundFieldSchema = FieldSchema & { colorBinding: AppearanceColorBinding };

interface FieldRendererProps {
    field: FieldSchema;
    context: VisibilityContext;
    onSettingChange: (target: InspectorSettingTarget, value: string) => void;
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
            <InspectorItem className={`note-item note-item-${noteVariant}`}>
                <p className="section-note">{field.text ?? ""}</p>
            </InspectorItem>
        );
    }

    if (field.kind === "readonly") {
        return (
            <InspectorItem label={field.label ?? ""}>
                <ReadonlyField field={field} context={context} />
            </InspectorItem>
        );
    }

    if (field.kind === "color" && hasColorBinding(field)) {
        return (
            <InspectorItem label={field.label ?? ""}>
                <ColorField
                    field={field}
                    context={context}
                    onSettingChange={onSettingChange}
                    disabled={disabled}
                />
            </InspectorItem>
        );
    }

    if (field.kind === "color-band" && hasColorBinding(field)) {
        return (
            <InspectorItem label={field.label ?? ""}>
                <ColorBandField
                    field={field}
                    context={context}
                    onSettingChange={onSettingChange}
                    disabled={disabled}
                />
            </InspectorItem>
        );
    }

    if (!hasSettingKey(field)) {
        return <InspectorItem />;
    }

    return (
        <InspectorItem label={field.label ?? ""}>
            {renderFieldControl(field, context, onSettingChange, disabled)}
        </InspectorItem>
    );
}

function renderFieldControl(
    field: KeyedFieldSchema,
    context: VisibilityContext,
    onSettingChange: (target: InspectorSettingTarget, value: string) => void,
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
            return <span />;
        case "number":
            return <NumberField field={field} context={context} disabled={disabled} />;
        case "text":
            return <TextField field={field} context={context} onSettingChange={onSettingChange} disabled={disabled} />;
        case "range":
            return <RangeField field={field} context={context} disabled={disabled} />;
        case "color-band":
            return <span />;
        case "heading":
        case "note":
        case "readonly":
            return <span />;
    }
}

function hasColorBinding(field: FieldSchema): field is ColorBoundFieldSchema {
    return field.colorBinding !== undefined;
}

function hasSettingKey(field: FieldSchema): field is KeyedFieldSchema {
    return field.key !== undefined;
}
