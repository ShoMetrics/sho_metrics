import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { customMetricMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import {
    optionId,
    useListboxPopup,
} from "../../controls/listbox/use-listbox-popup";
import { InspectorItem } from "../../components/InspectorItem";
import {
    buildCustomMetricIconPreviewSvg,
} from "../../../widgets/icons/custom-metric-icons";
import {
    CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT,
    readCustomMetricIconMetadata,
    searchCustomMetricIconOptions,
    type CustomMetricIconMetadata,
} from "../../../widgets/icons/custom-metric-icon-search";
import { SettingsSection } from "../SettingsSection";

export function CustomMetricIconSettings({
    iconId,
    onIconIdChange,
}: {
    readonly iconId: string | undefined;
    readonly onIconIdChange: (iconId: string | undefined) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const inputId = useId();
    const labelId = `${inputId}-label`;
    const listboxId = `${inputId}-listbox`;
    const rootElementRef = useRef<HTMLDivElement>(null);
    const inputElementRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState(() => iconId === undefined
        ? ""
        : readCustomMetricIconMetadata(iconId)?.label ?? "");
    const [shouldOpenIconListboxAfterSearch, setShouldOpenIconListboxAfterSearch] = useState(false);
    const hasQuery = query.trim().length > 0;
    const searchResult = useMemo(() => searchCustomMetricIconOptions(query), [query]);
    const iconOptionList = useMemo(() => searchResult.options.map(option => ({
        value: option.id,
        label: option.label,
    })), [searchResult.options]);
    const {
        activeOptionIndex,
        isOpen,
        listboxLayout,
        closeListbox,
        moveOrOpen,
        openListbox,
        registerOptionElement,
        selectOption,
        setActiveOptionIndex,
    } = useListboxPopup({
        layoutRowCount: iconOptionList.length + 1,
        optionList: iconOptionList,
        selectedValue: iconId ?? "",
        rootElementRef,
        triggerElementRef: inputElementRef,
        onValueChange: onIconIdChange,
        shouldFocusAfterSelection: false,
        onOptionSelected: (selectedIconId) => {
            setQuery(readCustomMetricIconMetadata(selectedIconId)?.label ?? selectedIconId);
        },
    });
    const shouldShowListbox = hasQuery && isOpen;
    const activeOptionId = shouldShowListbox && activeOptionIndex >= 0
        ? optionId(inputId, activeOptionIndex)
        : undefined;

    useEffect(() => {
        setQuery(iconId === undefined ? "" : readCustomMetricIconMetadata(iconId)?.label ?? "");
    }, [iconId]);

    useEffect(() => {
        if (!shouldOpenIconListboxAfterSearch) {
            return;
        }

        setShouldOpenIconListboxAfterSearch(false);
        if (hasQuery && iconOptionList.length > 0) {
            openListbox(0);
        }
    }, [hasQuery, iconOptionList.length, openListbox, shouldOpenIconListboxAfterSearch]);

    return (
        <SettingsSection title={t(customMetricMessages.iconSection)}>
            <InspectorItem
                label={t(customMetricMessages.iconSearchLabel)}
                labelId={labelId}
                labelFor={inputId}
            >
                <div
                    ref={rootElementRef}
                    className="custom-metric-icon-combobox"
                >
                    <input
                        id={inputId}
                        ref={inputElementRef}
                        className="native-input"
                        type="text"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-activedescendant={activeOptionId}
                        aria-haspopup="listbox"
                        aria-expanded={shouldShowListbox}
                        aria-controls={shouldShowListbox ? listboxId : undefined}
                        aria-labelledby={labelId}
                        placeholder={t(customMetricMessages.iconSearchPlaceholder)}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.currentTarget.value);
                            setShouldOpenIconListboxAfterSearch(true);
                        }}
                        onFocus={() => {
                            if (hasQuery) {
                                setShouldOpenIconListboxAfterSearch(true);
                            }
                        }}
                        onKeyDown={(event) => {
                            handleIconSearchKeyDown(event);
                        }}
                    />
                    {shouldShowListbox && (
                        <div
                            id={listboxId}
                            className="custom-select-listbox custom-metric-icon-listbox"
                            role="listbox"
                            aria-labelledby={labelId}
                            data-placement={listboxLayout.placement}
                            style={{ maxHeight: listboxLayout.maxHeight }}
                        >
                            <div className="custom-metric-icon-status" aria-hidden="true">
                                {searchResult.options.length === 0
                                    ? t(customMetricMessages.iconNoResultsStatus)
                                    : t(customMetricMessages.iconShowingResultsStatus, {
                                        shown: searchResult.options.length,
                                        count: searchResult.totalMatchCount,
                                    })}
                            </div>
                            {searchResult.options.map((option, index) => (
                                <CustomMetricIconOptionButton
                                    key={option.id}
                                    id={optionId(inputId, index)}
                                    option={option}
                                    optionRef={(element) => {
                                        registerOptionElement(index, element);
                                    }}
                                    isActive={index === activeOptionIndex}
                                    isSelected={option.id === iconId}
                                    onPointerEnter={() => setActiveOptionIndex(index)}
                                    onSelect={() => {
                                        setQuery(option.label);
                                        selectOption(index);
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </InspectorItem>
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">
                    {t(customMetricMessages.iconHint)}
                </p>
            </InspectorItem>
            {hasQuery && searchResult.totalMatchCount > CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">
                        {t(customMetricMessages.iconKeepTypingHint, {
                            count: searchResult.totalMatchCount,
                            shown: CUSTOM_METRIC_ICON_SEARCH_RESULT_LIMIT,
                        })}
                    </p>
                </InspectorItem>
            )}
            {iconId !== undefined && (
                <InspectorItem>
                    <button
                        className="inline-action-button"
                        type="button"
                        onClick={() => {
                            setQuery("");
                            closeListbox();
                            onIconIdChange(undefined);
                        }}
                    >
                        {t(customMetricMessages.iconClearButton)}
                    </button>
                </InspectorItem>
            )}
        </SettingsSection>
    );

    function handleIconSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                moveOrOpen("next");
                return;
            case "ArrowUp":
                event.preventDefault();
                moveOrOpen("previous");
                return;
            case "Enter":
                if (shouldShowListbox) {
                    event.preventDefault();
                    selectOption(activeOptionIndex);
                }
                return;
            case "Escape":
                if (shouldShowListbox) {
                    event.preventDefault();
                    setShouldOpenIconListboxAfterSearch(false);
                    closeListbox();
                }
                return;
        }
    }
}

function CustomMetricIconOptionButton({
    id,
    option,
    optionRef,
    isActive,
    isSelected,
    onPointerEnter,
    onSelect,
}: {
    readonly id: string;
    readonly option: CustomMetricIconMetadata;
    readonly optionRef: (element: HTMLDivElement | null) => void;
    readonly isActive: boolean;
    readonly isSelected: boolean;
    readonly onPointerEnter: () => void;
    readonly onSelect: () => void;
}): React.JSX.Element {
    return (
        <div
            id={id}
            ref={optionRef}
            className="custom-select-option custom-metric-icon-option"
            role="option"
            aria-selected={isSelected}
            data-active={isActive ? "true" : "false"}
            data-selected={isSelected ? "true" : "false"}
            onPointerEnter={onPointerEnter}
            onClick={onSelect}
        >
            <span
                className="custom-metric-icon-preview"
                dangerouslySetInnerHTML={{ __html: buildCustomMetricIconPreviewSvg(option.id) }}
            />
            <span className="custom-metric-icon-label">{option.label}</span>
        </div>
    );
}
