import { ColorBandField } from "./ColorBandField";
import { ColorField } from "./ColorField";
import { NumberField } from "./NumberField";
import { RangeField } from "./RangeField";
import { ReadonlyField } from "./ReadonlyField";
import { SelectField } from "./SelectField";
import { TextField } from "./TextField";
import type { FieldSchema, PropertyInspectorSettingKey, VisibilityContext } from "../schema";

interface FieldRendererProps {
    field: FieldSchema;
    context: VisibilityContext;
}

export function FieldRenderer({ field, context }: FieldRendererProps): React.JSX.Element {
    if (field.kind === "heading") {
        return <sdpi-heading>{field.text ?? ""}</sdpi-heading>;
    }

    if (field.kind === "note") {
        return (
            <sdpi-item>
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

    return (
        <sdpi-item label={field.label ?? ""}>
            {renderFieldControl(field as FieldSchema & { key: PropertyInspectorSettingKey }, context)}
        </sdpi-item>
    );
}

function renderFieldControl(
    field: FieldSchema & { key: PropertyInspectorSettingKey },
    context: VisibilityContext,
): React.JSX.Element {
    switch (field.kind) {
        case "select":
            return <SelectField field={field} context={context} />;
        case "color":
            return <ColorField field={field} context={context} />;
        case "number":
            return <NumberField field={field} context={context} />;
        case "text":
            return <TextField field={field} context={context} />;
        case "range":
            return <RangeField field={field} context={context} />;
        case "color-band":
            return <ColorBandField field={field} context={context} />;
        case "heading":
        case "note":
        case "readonly":
            return <span />;
    }
}
