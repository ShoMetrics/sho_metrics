import type { SelectOption, SelectOptionValue } from "../inspector/types";
import { isOptionDisabled } from "./setting-control";

export type SelectMoveDirection = "next" | "previous";

interface MoveActiveOptionInput<TValue extends SelectOptionValue> {
    readonly optionList: readonly SelectOption<TValue>[];
    readonly activeOptionIndex: number;
    readonly direction: SelectMoveDirection;
}

interface TextSearchInput<TValue extends SelectOptionValue> {
    readonly optionList: readonly SelectOption<TValue>[];
    readonly searchText: string;
    readonly startIndex: number;
}

export function resolveActiveOptionIndex<TValue extends SelectOptionValue>(
    optionList: readonly SelectOption<TValue>[],
    selectedValue: TValue | "",
): number {
    const selectedOptionIndex = findEnabledOptionIndexByValue(optionList, selectedValue);
    if (selectedOptionIndex >= 0) {
        return selectedOptionIndex;
    }

    return findFirstEnabledOptionIndex(optionList);
}

export function findEnabledOptionIndexByValue<TValue extends SelectOptionValue>(
    optionList: readonly SelectOption<TValue>[],
    value: TValue | "",
): number {
    return optionList.findIndex((option) => option.value === value && !isOptionDisabled(option));
}

export function findFirstEnabledOptionIndex<TValue extends SelectOptionValue>(
    optionList: readonly SelectOption<TValue>[],
): number {
    return optionList.findIndex((option) => !isOptionDisabled(option));
}

export function findLastEnabledOptionIndex<TValue extends SelectOptionValue>(
    optionList: readonly SelectOption<TValue>[],
): number {
    for (let index = optionList.length - 1; index >= 0; index -= 1) {
        if (!isOptionDisabled(optionList[index])) {
            return index;
        }
    }

    return -1;
}

export function moveActiveOptionIndex<TValue extends SelectOptionValue>({
    optionList,
    activeOptionIndex,
    direction,
}: MoveActiveOptionInput<TValue>): number {
    const step = direction === "next" ? 1 : -1;
    let nextOptionIndex = activeOptionIndex + step;

    while (nextOptionIndex >= 0 && nextOptionIndex < optionList.length) {
        if (!isOptionDisabled(optionList[nextOptionIndex])) {
            return nextOptionIndex;
        }

        nextOptionIndex += step;
    }

    if (optionList[activeOptionIndex] && !isOptionDisabled(optionList[activeOptionIndex])) {
        return activeOptionIndex;
    }

    return direction === "next"
        ? findLastEnabledOptionIndex(optionList)
        : findFirstEnabledOptionIndex(optionList);
}

export function findEnabledOptionIndexByTextPrefix<TValue extends SelectOptionValue>({
    optionList,
    searchText,
    startIndex,
}: TextSearchInput<TValue>): number {
    const normalizedSearchText = normalizeSearchText(searchText);
    if (normalizedSearchText === "" || optionList.length === 0) {
        return -1;
    }

    for (let offset = 0; offset < optionList.length; offset += 1) {
        const optionIndex = (startIndex + offset + optionList.length) % optionList.length;
        const option = optionList[optionIndex];
        if (!isOptionDisabled(option) && normalizeSearchText(option.label).startsWith(normalizedSearchText)) {
            return optionIndex;
        }
    }

    return -1;
}

export function normalizeRepeatedCharacterSearchText(searchText: string): string {
    const normalizedSearchText = normalizeSearchText(searchText);
    if (normalizedSearchText.length <= 1) {
        return normalizedSearchText;
    }

    const firstCharacter = normalizedSearchText[0];
    if ([...normalizedSearchText].every((character) => character === firstCharacter)) {
        return firstCharacter;
    }

    return normalizedSearchText;
}

function normalizeSearchText(value: string): string {
    return value.trim().toLocaleLowerCase();
}
