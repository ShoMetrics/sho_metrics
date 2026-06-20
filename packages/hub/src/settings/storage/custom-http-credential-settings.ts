import type {
    CustomHttpCredential as StoredCustomHttpCredential,
    StoredGlobalSettings,
} from "../../generated/proto/shometrics/v1/settings_pb.js";

export type CustomHttpSecretCredential =
    | {
        readonly id: string;
        readonly authKind: "basic";
        readonly username: string;
        readonly password: string;
    }
    | {
        readonly id: string;
        readonly authKind: "bearer";
        readonly token: string;
    }
    | {
        readonly id: string;
        readonly authKind: "header";
        readonly headerName: string;
        readonly token: string;
    }
    | {
        readonly id: string;
        readonly authKind: "query";
        readonly queryParameterName: string;
        readonly token: string;
    }
    | {
        readonly id: string;
        readonly authKind: "missing";
    };

export interface CustomHttpCredentialSettings {
    readonly customHttpCredentials: readonly CustomHttpSecretCredential[];
}

/** Converts stored global settings into the runtime credential secret model. */
export function readCustomHttpCredentialSettings(
    storedGlobalSettings: StoredGlobalSettings,
): CustomHttpCredentialSettings {
    return {
        customHttpCredentials: storedGlobalSettings.customHttpCredentials.map(readCustomHttpSecretCredential),
    };
}

function readCustomHttpSecretCredential(
    storedCredential: StoredCustomHttpCredential,
): CustomHttpSecretCredential {
    const id = storedCredential.id ?? "";
    switch (storedCredential.auth.case) {
        case "basic":
            return {
                id,
                authKind: "basic",
                username: storedCredential.auth.value.username ?? "",
                password: storedCredential.auth.value.password ?? "",
            };
        case "bearer":
            return {
                id,
                authKind: "bearer",
                token: storedCredential.auth.value.token ?? "",
            };
        case "header":
            return {
                id,
                authKind: "header",
                headerName: storedCredential.auth.value.headerName ?? "",
                token: storedCredential.auth.value.token ?? "",
            };
        case "query":
            return {
                id,
                authKind: "query",
                queryParameterName: storedCredential.auth.value.queryParameterName ?? "",
                token: storedCredential.auth.value.token ?? "",
            };
        case undefined:
            return {
                id,
                authKind: "missing",
            };
    }
}
