import { commonMessages } from "../../../i18n/message-groups/shell";
import { diskMessages, networkMessages } from "../../../i18n/message-groups/widgets";
import { useI18n, type I18n } from "../../../i18n/react";
import { NumberSetting } from "../../controls/NumberSetting";

interface MetricMaximumInputSpecBase {
    readonly label: string;
    readonly minimum: number;
    readonly maximum?: number | undefined;
    readonly step: number;
    readonly disabled?: boolean | undefined;
}

export type MetricMaximumInputSpec =
    | (MetricMaximumInputSpecBase & {
        readonly value: number;
        readonly optional: false;
    })
    | (MetricMaximumInputSpecBase & {
        readonly value: number | undefined;
        readonly optional: true;
    });

export function MetricMaximumNumberSetting({
    input,
    onValueChange,
}: {
    readonly input: MetricMaximumInputSpec;
    readonly onValueChange: (value: number | undefined) => void;
}): React.JSX.Element {
    if (input.optional) {
        return (
            <NumberSetting
                label={input.label}
                value={input.value}
                onValueChange={onValueChange}
                minimum={input.minimum}
                maximum={input.maximum}
                step={input.step}
                optional
                disabled={input.disabled}
            />
        );
    }

    return (
        <NumberSetting
            label={input.label}
            value={input.value}
            onValueChange={(value) => onValueChange(value)}
            minimum={input.minimum}
            maximum={input.maximum}
            step={input.step}
            disabled={input.disabled}
        />
    );
}

export function TemperatureMaximumSetting({
    value,
    onValueChange,
}: {
    readonly value: number;
    readonly onValueChange: (value: number) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <MetricMaximumNumberSetting
            input={buildTemperatureMaximumInputSpec(t, value)}
            onValueChange={(nextValue) => {
                if (nextValue !== undefined) {
                    onValueChange(nextValue);
                }
            }}
        />
    );
}

export function PowerMaximumSetting({
    value,
    onValueChange,
}: {
    readonly value: number | undefined;
    readonly onValueChange: (value: number | undefined) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <MetricMaximumNumberSetting
            input={buildPowerMaximumInputSpec(t, value)}
            onValueChange={onValueChange}
        />
    );
}

export function DiskThroughputMaximumSetting({
    direction,
    value,
    disabled = false,
    onValueChange,
}: {
    readonly direction: "read" | "write";
    readonly value: number | undefined;
    readonly disabled?: boolean | undefined;
    readonly onValueChange: (value: number | undefined) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <MetricMaximumNumberSetting
            input={buildDiskThroughputMaximumInputSpec(t, direction, value, disabled)}
            onValueChange={onValueChange}
        />
    );
}

export function NetworkTrafficMaximumSetting({
    direction,
    value,
    disabled = false,
    onValueChange,
}: {
    readonly direction: "upload" | "download";
    readonly value: number | undefined;
    readonly disabled?: boolean | undefined;
    readonly onValueChange: (value: number | undefined) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <MetricMaximumNumberSetting
            input={buildNetworkTrafficMaximumInputSpec(t, direction, value, disabled)}
            onValueChange={onValueChange}
        />
    );
}

export function NetworkPingMaximumSetting({
    value,
    onValueChange,
}: {
    readonly value: number;
    readonly onValueChange: (value: number) => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <MetricMaximumNumberSetting
            input={buildNetworkPingMaximumInputSpec(t, value)}
            onValueChange={(nextValue) => {
                if (nextValue !== undefined) {
                    onValueChange(nextValue);
                }
            }}
        />
    );
}

export function buildTemperatureMaximumInputSpec(
    t: I18n["t"],
    value: number,
): MetricMaximumInputSpec {
    return {
        label: t(commonMessages.maxTempCLabel),
        value,
        minimum: 1,
        step: 1,
        optional: false,
    };
}

export function buildPowerMaximumInputSpec(
    t: I18n["t"],
    value: number | undefined,
): MetricMaximumInputSpec {
    return {
        label: t(commonMessages.maxPowerWLabel),
        value,
        minimum: 1,
        step: 1,
        optional: true,
    };
}

export function buildDiskThroughputMaximumInputSpec(
    t: I18n["t"],
    direction: "read" | "write",
    value: number | undefined,
    disabled = false,
): MetricMaximumInputSpec {
    return {
        label: direction === "read" ? t(diskMessages.readMaxMibLabel) : t(diskMessages.writeMaxMibLabel),
        value,
        minimum: 1,
        step: 1,
        optional: true,
        disabled,
    };
}

export function buildNetworkTrafficMaximumInputSpec(
    t: I18n["t"],
    direction: "upload" | "download",
    value: number | undefined,
    disabled = false,
): MetricMaximumInputSpec {
    return {
        label: direction === "upload" ? t(networkMessages.uploadMaxMbpsLabel) : t(networkMessages.downloadMaxMbpsLabel),
        value,
        minimum: 1,
        step: 1,
        optional: true,
        disabled,
    };
}

export function buildNetworkPingMaximumInputSpec(
    t: I18n["t"],
    value: number,
): MetricMaximumInputSpec {
    return {
        label: t(networkMessages.pingMaximumLatencyLabel),
        value,
        minimum: 1,
        step: 1,
        optional: false,
    };
}

export function buildPercentMaximumInputSpec(
    maximumLabel: string,
    value: number | undefined,
): MetricMaximumInputSpec {
    return {
        label: `${maximumLabel} (%)`,
        value,
        minimum: 1,
        maximum: 100,
        step: 1,
        optional: true,
    };
}

export function buildMillisecondsMaximumInputSpec(
    maximumLabel: string,
    value: number | undefined,
): MetricMaximumInputSpec {
    return {
        label: `${maximumLabel} (ms)`,
        value,
        minimum: 1,
        step: 1,
        optional: true,
    };
}

export function readByteRateAsMebibytesPerSecond(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value / 1024 / 1024;
}

export function writeMebibytesPerSecondAsByteRate(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value * 1024 * 1024;
}

export function readByteRateAsMegabitsPerSecond(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value * 8 / 1_000_000;
}

export function writeMegabitsPerSecondAsByteRate(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value * 1_000_000 / 8;
}
