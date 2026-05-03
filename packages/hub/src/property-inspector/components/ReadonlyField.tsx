import { useState } from "react";
import { resolveSelectedDiskVolumeLabel } from "../options";
import type { FieldSchema, VisibilityContext } from "../schema";

interface ReadonlyFieldProps {
    field: FieldSchema;
    context: VisibilityContext;
}

export function ReadonlyField({ field, context }: ReadonlyFieldProps): React.JSX.Element {
    const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
    const value = field.valueSource === "selectedDiskVolumeLabel"
        ? resolveSelectedDiskVolumeLabel(context)
        : "";
    const canCopy = value.length > 0 && value !== "-";

    const copyValue = (): void => {
        if (!canCopy) {
            return;
        }

        navigator.clipboard.writeText(value)
            .then(() => {
                setCopyState("copied");
                setTimeout(() => {
                    setCopyState("idle");
                }, 1400);
            })
            .catch(() => undefined);
    };

    return (
        <div className="readonly-inline">
            <span className="readonly-text">{value}</span>
            <button
                className="copy-button"
                type="button"
                disabled={!canCopy}
                onClick={copyValue}
                aria-label={copyState === "copied" ? "Copied" : "Copy volume label"}
            >
                {copyState === "copied" ? (
                    <>
                        Copied <span className="copy-success-mark">✓</span>
                    </>
                ) : (
                    "Copy"
                )}
            </button>
        </div>
    );
}
