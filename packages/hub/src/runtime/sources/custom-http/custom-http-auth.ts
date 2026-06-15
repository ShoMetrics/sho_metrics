import { Buffer } from "node:buffer";
import type {
    CustomHttpCredential,
    StoredGlobalSettings,
} from "../../../generated/proto/shometrics/v1/settings_pb.js";
import { pluginGlobalSettingsStore } from "../../../settings/global-settings-store";
import type { ResolvedCustomHttpRequestAuth } from "../../../settings/resolved-settings";
import { isCustomHttpLocalOrPrivateUrl } from "./custom-http-url";

/**
 * Secret-bearing runtime auth shape. Keep it inside request preparation and do
 * not persist it, put it in metric ids, or include it in logs/user diagnostics.
 */
export type CustomHttpPreparedAuth =
    | { readonly authKind: "none" }
    | { readonly authKind: "basic"; readonly username: string; readonly password: string }
    | { readonly authKind: "bearer"; readonly token: string }
    | { readonly authKind: "header"; readonly headerName: string; readonly token: string }
    | { readonly authKind: "query"; readonly queryParameterName: string; readonly token: string };

export type CustomHttpAuthFailureReason =
    | "credentialMissing"
    | "credentialSecretMissing"
    | "basicUsernameMissing"
    | "invalidHeaderName"
    | "invalidHeaderValue"
    | "invalidQueryParameterName"
    | "publicHttpCredentialBlocked"
    | "invalidUrl";

export type CustomHttpPreparedAuthResult =
    | {
        readonly ok: true;
        readonly auth: CustomHttpPreparedAuth;
    }
    | {
        readonly ok: false;
        readonly reason: CustomHttpAuthFailureReason;
        readonly detail: string;
    };

export type CustomHttpPreparedRequestResult =
    | {
        readonly ok: true;
        readonly url: string;
        readonly headers?: Readonly<Record<string, string>>;
        readonly queryParameterOverwritten: boolean;
    }
    | {
        readonly ok: false;
        readonly reason: CustomHttpAuthFailureReason;
        readonly detail: string;
    };

export interface CustomHttpCredentialSettingsReader {
    readStoredGlobalSettings(): StoredGlobalSettings;
}

/** Reads Custom HTTP credentials from the in-memory global settings snapshot. */
export class PluginGlobalCustomHttpCredentialSettingsReader implements CustomHttpCredentialSettingsReader {
    readStoredGlobalSettings(): StoredGlobalSettings {
        return pluginGlobalSettingsStore.getStored();
    }
}

/**
 * Resolves a widget credential reference into the concrete secret-bearing auth
 * shape used by runtime fetches. Returned failures must not include secrets.
 */
export function resolveCustomHttpPreparedAuth(input: {
    readonly url: string;
    readonly authReference: ResolvedCustomHttpRequestAuth;
    readonly globalSettings: StoredGlobalSettings;
}): CustomHttpPreparedAuthResult {
    const credentialId = input.authReference.credentialId;
    if (credentialId === undefined || credentialId.trim().length === 0) {
        return {
            ok: true,
            auth: { authKind: "none" },
        };
    }

    const publicHttpResult = readPublicHttpCredentialState(input.url);
    if (!publicHttpResult.ok) {
        return publicHttpResult;
    }

    if (publicHttpResult.isPublicHttp && !input.authReference.allowPublicHttpCredentials) {
        return {
            ok: false,
            reason: "publicHttpCredentialBlocked",
            detail: "HTTP credentials require explicit consent for public network URLs.",
        };
    }

    const credential = input.globalSettings.customHttpCredentials.find(candidate => candidate.id === credentialId);
    if (credential === undefined) {
        return {
            ok: false,
            reason: "credentialMissing",
            detail: "Selected Custom HTTP credential was not found.",
        };
    }

    return resolveStoredCustomHttpCredential(credential);
}

/**
 * Applies resolved auth to the request URL and headers. Query credentials use
 * URLSearchParams.set, so a matching URL parameter is replaced rather than duplicated.
 */
export function prepareCustomHttpRequest(input: {
    readonly url: string;
    readonly auth: CustomHttpPreparedAuth;
}): CustomHttpPreparedRequestResult {
    switch (input.auth.authKind) {
        case "none":
            return {
                ok: true,
                url: input.url,
                queryParameterOverwritten: false,
            };
        case "basic":
            return {
                ok: true,
                url: input.url,
                headers: {
                    Authorization: `Basic ${Buffer.from(`${input.auth.username}:${input.auth.password}`, "utf8").toString("base64")}`,
                },
                queryParameterOverwritten: false,
            };
        case "bearer":
            return {
                ok: true,
                url: input.url,
                headers: {
                    Authorization: `Bearer ${input.auth.token}`,
                },
                queryParameterOverwritten: false,
            };
        case "header":
            return {
                ok: true,
                url: input.url,
                headers: {
                    [input.auth.headerName]: input.auth.token,
                },
                queryParameterOverwritten: false,
            };
        case "query":
            return prepareQueryAuthenticatedRequest(input.url, input.auth.queryParameterName, input.auth.token);
    }
}

/** Redacts credential values from owner-visible fetch diagnostics. */
export function redactCustomHttpPreparedAuthSecrets(detail: string, auth: CustomHttpPreparedAuth): string {
    const secretValues = readCustomHttpPreparedAuthSecretValues(auth);
    return secretValues.reduce(
        (redactedDetail, secretValue) => redactedDetail.split(secretValue).join("[redacted]"),
        detail,
    );
}

/** Redacts only the query parameter that Custom HTTP auth intentionally injects into a URL. */
export function redactCustomHttpPreparedAuthUrl(url: string, auth: CustomHttpPreparedAuth): string {
    if (auth.authKind !== "query") {
        return url;
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return url;
    }

    if (parsedUrl.searchParams.has(auth.queryParameterName)) {
        parsedUrl.searchParams.set(auth.queryParameterName, "REDACTED");
    }

    return parsedUrl.toString();
}

export function isValidCustomHttpHeaderName(headerName: string): boolean {
    if (hasInvalidNameWhitespace(headerName)) {
        return false;
    }

    try {
        new Headers([[headerName, "value"]]);
        return true;
    } catch {
        return false;
    }
}

function isValidCustomHttpHeaderValue(headerName: string, headerValue: string): boolean {
    try {
        new Headers([[headerName, headerValue]]);
        return true;
    } catch {
        return false;
    }
}

function resolveStoredCustomHttpCredential(credential: CustomHttpCredential): CustomHttpPreparedAuthResult {
    switch (credential.auth.case) {
        case "basic": {
            const username = credential.auth.value.username ?? "";
            const password = credential.auth.value.password ?? "";
            if (username.trim().length === 0) {
                return {
                    ok: false,
                    reason: "basicUsernameMissing",
                    detail: "Selected Basic credential is missing a username.",
                };
            }

            if (password.trim().length === 0) {
                return missingSecretFailure();
            }

            return {
                ok: true,
                auth: {
                    authKind: "basic",
                    username,
                    password,
                },
            };
        }
        case "bearer": {
            const token = credential.auth.value.token ?? "";
            if (token.trim().length === 0) {
                return missingSecretFailure();
            }

            if (!isValidCustomHttpHeaderValue("Authorization", `Bearer ${token}`)) {
                return invalidHeaderValueFailure();
            }

            return {
                ok: true,
                auth: {
                    authKind: "bearer",
                    token,
                },
            };
        }
        case "header": {
            const headerName = credential.auth.value.headerName ?? "";
            const token = credential.auth.value.token ?? "";
            if (!isValidCustomHttpHeaderName(headerName)) {
                return {
                    ok: false,
                    reason: "invalidHeaderName",
                    detail: "Selected header credential has an invalid header name.",
                };
            }

            if (token.trim().length === 0) {
                return missingSecretFailure();
            }

            if (!isValidCustomHttpHeaderValue(headerName, token)) {
                return invalidHeaderValueFailure();
            }

            return {
                ok: true,
                auth: {
                    authKind: "header",
                    headerName,
                    token,
                },
            };
        }
        case "query": {
            const queryParameterName = credential.auth.value.queryParameterName ?? "";
            const token = credential.auth.value.token ?? "";
            if (hasInvalidNameWhitespace(queryParameterName)) {
                return {
                    ok: false,
                    reason: "invalidQueryParameterName",
                    detail: "Selected query credential has an invalid query parameter name.",
                };
            }

            return token.trim().length === 0
                ? missingSecretFailure()
                : {
                    ok: true,
                    auth: {
                        authKind: "query",
                        queryParameterName,
                        token,
                    },
                };
        }
        case undefined:
            return missingSecretFailure();
    }
}

function prepareQueryAuthenticatedRequest(
    url: string,
    queryParameterName: string,
    token: string,
): CustomHttpPreparedRequestResult {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return {
            ok: false,
            reason: "invalidUrl",
            detail: "URL is invalid.",
        };
    }

    const queryParameterOverwritten = parsedUrl.searchParams.has(queryParameterName);
    parsedUrl.searchParams.set(queryParameterName, token);
    return {
        ok: true,
        url: parsedUrl.toString(),
        queryParameterOverwritten,
    };
}

function readPublicHttpCredentialState(url: string): {
    readonly ok: true;
    readonly isPublicHttp: boolean;
} | {
    readonly ok: false;
    readonly reason: "invalidUrl";
    readonly detail: string;
} {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return {
            ok: false,
            reason: "invalidUrl",
            detail: "URL is invalid.",
        };
    }

    return {
        ok: true,
        isPublicHttp: parsedUrl.protocol === "http:" && !isCustomHttpLocalOrPrivateUrl(parsedUrl),
    };
}

function hasInvalidNameWhitespace(name: string): boolean {
    return name.length === 0 || name.trim() !== name || /\s/.test(name);
}

function missingSecretFailure(): CustomHttpPreparedAuthResult {
    return {
        ok: false,
        reason: "credentialSecretMissing",
        detail: "Selected Custom HTTP credential is missing its secret.",
    };
}

function invalidHeaderValueFailure(): CustomHttpPreparedAuthResult {
    return {
        ok: false,
        reason: "invalidHeaderValue",
        detail: "Selected Custom HTTP credential secret cannot be used in an HTTP header.",
    };
}

function readCustomHttpPreparedAuthSecretValues(auth: CustomHttpPreparedAuth): readonly string[] {
    switch (auth.authKind) {
        case "none":
            return [];
        case "basic":
            return [
                auth.password,
                Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64"),
            ].filter(isNonEmptyString);
        case "bearer":
        case "header":
        case "query":
            return [auth.token].filter(isNonEmptyString);
    }
}

function isNonEmptyString(value: string): boolean {
    return value.length > 0;
}
