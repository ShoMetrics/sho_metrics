interface NativeColorInputProps {
    id?: string;
    value: string;
    disabled?: boolean;
    onValueChange: (value: string) => void;
}

export function NativeColorInput({
    id,
    value,
    disabled = false,
    onValueChange,
}: NativeColorInputProps): React.JSX.Element {
    const handleChange = (event: React.FormEvent<HTMLInputElement>): void => {
        onValueChange(event.currentTarget.value);
    };

    return (
        <label
            className="native-color-input"
            data-disabled={disabled ? "true" : "false"}
            style={{ backgroundColor: value }}
        >
            <input
                id={id}
                type="color"
                value={value}
                disabled={disabled}
                onInput={handleChange}
                onChange={handleChange}
            />
        </label>
    );
}
