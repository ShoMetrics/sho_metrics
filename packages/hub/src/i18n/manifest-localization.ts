import type { HubLocale, LocalizedMessage } from "./types";

export interface ManifestMessagesCatalog {
    readonly root: {
        readonly name: LocalizedMessage;
        readonly description: LocalizedMessage;
    };
    readonly actions: Readonly<Record<string, ManifestActionMessages>>;
}

export interface ManifestActionMessages {
    readonly name: LocalizedMessage;
    readonly tooltip: LocalizedMessage;
    readonly encoder?: {
        readonly triggerDescription?: Partial<Record<StreamDeckEncoderTriggerDescriptionKey, LocalizedMessage>>;
    };
    readonly states?: readonly {
        readonly name: LocalizedMessage;
    }[];
}

export type StreamDeckEncoderTriggerDescriptionKey = "LongTouch" | "Push" | "Rotate" | "Touch";

interface StreamDeckManifest {
    readonly Name?: string;
    readonly Description?: string;
    readonly Actions?: readonly StreamDeckManifestAction[];
}

interface StreamDeckManifestAction {
    readonly UUID?: string;
    readonly Name?: string;
    readonly Tooltip?: string;
    readonly Encoder?: {
        readonly TriggerDescription?: Partial<Record<StreamDeckEncoderTriggerDescriptionKey, string>>;
    };
    readonly States?: readonly {
        readonly Name?: string;
    }[];
}

export type StreamDeckLocaleJson = Record<string, unknown>;

/**
 * Builds one Stream Deck locale JSON object from the manifest message catalog.
 */
export function buildStreamDeckLocaleJson(
    manifest: StreamDeckLocaleManifestInput,
    catalog: ManifestMessagesCatalog,
    locale: HubLocale,
): StreamDeckLocaleJson {
    const actionByUuid = indexManifestActionsByUuid(manifest);
    const localeJson: StreamDeckLocaleJson = {
        Name: catalog.root.name[locale],
        Description: catalog.root.description[locale],
    };

    for (const actionUuid of Object.keys(catalog.actions).sort()) {
        const actionCatalog = catalog.actions[actionUuid];
        const actionManifest = actionByUuid.get(actionUuid);
        const actionLocaleJson: StreamDeckLocaleJson = {
            Name: actionCatalog.name[locale],
            Tooltip: actionCatalog.tooltip[locale],
        };

        const states = buildStateLocaleJson(actionCatalog, locale);
        if (states) {
            actionLocaleJson.States = states;
        }

        const encoder = buildEncoderLocaleJson(actionCatalog, actionManifest, locale);
        if (encoder) {
            actionLocaleJson.Encoder = encoder;
        }

        localeJson[actionUuid] = actionLocaleJson;
    }

    return localeJson;
}

/**
 * Reports manifest and catalog mismatches that would make locale JSON drift.
 */
export function validateManifestLocalizationCatalog(
    manifest: StreamDeckLocaleManifestInput,
    catalog: ManifestMessagesCatalog,
): readonly string[] {
    const actionByUuid = indexManifestActionsByUuid(manifest);
    const errorList: string[] = [];

    assertEnglishText(errorList, "manifest Name", manifest.Name, catalog.root.name.en);
    assertEnglishText(errorList, "manifest Description", manifest.Description, catalog.root.description.en);

    for (const actionUuid of Object.keys(catalog.actions).sort()) {
        const actionCatalog = catalog.actions[actionUuid];
        const actionManifest = actionByUuid.get(actionUuid);
        if (!actionManifest) {
            errorList.push(`Manifest catalog action is missing from manifest: ${actionUuid}`);
            continue;
        }

        assertEnglishText(errorList, `${actionUuid} Name`, actionManifest.Name, actionCatalog.name.en);
        assertEnglishText(errorList, `${actionUuid} Tooltip`, actionManifest.Tooltip, actionCatalog.tooltip.en);
        validateStateEnglishText(errorList, actionUuid, actionManifest, actionCatalog);
        validateEncoderEnglishText(errorList, actionUuid, actionManifest, actionCatalog);
    }

    for (const action of manifest.Actions ?? []) {
        if (action.UUID && !catalog.actions[action.UUID]) {
            errorList.push(`Manifest action is missing from manifest catalog: ${action.UUID}`);
        }
    }

    return errorList;
}

export type StreamDeckLocaleManifestInput = StreamDeckManifest;

function buildStateLocaleJson(
    actionCatalog: ManifestActionMessages,
    locale: HubLocale,
): readonly StreamDeckLocaleJson[] | undefined {
    if (!actionCatalog.states) {
        return undefined;
    }

    return actionCatalog.states.map((stateCatalog) => ({
        Name: stateCatalog.name[locale],
    }));
}

function buildEncoderLocaleJson(
    actionCatalog: ManifestActionMessages,
    actionManifest: StreamDeckManifestAction | undefined,
    locale: HubLocale,
): StreamDeckLocaleJson | undefined {
    if (!actionCatalog.encoder?.triggerDescription) {
        return undefined;
    }

    const triggerDescription = Object.fromEntries(
        Object.entries(actionCatalog.encoder.triggerDescription)
            .filter(([triggerName]) => actionManifest?.Encoder?.TriggerDescription?.[triggerName as StreamDeckEncoderTriggerDescriptionKey] !== undefined)
            .map(([triggerName, message]) => [triggerName, message[locale]]),
    );

    return {
        TriggerDescription: triggerDescription,
    };
}

function validateStateEnglishText(
    errorList: string[],
    actionUuid: string,
    actionManifest: StreamDeckManifestAction,
    actionCatalog: ManifestActionMessages,
): void {
    const manifestNamedStates = actionManifest.States?.filter((state) => state.Name !== undefined) ?? [];
    if (!actionCatalog.states) {
        if (manifestNamedStates.length > 0) {
            errorList.push(`${actionUuid} States contains localizable Name values missing from manifest catalog`);
        }
        return;
    }

    if ((actionManifest.States?.length ?? 0) !== actionCatalog.states.length) {
        errorList.push(`${actionUuid} States length differs from manifest catalog`);
        return;
    }

    actionCatalog.states.forEach((stateCatalog, index) => {
        assertEnglishText(
            errorList,
            `${actionUuid} States[${index}] Name`,
            actionManifest.States?.[index]?.Name,
            stateCatalog.name.en,
        );
    });
}

function validateEncoderEnglishText(
    errorList: string[],
    actionUuid: string,
    actionManifest: StreamDeckManifestAction,
    actionCatalog: ManifestActionMessages,
): void {
    const triggerDescription = actionCatalog.encoder?.triggerDescription;
    const manifestTriggerDescription = actionManifest.Encoder?.TriggerDescription;
    if (!triggerDescription) {
        if (manifestTriggerDescription && Object.keys(manifestTriggerDescription).length > 0) {
            errorList.push(`${actionUuid} Encoder.TriggerDescription is missing from manifest catalog`);
        }
        return;
    }

    for (const triggerName of Object.keys(manifestTriggerDescription ?? {})) {
        if (!triggerDescription[triggerName as StreamDeckEncoderTriggerDescriptionKey]) {
            errorList.push(`${actionUuid} Encoder.TriggerDescription.${triggerName} is missing from manifest catalog`);
        }
    }

    for (const [triggerName, message] of Object.entries(triggerDescription)) {
        assertEnglishText(
            errorList,
            `${actionUuid} Encoder.TriggerDescription.${triggerName}`,
            manifestTriggerDescription?.[triggerName as StreamDeckEncoderTriggerDescriptionKey],
            message.en,
        );
    }
}

function assertEnglishText(
    errorList: string[],
    label: string,
    manifestText: string | undefined,
    catalogText: string,
): void {
    if (manifestText !== catalogText) {
        errorList.push(`${label} English text differs: manifest=${JSON.stringify(manifestText)} catalog=${JSON.stringify(catalogText)}`);
    }
}

function indexManifestActionsByUuid(manifest: StreamDeckLocaleManifestInput): ReadonlyMap<string, StreamDeckManifestAction> {
    return new Map(
        (manifest.Actions ?? [])
            .filter((action): action is StreamDeckManifestAction & { readonly UUID: string } => typeof action.UUID === "string")
            .map((action) => [action.UUID, action]),
    );
}
