import type { WidgetData } from "../rendering/widget-data";

export type TemperatureUnit = "celsius" | "fahrenheit";

interface TemperatureDisplayOptions {
    celsiusWidgetData: WidgetData;
    maximumCelsius: number;
    unit: TemperatureUnit;
}

export function buildTemperatureWidgetData(options: TemperatureDisplayOptions): WidgetData {
    const displayTemperature = options.unit === "fahrenheit"
        ? convertCelsiusToFahrenheit(options.celsiusWidgetData.current)
        : options.celsiusWidgetData.current;
    return {
        ...options.celsiusWidgetData,
        progress: Math.min(Math.max(options.celsiusWidgetData.current / options.maximumCelsius, 0), 1),
        unit: options.unit === "fahrenheit" ? "F" : "C",
        displayValue: displayTemperature.toFixed(0),
        secondaryDisplayValue: `max: ${formatMaximumTemperature(options.maximumCelsius, options.unit)}`,
        sparklineScale: {
            mode: "fixed",
            minimumValue: 0,
            maximumValue: options.maximumCelsius,
        },
    };
}

function convertCelsiusToFahrenheit(celsius: number): number {
    return celsius * 9 / 5 + 32;
}

function formatMaximumTemperature(maximumCelsius: number, unit: TemperatureUnit): string {
    const maximumTemperature = unit === "fahrenheit"
        ? convertCelsiusToFahrenheit(maximumCelsius)
        : maximumCelsius;

    return `${maximumTemperature.toFixed(0)} ${formatTemperatureDisplayUnit(unit)}`;
}

function formatTemperatureDisplayUnit(unit: TemperatureUnit): string {
    return unit === "fahrenheit" ? "°F" : "°C";
}
