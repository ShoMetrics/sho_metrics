import { create } from "@bufbuild/protobuf";
import assert from "node:assert/strict";
import { test } from "vitest";
import {
    CustomHttpCredentialSchema,
    StoredGlobalSettingsSchema,
} from "../../generated/proto/shometrics/v1/settings_pb";
import { readCustomHttpCredentialSettings } from "./custom-http-credential-settings";

test("custom HTTP credential settings preserve secret-bearing credential values", () => {
    const settings = readCustomHttpCredentialSettings(create(StoredGlobalSettingsSchema, {
        customHttpCredentials: [
            create(CustomHttpCredentialSchema, {
                id: "credential-basic",
                auth: {
                    case: "basic",
                    value: {
                        username: "admin",
                        password: "secret",
                    },
                },
            }),
            create(CustomHttpCredentialSchema, {
                id: "credential-query",
                auth: {
                    case: "query",
                    value: {
                        queryParameterName: "api_key",
                        token: "token",
                    },
                },
            }),
        ],
    }));

    assert.deepEqual(settings.customHttpCredentials, [
        {
            id: "credential-basic",
            authKind: "basic",
            username: "admin",
            password: "secret",
        },
        {
            id: "credential-query",
            authKind: "query",
            queryParameterName: "api_key",
            token: "token",
        },
    ]);
});

test("custom HTTP credential settings preserve missing auth as a selected-credential failure", () => {
    const settings = readCustomHttpCredentialSettings(create(StoredGlobalSettingsSchema, {
        customHttpCredentials: [
            create(CustomHttpCredentialSchema, {
                id: "credential-missing-auth",
            }),
        ],
    }));

    assert.deepEqual(settings.customHttpCredentials, [{
        id: "credential-missing-auth",
        authKind: "missing",
    }]);
});
