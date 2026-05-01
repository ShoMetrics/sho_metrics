import type { WidgetData } from "../rendering/widget-data";

export type TemperatureUnit = "celsius" | "fahrenheit";

export interface TemperatureDisplayOptions {
    celsiusWidgetData: WidgetData;
    maximumCelsius: number;
    unit: TemperatureUnit;
}

const DEFAULT_MAXIMUM_CELSIUS = 100;

export function buildTemperatureWidgetData(options: TemperatureDisplayOptions): WidgetData {
    const displayTemperature = options.unit === "fahrenheit"
        ? convertCelsiusToFahrenheit(options.celsiusWidgetData.current)
        : options.celsiusWidgetData.current;

    return {
        ...options.celsiusWidgetData,
        progress: Math.min(Math.max(options.celsiusWidgetData.current / options.maximumCelsius, 0), 1),
        unit: options.unit === "fahrenheit" ? "F" : "C",
        displayValue: displayTemperature.toFixed(0),
    };
}

export function resolveMaximumTemperatureCelsius(value: unknown): number {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return DEFAULT_MAXIMUM_CELSIUS;
    }

    return numericValue;
}

export function resolveTemperatureUnit(value: unknown): TemperatureUnit {
    return value === "fahrenheit" ? "fahrenheit" : "celsius";
}

function convertCelsiusToFahrenheit(celsius: number): number {
    return celsius * 9 / 5 + 32;
}
