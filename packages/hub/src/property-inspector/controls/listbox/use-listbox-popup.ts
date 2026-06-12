import {
    useEffect,
    useRef,
    useState,
    type RefObject,
} from "react";
import type { SelectOption, SelectOptionValue } from "../../inspector/types";
import { isOptionDisabled } from "../setting-control";
import {
    DEFAULT_LISTBOX_LAYOUT,
    DEFAULT_LISTBOX_OPTION_HEIGHT_PIXELS,
    resolveListboxLayout,
    type ListboxLayout,
} from "./layout";
import {
    moveActiveOptionIndex,
    resolveActiveOptionIndex,
    type ListboxMoveDirection,
} from "./navigation";

interface ListboxPopupInput<TValue extends SelectOptionValue> {
    /**
     * Counts non-option rows, such as an autocomplete status row, in popup height.
     */
    readonly layoutRowCount?: number | undefined;
    readonly optionHeightPixels?: number | undefined;
    readonly optionList: readonly SelectOption<TValue>[];
    readonly rootElementRef: RefObject<HTMLElement | null>;
    readonly selectedValue: TValue | "";
    readonly triggerElementRef: RefObject<HTMLElement | null>;
    readonly isDisabled?: boolean | undefined;
    readonly onOptionSelected?: ((value: TValue) => void) | undefined;
    readonly onValueChange: (value: TValue) => void;
    /**
     * Keeps button selects focused after selection while allowing text inputs to
     * avoid reopening their autocomplete list on focus.
     */
    readonly shouldFocusAfterSelection?: boolean | undefined;
}

interface ListboxPopupController {
    readonly activeOptionIndex: number;
    readonly isOpen: boolean;
    readonly listboxLayout: ListboxLayout;
    openListbox(activeOptionIndex?: number): void;
    closeListbox(): void;
    moveOrOpen(direction: ListboxMoveDirection): void;
    registerOptionElement(index: number, element: HTMLElement | null): void;
    selectOption(optionIndex: number): void;
    setActiveOptionIndex(index: number): void;
}

/** Owns shared listbox popup state, positioning, outside-click close, and selection. */
export function useListboxPopup<TValue extends SelectOptionValue>({
    layoutRowCount,
    optionHeightPixels = DEFAULT_LISTBOX_OPTION_HEIGHT_PIXELS,
    optionList,
    rootElementRef,
    selectedValue,
    triggerElementRef,
    isDisabled = false,
    onOptionSelected,
    onValueChange,
    shouldFocusAfterSelection = true,
}: ListboxPopupInput<TValue>): ListboxPopupController {
    const [isOpen, setIsOpen] = useState(false);
    const [activeOptionIndex, setActiveOptionIndex] = useState(() =>
        resolveActiveOptionIndex(optionList, selectedValue),
    );
    const [listboxLayout, setListboxLayout] = useState<ListboxLayout>(
        DEFAULT_LISTBOX_LAYOUT,
    );
    const optionElementMapRef = useRef(new Map<number, HTMLElement>());

    useEffect(() => {
        if (!isOpen) {
            setActiveOptionIndex(resolveActiveOptionIndex(optionList, selectedValue));
        }
    }, [isOpen, optionList, selectedValue]);

    useEffect(() => {
        if (isDisabled && isOpen) {
            setIsOpen(false);
        }
    }, [isDisabled, isOpen]);

    useEffect(() => {
        if (!isOpen) {
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
    }, [isOpen, layoutRowCount, optionHeightPixels, optionList.length]);

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
    }, [isOpen, rootElementRef]);

    return {
        activeOptionIndex,
        isOpen,
        listboxLayout,
        openListbox,
        closeListbox,
        moveOrOpen,
        registerOptionElement,
        selectOption,
        setActiveOptionIndex,
    };

    function openListbox(nextActiveOptionIndex = resolveActiveOptionIndex(optionList, selectedValue)): void {
        if (isDisabled || nextActiveOptionIndex < 0) {
            return;
        }

        setListboxLayout(readCurrentListboxLayout());
        setActiveOptionIndex(nextActiveOptionIndex);
        setIsOpen(true);
    }

    function closeListbox(): void {
        setIsOpen(false);
    }

    function selectOption(optionIndex: number): void {
        const option = optionList[optionIndex];
        if (!option || isOptionDisabled(option)) {
            return;
        }

        if (option.value !== selectedValue) {
            onValueChange(option.value);
        }

        onOptionSelected?.(option.value);
        setIsOpen(false);
        if (shouldFocusAfterSelection) {
            triggerElementRef.current?.focus();
        }
    }

    function moveOrOpen(direction: ListboxMoveDirection): void {
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

    function registerOptionElement(index: number, element: HTMLElement | null): void {
        if (element) {
            optionElementMapRef.current.set(index, element);
            return;
        }

        optionElementMapRef.current.delete(index);
    }

    function readCurrentListboxLayout(): ListboxLayout {
        const triggerElement = triggerElementRef.current;
        if (!triggerElement) {
            return DEFAULT_LISTBOX_LAYOUT;
        }

        return resolveListboxLayout({
            rowCount: layoutRowCount ?? optionList.length,
            optionHeightPixels,
            triggerRect: triggerElement.getBoundingClientRect(),
            viewportHeight: window.visualViewport?.height ?? window.innerHeight,
        });
    }
}

/** Builds the stable DOM id used by combobox aria-activedescendant wiring. */
export function optionId(triggerId: string, index: number): string {
    return `${triggerId}-option-${index}`;
}
