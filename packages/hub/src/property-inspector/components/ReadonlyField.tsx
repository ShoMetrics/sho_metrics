import { resolveSelectedDiskVolumeLabel } from "../options";
import type { FieldSchema, VisibilityContext } from "../schema";

interface ReadonlyFieldProps {
    field: FieldSchema;
    context: VisibilityContext;
}

export function ReadonlyField({ field, context }: ReadonlyFieldProps): React.JSX.Element {
    const value = field.valueSource === "selectedDiskVolumeLabel"
        ? resolveSelectedDiskVolumeLabel(context)
        : "";

    return (
        <div className="readonly-inline">
            <span className="readonly-text">{value}</span>
        </div>
    );
}
