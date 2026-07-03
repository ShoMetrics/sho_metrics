import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { commonMessages } from "../../../i18n/message-groups/shell";
import { optionMessages } from "../../../i18n/message-groups/options";
import { metricCustomizationMessages } from "../../../i18n/message-groups/widgets";
import { localizeOptionList } from "../../../i18n/options";
import { useI18n } from "../../../i18n/react";
import {
    buildMetricIconPreviewSvg,
} from "../../../widgets/icons/metric-icons";
import {
    METRIC_ICON_SEARCH_RESULT_LIMIT,
    readMetricIconMetadata,
    searchMetricIconOptions,
    type MetricIconMetadata,
    type MetricIconSearchResult,
} from "../../../widgets/icons/metric-icon-search";
import { InspectorItem } from "../../components/InspectorItem";
import { NumberSetting } from "../../controls/NumberSetting";
import { SelectSetting } from "../../controls/SelectSetting";
import { TextSetting } from "../../controls/TextSetting";
import {
    optionId,
    useListboxPopup,
} from "../../controls/listbox/use-listbox-popup";
import { SettingsSection } from "./SettingsSection";
import { scaleModeOptionList } from "../setting-options";
import type { ScaleMode } from "../../../settings/resolved-settings";
import { limitMetricCustomLabelCharacters } from "../../../settings/metric-custom-label-policy";
import { writePropertyInspectorWarningLog } from "../../diagnostics";
import { useStreamDeckClient } from "../../stream-deck/stream-deck-client-context";

export interface MetricCustomizationLabelSetting {
    readonly value: string | undefined;
    readonly prefillValue?: string | undefined;
    readonly inputMaximumCharacters: number;
    readonly displayMaximumCharacters: number;
    readonly onValueChange: (value: string) => void;
    readonly placeholder?: string | undefined;
    readonly actionButton?: React.JSX.Element | undefined;
}

export interface MetricCustomizationIconSetting {
    readonly iconId: string | undefined;
    readonly onIconIdChange: (iconId: string | undefined) => void;
}

export interface MetricCustomizationScaleSetting {
    readonly scaleMode: ScaleMode;
    readonly onScaleModeChange: (scaleMode: ScaleMode) => void;
    readonly maximumInput?: {
        readonly label: string;
        readonly value: number | undefined;
        readonly onValueChange: (value: number | undefined) => void;
        readonly minimum: number;
        readonly maximum: number;
        readonly step: number;
    } | undefined;
}

/**
 * Renders shared user-owned metric label, icon, and scale controls.
 *
 * Each caller decides which controls are legal for its metric type; this
 * component only owns the common PI interactions.
 */
export function MetricCustomizationSettings({
    label,
    icon,
    scale,
    note,
}: {
    readonly label?: MetricCustomizationLabelSetting | undefined;
    readonly icon?: MetricCustomizationIconSetting | undefined;
    readonly scale?: MetricCustomizationScaleSetting | undefined;
    readonly note?: string | undefined;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <SettingsSection title={t(metricCustomizationMessages.section)}>
            {label !== undefined && (
                <MetricLabelSetting label={label} />
            )}
            {icon !== undefined && (
                <MetricIconSetting
                    iconId={icon.iconId}
                    onIconIdChange={icon.onIconIdChange}
                />
            )}
            {scale !== undefined && (
                <>
                    <SelectSetting<ScaleMode>
                        label={t(commonMessages.scaleLabel)}
                        value={scale.scaleMode}
                        optionList={localizeOptionList(t, scaleModeOptionList, scaleModeMessageByValue)}
                        onValueChange={scale.onScaleModeChange}
                    />
                    {scale.scaleMode === "custom" && scale.maximumInput !== undefined && (
                        <NumberSetting
                            label={scale.maximumInput.label}
                            value={scale.maximumInput.value}
                            onValueChange={scale.maximumInput.onValueChange}
                            minimum={scale.maximumInput.minimum}
                            maximum={scale.maximumInput.maximum}
                            step={scale.maximumInput.step}
                            optional
                        />
                    )}
                </>
            )}
            {note !== undefined && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">{note}</p>
                </InspectorItem>
            )}
        </SettingsSection>
    );
}

function MetricLabelSetting({
    label,
}: {
    readonly label: MetricCustomizationLabelSetting;
}): React.JSX.Element {
    const { t } = useI18n();
    // Keep typing local so IME composition, spaces, and partially-invalid text
    // are not rewritten on every keypress. Settings are normalized on blur.
    const [draftValue, setDraftValue] = useState(() => readMetricLabelInputValue(label));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setDraftValue(readMetricLabelInputValue(label));
        }
    }, [isFocused, label.prefillValue, label.value]);

    return (
        <>
            <TextSetting
                label={t(metricCustomizationMessages.labelLabel)}
                value={draftValue}
                placeholder={label.placeholder}
                actionButton={label.actionButton}
                onValueChange={setDraftValue}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                    setIsFocused(false);
                    commitMetricLabelDraft(label, draftValue);
                }}
            />
            <InspectorItem className="note-item note-item-caption">
                <p className="section-note">
                    {t(metricCustomizationMessages.labelLimitNote, { count: label.displayMaximumCharacters })}
                </p>
            </InspectorItem>
        </>
    );
}

function readMetricLabelInputValue(label: MetricCustomizationLabelSetting): string {
    return label.value ?? label.prefillValue ?? "";
}

function commitMetricLabelDraft(label: MetricCustomizationLabelSetting, draftValue: string): void {
    const normalizedDraftValue = limitMetricCustomLabelCharacters(draftValue, label.inputMaximumCharacters) ?? "";
    const normalizedPrefillValue = label.prefillValue === undefined
        ? ""
        : limitMetricCustomLabelCharacters(label.prefillValue, label.inputMaximumCharacters) ?? "";

    // Prefill is a display default, not user-owned configuration. Do not write it
    // into custom_label until the user actually changes the field.
    if (label.value === undefined && normalizedDraftValue === normalizedPrefillValue) {
        return;
    }

    if (normalizedDraftValue === (label.value ?? "")) {
        return;
    }

    label.onValueChange(normalizedDraftValue);
}

const EMPTY_METRIC_ICON_SEARCH_RESULT: MetricIconSearchResult = {
    options: [],
    totalMatchCount: 0,
};

function MetricIconSetting({
    iconId,
    onIconIdChange,
}: MetricCustomizationIconSetting): React.JSX.Element {
    const { t } = useI18n();
    const streamDeckClient = useStreamDeckClient();
    const inputId = useId();
    const labelId = `${inputId}-label`;
    const listboxId = `${inputId}-listbox`;
    const rootElementRef = useRef<HTMLDivElement>(null);
    const inputElementRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState(() => iconId ?? "");
    const [searchResult, setSearchResult] = useState<MetricIconSearchResult>(EMPTY_METRIC_ICON_SEARCH_RESULT);
    const [isMetricIconSearchPending, setIsMetricIconSearchPending] = useState(false);
    // Listbox opening waits for the lazy search result that belongs to the
    // current query; otherwise the first keystroke can consume stale results.
    const [completedSearchQuery, setCompletedSearchQuery] = useState("");
    const [shouldOpenIconListboxAfterSearch, setShouldOpenIconListboxAfterSearch] = useState(false);
    const hasQuery = query.trim().length > 0;
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
            setQuery(searchResult.options.find(option => option.id === selectedIconId)?.label ?? selectedIconId);
        },
    });
    const shouldShowListbox = hasQuery && isOpen;
    const activeOptionId = shouldShowListbox && activeOptionIndex >= 0
        ? optionId(inputId, activeOptionIndex)
        : undefined;

    useEffect(() => {
        if (iconId === undefined) {
            setQuery("");
            return;
        }

        let isCurrent = true;
        setQuery(iconId);
        void readMetricIconMetadata(iconId)
            .then((metadata) => {
                if (isCurrent) {
                    setQuery(metadata?.label ?? iconId);
                }
            })
            .catch(() => {
                if (isCurrent) {
                    setQuery(iconId);
                }
                writePropertyInspectorWarningLog(streamDeckClient, "metricIconMetadataLoadFailed");
            });

        return () => {
            isCurrent = false;
        };
    }, [iconId, streamDeckClient]);

    useEffect(() => {
        let isCurrent = true;
        const searchQuery = query;
        setIsMetricIconSearchPending(true);

        void searchMetricIconOptions(searchQuery)
            .then((nextSearchResult) => {
                if (isCurrent) {
                    setSearchResult(nextSearchResult);
                    setCompletedSearchQuery(searchQuery);
                    setIsMetricIconSearchPending(false);
                }
            })
            .catch(() => {
                if (isCurrent) {
                    setSearchResult(EMPTY_METRIC_ICON_SEARCH_RESULT);
                    setCompletedSearchQuery(searchQuery);
                    setIsMetricIconSearchPending(false);
                }
                // The shared diagnostics path is throttled and redacted; keep
                // the query text out of logs because it is user input.
                writePropertyInspectorWarningLog(streamDeckClient, "metricIconSearchLoadFailed");
            });

        return () => {
            isCurrent = false;
        };
    }, [query, streamDeckClient]);

    useEffect(() => {
        if (!shouldOpenIconListboxAfterSearch) {
            return;
        }

        if (isMetricIconSearchPending) {
            return;
        }

        if (completedSearchQuery !== query) {
            return;
        }

        setShouldOpenIconListboxAfterSearch(false);
        if (hasQuery && iconOptionList.length > 0) {
            openListbox(0);
        }
    }, [
        completedSearchQuery,
        hasQuery,
        iconOptionList.length,
        isMetricIconSearchPending,
        openListbox,
        query,
        shouldOpenIconListboxAfterSearch,
    ]);

    return (
        <>
            <InspectorItem
                label={t(metricCustomizationMessages.iconSearchLabel)}
                labelId={labelId}
                labelFor={inputId}
            >
                <div
                    ref={rootElementRef}
                    className="metric-icon-combobox"
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
                        placeholder={t(metricCustomizationMessages.iconSearchPlaceholder)}
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
                            className="custom-select-listbox metric-icon-listbox"
                            role="listbox"
                            aria-labelledby={labelId}
                            data-placement={listboxLayout.placement}
                            style={{ maxHeight: listboxLayout.maxHeight }}
                        >
                            <div className="metric-icon-status" aria-hidden="true">
                                {searchResult.options.length === 0
                                    ? t(metricCustomizationMessages.iconNoResultsStatus)
                                    : t(metricCustomizationMessages.iconShowingResultsStatus, {
                                        shown: searchResult.options.length,
                                        count: searchResult.totalMatchCount,
                                    })}
                            </div>
                            {searchResult.options.map((option, index) => (
                                <MetricIconOptionButton
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
                    {t(metricCustomizationMessages.iconHint)}
                </p>
            </InspectorItem>
            {hasQuery && searchResult.totalMatchCount > METRIC_ICON_SEARCH_RESULT_LIMIT && (
                <InspectorItem className="note-item note-item-caption">
                    <p className="section-note">
                        {t(metricCustomizationMessages.iconKeepTypingHint, {
                            count: searchResult.totalMatchCount,
                            shown: METRIC_ICON_SEARCH_RESULT_LIMIT,
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
                        {t(metricCustomizationMessages.iconClearButton)}
                    </button>
                </InspectorItem>
            )}
        </>
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

function MetricIconOptionButton({
    id,
    option,
    optionRef,
    isActive,
    isSelected,
    onPointerEnter,
    onSelect,
}: {
    readonly id: string;
    readonly option: MetricIconMetadata;
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
            className="custom-select-option metric-icon-option"
            role="option"
            aria-selected={isSelected}
            data-active={isActive ? "true" : "false"}
            data-selected={isSelected ? "true" : "false"}
            onPointerEnter={onPointerEnter}
            onClick={onSelect}
        >
            <span
                className="metric-icon-preview"
                dangerouslySetInnerHTML={{ __html: buildMetricIconPreviewSvg(option.id) }}
            />
            <span className="metric-icon-label">{option.label}</span>
        </div>
    );
}

const scaleModeMessageByValue = {
    auto: optionMessages.autoOption,
    custom: optionMessages.customOption,
} as const;
