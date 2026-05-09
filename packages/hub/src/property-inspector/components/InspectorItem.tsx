import type { ReactNode } from "react";

interface InspectorItemProps {
    label?: string;
    labelFor?: string;
    className?: string;
    children?: ReactNode;
}

export function InspectorItem({ label, labelFor, className, children }: InspectorItemProps): React.JSX.Element {
    const hasLabel = label !== undefined && label !== "";
    const itemClassName = className ? `inspector-item ${className}` : "inspector-item";

    return (
        <div className={itemClassName} data-has-label={hasLabel ? "true" : "false"}>
            <div className="inspector-item-label-cell">
                {hasLabel && labelFor ? (
                    <label htmlFor={labelFor}>{label}:</label>
                ) : (
                    <span>{hasLabel ? `${label}:` : null}</span>
                )}
            </div>
            <div className="inspector-item-content">{children}</div>
        </div>
    );
}
