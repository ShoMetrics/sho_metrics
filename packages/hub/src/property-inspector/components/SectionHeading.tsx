interface SectionHeadingProps {
    text: string;
    variant?: "section" | "subsection";
}

export function SectionHeading({ text, variant = "subsection" }: SectionHeadingProps): React.JSX.Element {
    return (
        <div className={variant === "section" ? "section-title" : "section-heading"} role="heading" aria-level={2}>
            {text}
        </div>
    );
}
