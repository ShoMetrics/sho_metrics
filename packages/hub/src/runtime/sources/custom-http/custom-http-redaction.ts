const SECRET_LIKE_NAME_PATTERN =
    /(?:api[_-]?key|access[_-]?token|token|auth|authorization|secret|password|passwd|pwd|signature|sig|client[_-]?secret)/i;

const REDACTED_SECRET_VALUE = "REDACTED";
const SECRET_LIKE_JSON_PROPERTY_NAMES = new Set([
    "apikey",
    "accesstoken",
    "token",
    "authtoken",
    "authorization",
    "auth",
    "secret",
    "password",
    "passwd",
    "pwd",
    "signature",
    "sig",
    "clientsecret",
]);

export interface RedactedSourceUrl {
    readonly text: string;
    readonly hasSecretLikeQueryParameter: boolean;
}

/**
 * Redacts secret-like query parameter values from a source URL string.
 */
export function redactSecretLikeSourceUrl(sourceUrl: string): RedactedSourceUrl {
    const trimmedSourceUrl = sourceUrl.trim();
    if (trimmedSourceUrl.length === 0) {
        return {
            text: trimmedSourceUrl,
            hasSecretLikeQueryParameter: false,
        };
    }

    try {
        const parsedSourceUrl = new URL(trimmedSourceUrl);
        let hasSecretLikeQueryParameter = false;
        for (const queryParameterName of Array.from(parsedSourceUrl.searchParams.keys())) {
            if (isSecretLikeName(queryParameterName)) {
                hasSecretLikeQueryParameter = true;
                parsedSourceUrl.searchParams.set(queryParameterName, REDACTED_SECRET_VALUE);
            }
        }

        return {
            text: parsedSourceUrl.toString(),
            hasSecretLikeQueryParameter,
        };
    } catch {
        let hasSecretLikeQueryParameter = false;
        const text = trimmedSourceUrl.replace(
            /([?&][^=&#]*(?:api[_-]?key|access[_-]?token|token|auth|authorization|secret|password|passwd|pwd|signature|sig|client[_-]?secret)[^=&#]*=)[^&#]*/gi,
            (_match, queryParameterPrefix: string) => {
                hasSecretLikeQueryParameter = true;
                return `${queryParameterPrefix}${REDACTED_SECRET_VALUE}`;
            },
        );
        return { text, hasSecretLikeQueryParameter };
    }
}

/**
 * Redacts values whose JSON property names look like secrets.
 */
export function redactSecretLikeJsonText(jsonText: string): string {
    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(jsonText);
    } catch {
        return redactSecretLikeJsonPropertyText(jsonText);
    }

    return JSON.stringify(redactSecretLikeJsonValue(parsedValue));
}

function redactSecretLikeJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item => redactSecretLikeJsonValue(item));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    const redactedEntries = Object.entries(value).map(([key, entryValue]) => [
        key,
        isSecretLikeJsonPropertyName(key) ? REDACTED_SECRET_VALUE : redactSecretLikeJsonValue(entryValue),
    ]);
    return Object.fromEntries(redactedEntries);
}

function redactSecretLikeJsonPropertyText(value: string): string {
    return value.replace(
        /("(?:(?:\\.)|[^"\\])*?"\s*:\s*)"(?:(?:\\.)|[^"\\])*?"/g,
        (match, keyPrefix: string) => {
            const keyText = keyPrefix.slice(0, keyPrefix.indexOf(":")).trim();
            const key = readJsonStringLiteral(keyText);
            return key !== undefined && isSecretLikeJsonPropertyName(key)
                ? `${keyPrefix}"${REDACTED_SECRET_VALUE}"`
                : match;
        },
    );
}

function isSecretLikeName(name: string): boolean {
    return SECRET_LIKE_NAME_PATTERN.test(name);
}

function isSecretLikeJsonPropertyName(name: string): boolean {
    return SECRET_LIKE_JSON_PROPERTY_NAMES.has(name.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function readJsonStringLiteral(value: string): string | undefined {
    try {
        const parsedValue: unknown = JSON.parse(value);
        return typeof parsedValue === "string" ? parsedValue : undefined;
    } catch {
        return undefined;
    }
}
