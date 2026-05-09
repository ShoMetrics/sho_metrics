import type { MouseEvent, ReactNode } from "react";

interface InspectorItemProps {
    label?: string;
    className?: string;
    children?: ReactNode;
}

export function InspectorItem({ label, className, children }: InspectorItemProps): React.JSX.Element {
    const hasLabel = label !== undefined && label !== "";
    const handleLabelClick = (event: MouseEvent<HTMLLabelElement>): void => {
        const item = event.currentTarget.closest(".inspector-item");
        const focusTarget = item?.querySelector<HTMLElement>(
            "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])",
        );

        focusTarget?.focus();
    };
    const itemClassName = className ? `inspector-item ${className}` : "inspector-item";

    return (
        <div className={itemClassName} data-has-label={hasLabel ? "true" : "false"}>
            <div className="inspector-item-label-cell">
                <label onClick={handleLabelClick}>{hasLabel ? `${label}:` : null}</label>
            </div>
            <div className="inspector-item-content">{children}</div>
        </div>
    );
}
