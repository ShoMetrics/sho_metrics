import { commonMessages } from "../../i18n/message-groups/shell";
import { optionMessages } from "../../i18n/message-groups/options";
import { localizeOptionList } from "../../i18n/options";
import { useI18n } from "../../i18n/react";
import { SelectSetting } from "../controls/SelectSetting";
import type { SelectOption } from "../inspector/types";
import {
    BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
    BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
} from "../../runtime/sources/source-ids";
import type { ResolvedMetricSourcePolicy } from "../../settings/resolved-settings";
import type { StoredWidgetSettingsPatch } from "../../settings/storage/patch/widget-settings-patch";

type LocalMetricSourcePreference = "auto" | "windows-helper" | "node-system" | "custom";

interface MetricSourceSettingsProps {
    readonly sourcePolicy: ResolvedMetricSourcePolicy;
    readonly onSettingsPatch: (patch: StoredWidgetSettingsPatch) => void;
}

const sourcePreferenceOptionList = [
    { value: "auto", label: "Auto (Recommended)" },
    { value: "windows-helper", label: "Prefer Helper" },
    { value: "node-system", label: "Prefer Built-in" },
] as const satisfies readonly SelectOption<LocalMetricSourcePreference>[];

const customSourcePreferenceOption = {
    value: "custom",
    label: "Custom Source",
} as const satisfies SelectOption<LocalMetricSourcePreference>;

export function MetricSourceSettings({
    sourcePolicy,
    onSettingsPatch,
}: MetricSourceSettingsProps): React.JSX.Element {
    const { t } = useI18n();
    const sourcePreference = resolveLocalMetricSourcePreference(sourcePolicy);
    const optionList = sourcePreference === "custom"
        ? [...sourcePreferenceOptionList, customSourcePreferenceOption]
        : sourcePreferenceOptionList;

    return (
        <SelectSetting
            label={t(commonMessages.sourceLabel)}
            value={sourcePreference}
            optionList={localizeOptionList(t, optionList, sourcePreferenceMessageByValue)}
            onValueChange={(nextSourcePreference) => {
                if (nextSourcePreference === "custom") {
                    return;
                }

                onSettingsPatch({
                    source: buildLocalMetricSourcePreferencePatch(nextSourcePreference),
                });
            }}
        />
    );
}

const sourcePreferenceMessageByValue = {
    auto: optionMessages.autoRecommendedOption,
    "windows-helper": optionMessages.preferHelperOption,
    "node-system": optionMessages.preferBuiltInOption,
    custom: optionMessages.customSourceOption,
} as const;

function resolveLocalMetricSourcePreference(
    sourcePolicy: ResolvedMetricSourcePolicy,
): LocalMetricSourcePreference {
    if (
        sourcePolicy.primarySourceProfileId === undefined
        && sourcePolicy.fallbackSourceProfileIds.length === 0
    ) {
        return "auto";
    }

    if (
        sourcePolicy.primarySourceProfileId === BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID
        && sourcePolicy.failureMode === "useFallback"
        && sourcePolicy.fallbackSourceProfileIds.length === 1
        && sourcePolicy.fallbackSourceProfileIds[0] === BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID
    ) {
        return "windows-helper";
    }

    if (
        sourcePolicy.primarySourceProfileId === BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID
        && sourcePolicy.failureMode === "useFallback"
        && sourcePolicy.fallbackSourceProfileIds.length === 1
        && sourcePolicy.fallbackSourceProfileIds[0] === BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID
    ) {
        return "node-system";
    }

    return "custom";
}

function buildLocalMetricSourcePreferencePatch(
    sourcePreference: Exclude<LocalMetricSourcePreference, "custom">,
): NonNullable<StoredWidgetSettingsPatch["source"]> {
    switch (sourcePreference) {
        case "auto":
            return {
                primarySourceProfileId: undefined,
                fallbackSourceProfileIds: [],
                failureMode: "showUnavailable",
            };
        case "windows-helper":
            return {
                primarySourceProfileId: BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID,
                fallbackSourceProfileIds: [BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID],
                failureMode: "useFallback",
            };
        case "node-system":
            return {
                primarySourceProfileId: BUILT_IN_NODE_SYSTEM_SOURCE_PROFILE_ID,
                fallbackSourceProfileIds: [BUILT_IN_WINDOWS_HELPER_SOURCE_PROFILE_ID],
                failureMode: "useFallback",
            };
    }
}
