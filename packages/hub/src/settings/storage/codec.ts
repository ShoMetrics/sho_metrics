import {
    create,
    fromJson,
    toJson,
    type DescMessage,
    type JsonObject,
    type JsonValue,
    type MessageShape,
} from "@bufbuild/protobuf";
import { createValidator, type Violation } from "@bufbuild/protovalidate";

import {
    StoredGlobalSettingsSchema,
    StoredWidgetSettingsSchema,
    type StoredGlobalSettings,
    type StoredWidgetSettings,
} from "../../generated/shometrics/v1/settings_pb.js";

export type StoredSettingsJsonObject = JsonObject;

const storedSettingsValidator = createValidator();

export class StoredSettingsCodecError extends Error {
    override readonly name = "StoredSettingsCodecError";
}

export class StoredSettingsValidationError extends Error {
    override readonly name = "StoredSettingsValidationError";

    constructor(
        message: string,
        readonly violations: readonly Violation[],
    ) {
        super(message);
    }
}

export function readStoredWidgetSettings(rawSettings: unknown): StoredWidgetSettings {
    return readStoredSettings(
        StoredWidgetSettingsSchema,
        rawSettings,
        "StoredWidgetSettings",
    );
}

export function writeStoredWidgetSettings(settings: StoredWidgetSettings): StoredSettingsJsonObject {
    return writeStoredSettings(
        StoredWidgetSettingsSchema,
        settings,
        "StoredWidgetSettings",
    );
}

export function readStoredGlobalSettings(rawSettings: unknown): StoredGlobalSettings {
    return readStoredSettings(
        StoredGlobalSettingsSchema,
        rawSettings,
        "StoredGlobalSettings",
    );
}

export function writeStoredGlobalSettings(settings: StoredGlobalSettings): StoredSettingsJsonObject {
    return writeStoredSettings(
        StoredGlobalSettingsSchema,
        settings,
        "StoredGlobalSettings",
    );
}

function readStoredSettings<Schema extends DescMessage>(
    schema: Schema,
    rawSettings: unknown,
    settingsName: string,
): MessageShape<Schema> {
    const decodedSettings = decodeStoredSettings(schema, rawSettings, settingsName);
    validateStoredSettings(schema, decodedSettings, settingsName);

    return decodedSettings;
}

function writeStoredSettings<Schema extends DescMessage>(
    schema: Schema,
    settings: MessageShape<Schema>,
    settingsName: string,
): StoredSettingsJsonObject {
    validateStoredSettings(schema, settings, settingsName);

    const json = toJson(schema, settings);

    if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new StoredSettingsCodecError(`${settingsName} encoded to non-object ProtoJSON`);
    }

    return json;
}

function decodeStoredSettings<Schema extends DescMessage>(
    schema: Schema,
    rawSettings: unknown,
    settingsName: string,
): MessageShape<Schema> {
    if (rawSettings === undefined || rawSettings === null) {
        return create(schema);
    }

    try {
        return fromJson(schema, rawSettings as JsonValue);
    } catch (error) {
        throw new StoredSettingsCodecError(
            `${settingsName} is not valid ProtoJSON: ${errorMessage(error)}`,
        );
    }
}

function validateStoredSettings<Schema extends DescMessage>(
    schema: Schema,
    settings: MessageShape<Schema>,
    settingsName: string,
): void {
    const result = storedSettingsValidator.validate(schema, settings);

    switch (result.kind) {
        case "valid":
            return;
        case "invalid":
            throw new StoredSettingsValidationError(
                `${settingsName} violates stored settings contract: ${violationSummary(result.violations)}`,
                result.violations,
            );
        case "error":
            throw new StoredSettingsCodecError(
                `${settingsName} validation failed: ${result.error.message}`,
            );
    }
}

function violationSummary(violations: readonly Violation[]): string {
    return violations.map((violation) => violation.toString()).join("; ");
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
