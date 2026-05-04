interface SectionHeadingProps {
    text: string;
}

export function SectionHeading({ text }: SectionHeadingProps): React.JSX.Element {
    return (
        <div className="section-heading" role="heading" aria-level={2}>
            {text}
        </div>
    );
}
