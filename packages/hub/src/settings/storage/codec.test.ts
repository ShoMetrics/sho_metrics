import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    readStoredGlobalSettings,
    readStoredWidgetSettings,
    writeStoredGlobalSettings,
    writeStoredWidgetSettings,
} from "./codec";

describe("stored settings proto codec", () => {
    it("reads missing widget settings as an empty stored proto message", () => {
        const result = readStoredWidgetSettings(undefined);
        const settings = result.settings;

        assert.equal(result.warning, null);
        assert.equal(settings.widget.case, undefined);
        assert.equal(settings.preferences, undefined);
    });

    it("round-trips valid widget settings as readable ProtoJSON", () => {
        const result = readStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 30,
            },
        });
        const settings = result.settings;

        assert.equal(result.warning, null);
        const json = writeStoredWidgetSettings(settings);

        assert.deepEqual(json, {
            preferences: {
                pollingFrequencySeconds: 30,
            },
        });
    });

    it("reads settings with unknown ProtoJSON fields by dropping the unknown fields", () => {
        const result = readStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 30,
            },
            unknownProtoJsonField: "future-value",
        });

        assert.equal(result.warning?.reason, "unknownFieldsDiscarded");
        assert.equal(result.settings.preferences?.pollingFrequencySeconds, 30);
        assert.deepEqual(writeStoredWidgetSettings(result.settings), {
            preferences: {
                pollingFrequencySeconds: 30,
            },
        });
    });

    it("reads invalid settings with an empty stored settings default", () => {
        const result = readStoredWidgetSettings({
            preferences: {
                pollingFrequencySeconds: 0,
            },
        });

        assert.equal(result.warning?.reason, "invalidSettingsDefaulted");
        assert.equal(result.settings.preferences, undefined);
        assert.equal(result.settings.widget.case, undefined);
    });

    it("round-trips valid global settings as readable ProtoJSON", () => {
        const result = readStoredGlobalSettings({
            defaultSourceProfileId: "local",
            sourceProfiles: [
                {
                    id: "local",
                    displayName: "Local machine",
                    sourceTypeId: "node-system",
                },
            ],
        });
        const settings = result.settings;

        assert.equal(result.warning, null);
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

    it("reads global settings with unknown ProtoJSON fields by dropping the unknown fields", () => {
        const result = readStoredGlobalSettings({
            defaultSourceProfileId: "local",
            futureGlobalSettingsField: true,
        });

        assert.equal(result.warning?.reason, "unknownFieldsDiscarded");
        assert.equal(result.settings.defaultSourceProfileId, "local");
        assert.deepEqual(writeStoredGlobalSettings(result.settings), {
            defaultSourceProfileId: "local",
        });
    });
});
