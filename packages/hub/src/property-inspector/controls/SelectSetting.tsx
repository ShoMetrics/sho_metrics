import {
    useEffect,
    useId,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { InspectorItem } from "../components/InspectorItem";
import type { SelectOption, SelectOptionValue } from "../inspector/types";
import {
    isOptionDisabled,
    resolveSelectedOptionValue,
    type SettingControlProps,
} from "./setting-control";
import {
    findEnabledOptionIndexByTextPrefix,
    findFirstEnabledOptionIndex,
    findLastEnabledOptionIndex,
    moveActiveOptionIndex,
    normalizeRepeatedCharacterSearchText,
    resolveActiveOptionIndex,
} from "./select-navigation";
import {
    DEFAULT_SELECT_LISTBOX_LAYOUT,
    DEFAULT_SELECT_OPTION_HEIGHT_PIXELS,
    resolveSelectListboxLayout,
    type SelectListboxLayout,
} from "./select-layout";

const TYPEAHEAD_RESET_MS = 700;
const SELECT_OPTION_VERTICAL_PADDING_PIXELS = 8;

type SelectPreviewStyle = CSSProperties & {
    readonly "--custom-select-preview-size"?: string;
    readonly "--custom-select-preview-column-width"?: string;
    readonly "--custom-select-option-height"?: string;
};

interface SelectSettingProps<TValue extends SelectOptionValue> extends SettingControlProps {
    label: string;
    value: TValue;
    optionList: readonly SelectOption<TValue>[];
    buildOptionPreviewUri?: ((value: TValue) => string) | undefined;
    optionPreviewSizePixels?: number | undefined;
    onValueChange: (value: TValue) => void;
}

interface TypeaheadState {
    query: string;
    updatedAt: number;
}

export function SelectSetting<TValue extends SelectOptionValue>({
    label,
    value,
    optionList,
    buildOptionPreviewUri,
    optionPreviewSizePixels,
    onValueChange,
    disabled = false,
}: SelectSettingProps<TValue>): React.JSX.Element {
    const triggerId = useId();
    const triggerLabelId = `${triggerId}-label`;
    const triggerValueId = `${triggerId}-value`;
    const listboxId = `${triggerId}-listbox`;
    const selectedValue = resolveSelectedOptionValue({
        optionList,
        value,
    });
    const selectedOption = optionList.find((option) => option.value === selectedValue);
    const hasEnabledOption = findFirstEnabledOptionIndex(optionList) >= 0;
    const isControlDisabled = disabled || !hasEnabledOption;
    const selectedOptionLabel = selectedOption?.label ?? "";
    const selectedOptionPreviewUri = selectedOption
        ? buildOptionPreviewUri?.(selectedOption.value)
        : undefined;
    const hasOptionPreview = buildOptionPreviewUri !== undefined;
    const optionHeightPixels = hasOptionPreview && optionPreviewSizePixels !== undefined
        ? Math.max(DEFAULT_SELECT_OPTION_HEIGHT_PIXELS, optionPreviewSizePixels + SELECT_OPTION_VERTICAL_PADDING_PIXELS)
        : DEFAULT_SELECT_OPTION_HEIGHT_PIXELS;
    const rootStyle: SelectPreviewStyle | undefined = optionPreviewSizePixels === undefined
        ? undefined
        : {
            "--custom-select-preview-size": `${optionPreviewSizePixels}px`,
            "--custom-select-preview-column-width": `${optionPreviewSizePixels + 2}px`,
            "--custom-select-option-height": `${optionHeightPixels}px`,
        };
    const [isOpen, setIsOpen] = useState(false);
    const [activeOptionIndex, setActiveOptionIndex] = useState(() =>
        resolveActiveOptionIndex(optionList, selectedValue),
    );
    const [listboxLayout, setListboxLayout] = useState<SelectListboxLayout>(
        DEFAULT_SELECT_LISTBOX_LAYOUT,
    );
    const rootElementRef = useRef<HTMLDivElement>(null);
    const triggerElementRef = useRef<HTMLButtonElement>(null);
    const optionElementMapRef = useRef(new Map<number, HTMLDivElement>());
    const typeaheadStateRef = useRef<TypeaheadState>({
        query: "",
        updatedAt: 0,
    });

    useEffect(() => {
        if (!isOpen) {
            setActiveOptionIndex(resolveActiveOptionIndex(optionList, selectedValue));
        }
    }, [isOpen, optionList, selectedValue]);

    useEffect(() => {
        if (isControlDisabled && isOpen) {
            setIsOpen(false);
        }
    }, [isControlDisabled, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            resetTypeaheadState(typeaheadStateRef.current);
            return;
        }

        const activeOptionElement = optionElementMapRef.current.get(activeOptionIndex);
        activeOptionElement?.scrollIntoView({ block: "nearest" });
    }, [activeOptionIndex, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const updateListboxLayout = (): void => {
            setListboxLayout(readCurrentListboxLayout());
        };

        updateListboxLayout();
        document.addEventListener("scroll", updateListboxLayout, true);
        window.addEventListener("resize", updateListboxLayout);
        window.visualViewport?.addEventListener("resize", updateListboxLayout);
        window.visualViewport?.addEventListener("scroll", updateListboxLayout);

        return () => {
            document.removeEventListener("scroll", updateListboxLayout, true);
            window.removeEventListener("resize", updateListboxLayout);
            window.visualViewport?.removeEventListener("resize", updateListboxLayout);
            window.visualViewport?.removeEventListener("scroll", updateListboxLayout);
        };
    }, [isOpen, optionList.length]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleDocumentPointerDown = (event: PointerEvent): void => {
            const rootElement = rootElementRef.current;
            const target = event.target;
            if (rootElement && target instanceof Node && rootElement.contains(target)) {
                return;
            }

            setIsOpen(false);
        };

        const handleWindowBlur = (): void => {
            setIsOpen(false);
        };

        document.addEventListener("pointerdown", handleDocumentPointerDown, true);
        window.addEventListener("blur", handleWindowBlur);

        return () => {
            document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
            window.removeEventListener("blur", handleWindowBlur);
        };
    }, [isOpen]);

    const activeOptionId = isOpen && activeOptionIndex >= 0
        ? optionId(triggerId, activeOptionIndex)
        : undefined;

    return (
        <InspectorItem label={label} labelId={triggerLabelId} labelFor={triggerId}>
            <div
                ref={rootElementRef}
                className="custom-select"
                data-open={isOpen ? "true" : "false"}
                data-disabled={isControlDisabled ? "true" : "false"}
                data-has-preview={hasOptionPreview ? "true" : "false"}
                style={rootStyle}
            >
                <button
                    id={triggerId}
                    ref={triggerElementRef}
                    type="button"
                    role="combobox"
                    className="custom-select-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? listboxId : undefined}
                    aria-activedescendant={activeOptionId}
                    aria-labelledby={`${triggerLabelId} ${triggerValueId}`}
                    disabled={isControlDisabled}
                    onClick={() => {
                        if (isOpen) {
                            setIsOpen(false);
                            return;
                        }

                        openListbox();
                    }}
                    onKeyDown={(event) => {
                        handleTriggerKeyDown(event);
                    }}
                >
                    {selectedOptionPreviewUri && (
                        <img
                            className="custom-select-preview"
                            src={selectedOptionPreviewUri}
                            alt=""
                            aria-hidden="true"
                        />
                    )}
                    <span id={triggerValueId} className="custom-select-value">{selectedOptionLabel}</span>
                    <span className="custom-select-indicator" aria-hidden="true" />
                </button>
                {isOpen && (
                    <div
                        id={listboxId}
                        role="listbox"
                        className="custom-select-listbox"
                        aria-labelledby={triggerLabelId}
                        data-placement={listboxLayout.placement}
                        style={{ maxHeight: listboxLayout.maxHeight }}
                    >
                        {optionList.map((option, index) => {
                            const isDisabledOption = isOptionDisabled(option);
                            const isActiveOption = index === activeOptionIndex;
                            const isSelectedOption = option.value === selectedValue && !isDisabledOption;
                            const previewUri = buildOptionPreviewUri?.(option.value);

                            return (
                                <div
                                    id={optionId(triggerId, index)}
                                    key={String(option.value)}
                                    ref={(element) => {
                                        registerOptionElement(index, element);
                                    }}
                                    role="option"
                                    className="custom-select-option"
                                    aria-selected={isSelectedOption}
                                    aria-disabled={isDisabledOption || undefined}
                                    data-active={isActiveOption ? "true" : "false"}
                                    data-selected={isSelectedOption ? "true" : "false"}
                                    data-disabled={isDisabledOption ? "true" : "false"}
                                    onPointerEnter={() => {
                                        if (!isDisabledOption) {
                                            setActiveOptionIndex(index);
                                        }
                                    }}
                                    onClick={() => {
                                        if (!isDisabledOption) {
                                            commitOption(index);
                                        }
                                    }}
                                >
                                    {previewUri && (
                                        <img
                                            className="custom-select-option-preview"
                                            src={previewUri}
                                            alt=""
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span className="custom-select-option-label">{option.label}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </InspectorItem>
    );

    function openListbox(nextActiveOptionIndex = resolveActiveOptionIndex(optionList, selectedValue)): void {
        if (isControlDisabled || nextActiveOptionIndex < 0) {
            return;
        }

        setListboxLayout(readCurrentListboxLayout());
        setActiveOptionIndex(nextActiveOptionIndex);
        setIsOpen(true);
    }

    function readCurrentListboxLayout(): SelectListboxLayout {
        const triggerElement = triggerElementRef.current;
        if (!triggerElement) {
            return DEFAULT_SELECT_LISTBOX_LAYOUT;
        }

        return resolveSelectListboxLayout({
            optionCount: optionList.length,
            optionHeightPixels,
            triggerRect: triggerElement.getBoundingClientRect(),
            viewportHeight: window.visualViewport?.height ?? window.innerHeight,
        });
    }

    function commitOption(optionIndex: number): void {
        const option = optionList[optionIndex];
        if (!option || isOptionDisabled(option)) {
            return;
        }

        if (option.value !== selectedValue) {
            onValueChange(option.value);
        }

        setIsOpen(false);
        triggerElementRef.current?.focus();
    }

    function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
        if (isControlDisabled) {
            return;
        }

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                moveOrOpen("next");
                return;
            case "ArrowUp":
                event.preventDefault();
                moveOrOpen("previous");
                return;
            case "Home":
                event.preventDefault();
                openListbox(findFirstEnabledOptionIndex(optionList));
                return;
            case "End":
                event.preventDefault();
                openListbox(findLastEnabledOptionIndex(optionList));
                return;
            case "Enter":
            case " ":
                event.preventDefault();
                if (isOpen) {
                    commitOption(activeOptionIndex);
                    return;
                }

                openListbox();
                return;
            case "Escape":
                if (isOpen) {
                    event.preventDefault();
                    setIsOpen(false);
                }
                return;
            case "Tab":
                setIsOpen(false);
                return;
        }

        handleTypeaheadKey(event);
    }

    function moveOrOpen(direction: "next" | "previous"): void {
        if (!isOpen) {
            openListbox();
            return;
        }

        setActiveOptionIndex((currentIndex) =>
            moveActiveOptionIndex({
                optionList,
                activeOptionIndex: currentIndex,
                direction,
            }),
        );
    }

    function handleTypeaheadKey(event: ReactKeyboardEvent<HTMLButtonElement>): void {
        if (event.altKey || event.ctrlKey || event.metaKey || event.key.length !== 1) {
            return;
        }

        event.preventDefault();
        const searchText = readTypeaheadSearchText(event.key, typeaheadStateRef.current);
        const nextActiveOptionIndex = findEnabledOptionIndexByTextPrefix({
            optionList,
            searchText,
            startIndex: activeOptionIndex + 1,
        });

        if (nextActiveOptionIndex < 0) {
            return;
        }

        setActiveOptionIndex(nextActiveOptionIndex);
        setIsOpen(true);
    }

    function registerOptionElement(index: number, element: HTMLDivElement | null): void {
        if (element) {
            optionElementMapRef.current.set(index, element);
            return;
        }

        optionElementMapRef.current.delete(index);
    }
}

function optionId(triggerId: string, index: number): string {
    return `${triggerId}-option-${index}`;
}

function readTypeaheadSearchText(key: string, typeaheadState: TypeaheadState): string {
    const now = performance.now();
    const existingQuery = now - typeaheadState.updatedAt <= TYPEAHEAD_RESET_MS
        ? typeaheadState.query
        : "";
    const nextQuery = normalizeRepeatedCharacterSearchText(`${existingQuery}${key}`);

    typeaheadState.query = nextQuery;
    typeaheadState.updatedAt = now;
    return nextQuery;
}

function resetTypeaheadState(typeaheadState: TypeaheadState): void {
    typeaheadState.query = "";
    typeaheadState.updatedAt = 0;
}
