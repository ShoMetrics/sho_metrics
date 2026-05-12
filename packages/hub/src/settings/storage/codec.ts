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

export interface StoredSettingsReadWarning {
    readonly reason: "unknownFieldsDiscarded" | "invalidSettingsDefaulted";
    readonly message: string;
}

export interface StoredSettingsReadResult<TSettings> {
    readonly settings: TSettings;
    readonly warning: StoredSettingsReadWarning | null;
}

class StoredSettingsCodecError extends Error {
    override readonly name = "StoredSettingsCodecError";
}

class StoredSettingsValidationError extends Error {
    override readonly name = "StoredSettingsValidationError";

    constructor(
        message: string,
        readonly violations: readonly Violation[],
    ) {
        super(message);
    }
}

/** Reads widget settings and returns a warning when recovery was needed. */
export function readStoredWidgetSettings(rawSettings: unknown): StoredSettingsReadResult<StoredWidgetSettings> {
    return readRecoverableStoredSettings(
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

/** Reads global settings and returns a warning when recovery was needed. */
export function readStoredGlobalSettings(rawSettings: unknown): StoredSettingsReadResult<StoredGlobalSettings> {
    return readRecoverableStoredSettings(
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

function readStrictStoredSettings<Schema extends DescMessage>(
    schema: Schema,
    rawSettings: unknown,
    settingsName: string,
): MessageShape<Schema> {
    const decodedSettings = decodeStoredSettings(schema, rawSettings, settingsName);
    validateStoredSettings(schema, decodedSettings, settingsName);

    return decodedSettings;
}

function readRecoverableStoredSettings<Schema extends DescMessage>(
    schema: Schema,
    rawSettings: unknown,
    settingsName: string,
): StoredSettingsReadResult<MessageShape<Schema>> {
    try {
        return {
            settings: readStrictStoredSettings(schema, rawSettings, settingsName),
            warning: null,
        };
    } catch {
        try {
            const settings = decodeStoredSettings(schema, rawSettings, settingsName, {
                ignoreUnknownFields: true,
            });
            validateStoredSettings(schema, settings, settingsName);

            return {
                settings,
                warning: {
                    reason: "unknownFieldsDiscarded",
                    message:
                        `${settingsName} contains fields this version does not understand. ` +
                        "They will be removed the next time settings are saved.",
                },
            };
        } catch {
            return {
                settings: create(schema),
                warning: {
                    reason: "invalidSettingsDefaulted",
                    message:
                        `${settingsName} could not be read. Defaults are shown; ` +
                        "saving will replace the unreadable settings.",
                },
            };
        }
    }
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
    options?: { readonly ignoreUnknownFields?: boolean },
): MessageShape<Schema> {
    if (rawSettings === undefined || rawSettings === null) {
        return create(schema);
    }

    try {
        return fromJson(schema, rawSettings as JsonValue, options);
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
