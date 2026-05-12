import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    readStoredGlobalSettings,
    readStoredWidgetSettings,
    StoredSettingsCodecError,
    StoredSettingsValidationError,
    writeStoredGlobalSettings,
    writeStoredWidgetSettings,
} from "./codec";

describe("stored settings proto codec", () => {
    it("reads missing widget settings as an empty stored proto message", () => {
        const settings = readStoredWidgetSettings(undefined);

        assert.equal(settings.widget.case, undefined);
        assert.equal(settings.preferences, undefined);
    });

    it("round-trips valid widget settings as readable ProtoJSON", () => {
        const settings = readStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 30,
            },
        });

        const json = writeStoredWidgetSettings(settings);

        assert.deepEqual(json, {
            preferences: {
                pollingFrequencySeconds: 30,
            },
        });
    });

    it("rejects widget settings that violate protovalidate rules", () => {
        assert.throws(
            () => readStoredWidgetSettings({
                preferences: {
                    pollingFrequencySeconds: 0,
                },
            }),
            StoredSettingsValidationError,
        );
    });

    it("rejects unknown ProtoJSON fields", () => {
        assert.throws(
            () => readStoredWidgetSettings({
                unknownProtoJsonField: "circular",
            }),
            StoredSettingsCodecError,
        );
    });

    it("round-trips valid global settings as readable ProtoJSON", () => {
        const settings = readStoredGlobalSettings({
            defaultSourceProfileId: "local",
            sourceProfiles: [
                {
                    id: "local",
                    displayName: "Local machine",
                    sourceTypeId: "node-system",
                },
            ],
        });

        const json = writeStoredGlobalSettings(settings);

        assert.deepEqual(json, {
            defaultSourceProfileId: "local",
            sourceProfiles: [
                {
                    id: "local",
                    displayName: "Local machine",
                    sourceTypeId: "node-system",
                },
            ],
        });
    });
});
