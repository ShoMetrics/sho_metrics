import assert from "node:assert/strict";
import test from "node:test";
import type { FieldSchema, SelectOption, VisibilityContext } from "../schema";
import { inspectorScope } from "../scopes";
import { basePropertyInspectorSettings } from "../settings";
import {
    isFieldDisabled,
    isOptionDisabled,
    isOptionHidden,
    resolveSelectedOptionValue,
    resolveSelectOptions,
} from "./field-options";

test("field disabled state respects explicit and conditional disabling", () => {
    const context = buildContext({
        colorMode: "solid",
    });

    assert.equal(isFieldDisabled(buildField({ disabled: true }), context), true);
    assert.equal(isFieldDisabled(buildField({
        disabledWhen: {
            key: "colorMode",
            equals: "solid",
        },
    }), context), true);
    assert.equal(isFieldDisabled(buildField({
        disabledWhen: {
            key: "colorMode",
            equals: "threshold",
        },
    }), context), false);
});

test("select options resolve static and provider-backed sources", () => {
    const context = buildContext({
        availableNetworkInterfaces: JSON.stringify([{
            id: "eth0",
            name: "Ethernet",
            type: "wired",
        }]),
    });

    assert.deepEqual(resolveSelectOptions(buildField({
        options: {
            kind: "static",
            values: [{ value: "a", label: "A" }],
        },
    }), context), [{ value: "a", label: "A" }]);
    assert.deepEqual(resolveSelectOptions(buildField({
        options: {
            kind: "provider",
            providerId: "networkInterfaces",
        },
    }), context), [
        { value: "", label: "Automatic" },
        { value: "eth0", label: "Ethernet (wired, eth0)" },
    ]);
});

test("selected option value skips disabled and hidden options before using fallback", () => {
    const context = buildContext({}, true);
    const options: SelectOption[] = [
        { value: "hidden", label: "Hidden", hidden: true },
        { value: "windows", label: "Windows Hidden", hiddenOnWindows: true },
        { value: "fallback", label: "Fallback" },
    ];

    assert.equal(resolveSelectedOptionValue({
        context,
        options,
        value: "hidden",
        fallbackValue: "fallback",
    }), "fallback");
    assert.equal(resolveSelectedOptionValue({
        context,
        options,
        value: "windows",
    }), "fallback");
});

test("option disabled and hidden states account for Windows-only options", () => {
    const windowsContext = buildContext({}, true);
    const macContext = buildContext({}, false);
    const windowsOnlyOption = { value: "throughput", label: "Throughput", hiddenOnWindows: true };

    assert.equal(isOptionDisabled(windowsOnlyOption, windowsContext), true);
    assert.equal(isOptionHidden(windowsOnlyOption, windowsContext), true);
    assert.equal(isOptionDisabled(windowsOnlyOption, macContext), false);
    assert.equal(isOptionHidden(windowsOnlyOption, macContext), false);
});

function buildContext(
    settings: Partial<typeof basePropertyInspectorSettings> = {},
    isWindows = false,
): VisibilityContext {
    return {
        actionKind: "cpu-usage",
        isWindows,
        settings: {
            ...basePropertyInspectorSettings,
            ...settings,
        },
    };
}

function buildField(overrides: Partial<FieldSchema> = {}): FieldSchema {
    return {
        id: "field",
        kind: "select",
        allowedScopes: [inspectorScope.cpuUsageCircularScope],
        key: "colorMode",
        ...overrides,
    };
}
