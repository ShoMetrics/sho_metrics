import { create } from "@bufbuild/protobuf";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CustomHttpCredentialSchema,
    StoredGlobalSettingsSchema,
    type StoredGlobalSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb";
import type { ResolvedCustomHttpRequestAuth } from "../../../settings/resolved-settings";
import {
    isValidCustomHttpHeaderName,
    prepareCustomHttpRequest,
    redactCustomHttpPreparedAuthUrl,
    redactCustomHttpPreparedAuthSecrets,
    resolveCustomHttpPreparedAuth,
} from "./custom-http-auth";

describe("Custom HTTP auth resolution", () => {
    it("returns none when no credential is selected", () => {
        const result = resolveCustomHttpPreparedAuth({
            url: "https://api.example.com/data",
            authReference: defaultAuthReference(),
            globalSettings: globalSettings(),
        });

        assert.deepEqual(result, {
            ok: true,
            auth: { authKind: "none" },
        });
    });

    it("resolves Basic credentials for local HTTP without public-network consent", () => {
        const result = resolveCustomHttpPreparedAuth({
            url: "http://192.168.1.10/data",
            authReference: { credentialId: "credential-1", allowPublicHttpCredentials: false },
            globalSettings: globalSettings(
                create(CustomHttpCredentialSchema, {
                    id: "credential-1",
                    nickname: "LHM",
                    auth: {
                        case: "basic",
                        value: {
                            username: "admin",
                            password: "secret",
                        },
                    },
                }),
            ),
        });

        assert.deepEqual(result, {
            ok: true,
            auth: {
                authKind: "basic",
                username: "admin",
                password: "secret",
            },
        });
    });

    it("blocks credentials on public HTTP URLs until the widget opts in", () => {
        const result = resolveCustomHttpPreparedAuth({
            url: "http://api.example.com/data",
            authReference: { credentialId: "credential-1", allowPublicHttpCredentials: false },
            globalSettings: globalSettings(
                create(CustomHttpCredentialSchema, {
                    id: "credential-1",
                    auth: {
                        case: "bearer",
                        value: { token: "secret" },
                    },
                }),
            ),
        });

        assert.deepEqual(result, {
            ok: false,
            reason: "publicHttpCredentialBlocked",
            detail: "HTTP credentials require explicit consent for public network URLs.",
        });
    });

    it("allows credentials on public HTTP URLs after explicit widget consent", () => {
        const result = resolveCustomHttpPreparedAuth({
            url: "http://api.example.com/data",
            authReference: { credentialId: "credential-1", allowPublicHttpCredentials: true },
            globalSettings: globalSettings(
                create(CustomHttpCredentialSchema, {
                    id: "credential-1",
                    auth: {
                        case: "bearer",
                        value: { token: "secret" },
                    },
                }),
            ),
        });

        assert.deepEqual(result, {
            ok: true,
            auth: {
                authKind: "bearer",
                token: "secret",
            },
        });
    });

    it("rejects invalid header and query names", () => {
        assert.equal(isValidCustomHttpHeaderName("X-Api-Key"), true);
        assert.equal(isValidCustomHttpHeaderName(" X-Api-Key"), false);
        assert.equal(isValidCustomHttpHeaderName("X Api Key"), false);

        const headerResult = resolveCustomHttpPreparedAuth({
            url: "https://api.example.com/data",
            authReference: { credentialId: "credential-1", allowPublicHttpCredentials: false },
            globalSettings: globalSettings(
                create(CustomHttpCredentialSchema, {
                    id: "credential-1",
                    auth: {
                        case: "header",
                        value: {
                            headerName: "X Api Key",
                            token: "secret",
                        },
                    },
                }),
            ),
        });
        const queryResult = resolveCustomHttpPreparedAuth({
            url: "https://api.example.com/data",
            authReference: { credentialId: "credential-1", allowPublicHttpCredentials: false },
            globalSettings: globalSettings(
                create(CustomHttpCredentialSchema, {
                    id: "credential-1",
                    auth: {
                        case: "query",
                        value: {
                            queryParameterName: "api key",
                            token: "secret",
                        },
                    },
                }),
            ),
        });

        assert.equal(headerResult.ok, false);
        assert.equal(headerResult.ok ? undefined : headerResult.reason, "invalidHeaderName");
        assert.equal(queryResult.ok, false);
        assert.equal(queryResult.ok ? undefined : queryResult.reason, "invalidQueryParameterName");
    });

    it("rejects control characters in header-bearing secrets", () => {
        const bearerResult = resolveCustomHttpPreparedAuth({
            url: "https://api.example.com/data",
            authReference: { credentialId: "credential-1", allowPublicHttpCredentials: false },
            globalSettings: globalSettings(
                create(CustomHttpCredentialSchema, {
                    id: "credential-1",
                    auth: {
                        case: "bearer",
                        value: { token: "secret\r\nX-Leak: yes" },
                    },
                }),
            ),
        });
        const headerResult = resolveCustomHttpPreparedAuth({
            url: "https://api.example.com/data",
            authReference: { credentialId: "credential-1", allowPublicHttpCredentials: false },
            globalSettings: globalSettings(
                create(CustomHttpCredentialSchema, {
                    id: "credential-1",
                    auth: {
                        case: "header",
                        value: {
                            headerName: "X-Api-Key",
                            token: "secret\r\nX-Leak: yes",
                        },
                    },
                }),
            ),
        });

        assert.equal(bearerResult.ok, false);
        assert.equal(bearerResult.ok ? undefined : bearerResult.reason, "invalidHeaderValue");
        assert.equal(headerResult.ok, false);
        assert.equal(headerResult.ok ? undefined : headerResult.reason, "invalidHeaderValue");
    });
});

describe("Custom HTTP request preparation", () => {
    it("adds Basic and Bearer headers", () => {
        assert.deepEqual(prepareCustomHttpRequest({
            url: "https://api.example.com/data",
            auth: {
                authKind: "basic",
                username: "admin",
                password: "secret",
            },
        }), {
            ok: true,
            url: "https://api.example.com/data",
            headers: {
                Authorization: "Basic YWRtaW46c2VjcmV0",
            },
            queryParameterOverwritten: false,
        });
        assert.deepEqual(prepareCustomHttpRequest({
            url: "https://api.example.com/data",
            auth: {
                authKind: "bearer",
                token: "secret",
            },
        }), {
            ok: true,
            url: "https://api.example.com/data",
            headers: {
                Authorization: "Bearer secret",
            },
            queryParameterOverwritten: false,
        });
    });

    it("sets query credentials and reports overwritten parameters", () => {
        const result = prepareCustomHttpRequest({
            url: "https://api.example.com/data?api_key=old&mode=current",
            auth: {
                authKind: "query",
                queryParameterName: "api_key",
                token: "secret",
            },
        });

        assert.deepEqual(result, {
            ok: true,
            url: "https://api.example.com/data?api_key=secret&mode=current",
            queryParameterOverwritten: true,
        });
    });
});

describe("Custom HTTP auth diagnostics", () => {
    it("redacts prepared credential secrets from detail strings", () => {
        assert.equal(
            redactCustomHttpPreparedAuthSecrets(
                "request failed with token secret",
                { authKind: "bearer", token: "secret" },
            ),
            "request failed with token [redacted]",
        );
        assert.equal(
            redactCustomHttpPreparedAuthSecrets(
                "request failed with password secret or Basic YWRtaW46c2VjcmV0",
                { authKind: "basic", username: "admin", password: "secret" },
            ),
            "request failed with password [redacted] or Basic [redacted]",
        );
    });

    it("redacts only the configured query credential parameter from URLs", () => {
        assert.equal(
            redactCustomHttpPreparedAuthUrl(
                "https://api.example.com/data?api_key=secret&mode=current",
                { authKind: "query", queryParameterName: "api_key", token: "secret" },
            ),
            "https://api.example.com/data?api_key=REDACTED&mode=current",
        );
        assert.equal(
            redactCustomHttpPreparedAuthUrl(
                "http://127.0.0.1:8092/data.json",
                { authKind: "bearer", token: "2" },
            ),
            "http://127.0.0.1:8092/data.json",
        );
    });
});

function defaultAuthReference(): ResolvedCustomHttpRequestAuth {
    return {
        credentialId: undefined,
        allowPublicHttpCredentials: false,
    };
}

function globalSettings(
    ...customHttpCredentials: StoredGlobalSettings["customHttpCredentials"]
): StoredGlobalSettings {
    return create(StoredGlobalSettingsSchema, { customHttpCredentials });
}
