import type { InspectorControlValue } from "./schema";

export interface ControlValue {
    key: string;
    value: string;
}

export function readControlValue(event: Event): ControlValue | null {
    const control = event.composedPath()
        .find((eventTarget): eventTarget is HTMLElement => (
            eventTarget instanceof HTMLElement
            && typeof eventTarget.dataset.settingKey === "string"
        ));

    if (!control) {
        return null;
    }

    const key = control.dataset.settingKey;

    if (!key) {
        return null;
    }

    return { key, value: readElementValue(control) };
}

function readElementValue(element: HTMLElement): string {
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
        return element.value;
    }

    const shadowInput = element.shadowRoot?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");

    const propertyValue = readValueProperty(element);

    if (typeof propertyValue === "string") {
        return propertyValue;
    }

    if (shadowInput && shadowInput.value.length > 0) {
        return shadowInput.value;
    }

    return element.getAttribute("value") ?? "";
}

function readValueProperty(element: HTMLElement): InspectorControlValue {
    const propertyTarget = element as HTMLElement & { value?: InspectorControlValue };
    return propertyTarget.value;
}
