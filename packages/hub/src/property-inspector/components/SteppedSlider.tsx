interface SteppedSliderProps {
    readonly value: number;
    readonly minimum: number;
    readonly maximum: number;
    readonly lowerLabel: string;
    readonly upperLabel: string;
    readonly ariaLabel: string;
    readonly onValueChange: (value: number) => void;
}

export function SteppedSlider({
    value,
    minimum,
    maximum,
    lowerLabel,
    upperLabel,
    ariaLabel,
    onValueChange,
}: SteppedSliderProps): React.JSX.Element {
    const tickValues = Array.from(
        { length: maximum - minimum + 1 },
        (_, index) => minimum + index,
    );

    return (
        <div className="stepped-slider">
            <div className="stepped-slider-labels" aria-hidden="true">
                <span>{lowerLabel}</span>
                <span>{upperLabel}</span>
            </div>
            <input
                type="range"
                min={minimum}
                max={maximum}
                step={1}
                value={value}
                aria-label={ariaLabel}
                onChange={(event) => onValueChange(Number(event.currentTarget.value))}
            />
            <div
                className="stepped-slider-ticks"
                style={{ gridTemplateColumns: `repeat(${tickValues.length}, 1fr)` }}
                aria-hidden="true"
            >
                {tickValues.map((tickValue) => (
                    <span
                        key={tickValue}
                        className="stepped-slider-tick"
                        data-current={tickValue === value ? "true" : "false"}
                    />
                ))}
            </div>
        </div>
    );
}
