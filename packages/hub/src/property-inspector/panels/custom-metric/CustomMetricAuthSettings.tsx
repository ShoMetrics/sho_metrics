import { createElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, type IconNode } from "lucide";
import { customMetricMessages } from "../../../i18n/message-groups/widgets";
import { useI18n } from "../../../i18n/react";
import { isCustomHttpLocalOrPrivateUrl } from "../../../runtime/sources/custom-http/custom-http-url";
import { wallClockNowMilliseconds } from "../../../shared/clock";
import type {
    ResolvedCustomHttpCredentialAuthKind,
    ResolvedCustomHttpCredentialSummary,
    ResolvedCustomHttpRequestAuth,
} from "../../../settings/resolved-settings";
import type { StoredCustomHttpCredentialInput } from "../../../settings/storage/global-settings-patch";
import type { SelectOption } from "../../inspector/types";
import { InspectorItem } from "../../components/InspectorItem";
import { SelectSetting } from "../../controls/SelectSetting";
import { TextSetting } from "../../controls/TextSetting";
import { SettingsSection } from "../SettingsSection";
import type { WidgetSettingsPanelProps } from "../panel-props";

const NO_CREDENTIAL_OPTION = "";
const EDITING_NEW_CREDENTIAL_OPTION = "__editing_new_custom_http_credential__";

type CredentialEditorMode =
    | { readonly case: "viewing" }
    | { readonly case: "creating"; readonly form: CredentialFormState }
    | { readonly case: "editing"; readonly form: CredentialFormState }
    | { readonly case: "confirmingDelete" };

interface CredentialFormState {
    readonly id: string;
    readonly authKind: ResolvedCustomHttpCredentialAuthKind;
    readonly nickname: string;
    readonly username: string;
    readonly password: string;
    readonly token: string;
    readonly headerName: string;
    readonly queryParameterName: string;
    readonly createdAtMilliseconds: number | undefined;
}

interface CustomMetricAuthSettingsProps {
    readonly normalizedUrl: string;
    readonly auth: ResolvedCustomHttpRequestAuth;
    readonly credentials: readonly ResolvedCustomHttpCredentialSummary[];
    readonly onSettingsPatch: WidgetSettingsPanelProps["onSettingsPatch"];
    readonly onCustomHttpCredentialUpsert: WidgetSettingsPanelProps["onCustomHttpCredentialUpsert"];
    readonly onCustomHttpCredentialDelete: WidgetSettingsPanelProps["onCustomHttpCredentialDelete"];
}

export function CustomMetricAuthSettings({
    normalizedUrl,
    auth,
    credentials,
    onSettingsPatch,
    onCustomHttpCredentialUpsert,
    onCustomHttpCredentialDelete,
}: CustomMetricAuthSettingsProps): React.JSX.Element {
    const { locale, t } = useI18n();
    const credentialSelectWrapperRef = useRef<HTMLDivElement>(null);
    const [editorMode, setEditorMode] = useState<CredentialEditorMode>({ case: "viewing" });
    const sortedCredentials = useMemo(() => [...credentials].sort(compareCredentialSummary), [credentials]);
    const selectedCredential = sortedCredentials.find((credential) => credential.id === auth.credentialId);
    const isCreatingCredential = editorMode.case === "creating";
    const isSelectedCredentialMissing = auth.credentialId !== undefined && selectedCredential === undefined;
    const credentialOptionList = useMemo(
        () => buildCredentialOptionList({
            credentials: sortedCredentials,
            isEditingNewCredential: isCreatingCredential,
            missingCredentialId: isSelectedCredentialMissing ? auth.credentialId : undefined,
            t,
        }),
        [auth.credentialId, isCreatingCredential, isSelectedCredentialMissing, sortedCredentials, t],
    );
    const credentialSelectValue = isCreatingCredential
        ? EDITING_NEW_CREDENTIAL_OPTION
        : auth.credentialId ?? NO_CREDENTIAL_OPTION;
    const shouldShowCredentialStorageNote = selectedCredential !== undefined
        || editorMode.case === "creating"
        || editorMode.case === "editing";

    useEffect(() => {
        setEditorMode({ case: "viewing" });
    }, [auth.credentialId]);

    return (
        <SettingsSection title={t(customMetricMessages.authenticationSection)}>
            <div ref={credentialSelectWrapperRef}>
                <SelectSetting
                    label={t(customMetricMessages.credentialLabel)}
                    value={credentialSelectValue}
                    optionList={credentialOptionList}
                    onValueChange={(credentialId) => {
                        setEditorMode({ case: "viewing" });
                        onSettingsPatch({
                            customMetric: {
                                credentialId: credentialId === NO_CREDENTIAL_OPTION ? undefined : credentialId,
                                allowPublicHttpCredentials: false,
                            },
                        });
                    }}
                />
            </div>
            {shouldShowCredentialStorageNote && <CaptionNote text={t(customMetricMessages.credentialSecretStorageNote)} />}
            {isSelectedCredentialMissing && (
                <CaptionNote text={t(customMetricMessages.credentialMissingNote)} />
            )}
            <PublicHttpCredentialConsent
                normalizedUrl={normalizedUrl}
                hasCredential={!isCreatingCredential && auth.credentialId !== undefined}
                allowPublicHttpCredentials={auth.allowPublicHttpCredentials}
                onAllowPublicHttpCredentialsChange={(allowPublicHttpCredentials) => onSettingsPatch({
                    customMetric: { allowPublicHttpCredentials },
                })}
            />
            <QueryParameterCollisionWarning
                normalizedUrl={normalizedUrl}
                selectedCredential={isCreatingCredential ? undefined : selectedCredential}
            />
            {editorMode.case === "viewing" && (
                <CredentialView
                    credential={selectedCredential}
                    locale={locale}
                    onAdd={() => {
                        setEditorMode({ case: "creating", form: createCredentialFormState() });
                    }}
                    onEdit={selectedCredential === undefined
                        ? undefined
                        : () => {
                            setEditorMode({
                                case: "editing",
                                form: createCredentialEditFormState(selectedCredential),
                            });
                            scrollCredentialSelectIntoView(credentialSelectWrapperRef.current);
                        }}
                    onDelete={selectedCredential !== undefined && onCustomHttpCredentialDelete !== undefined
                        ? () => {
                            setEditorMode({ case: "confirmingDelete" });
                            scrollCredentialSelectIntoView(credentialSelectWrapperRef.current);
                        }
                        : undefined}
                    canAdd={onCustomHttpCredentialUpsert !== undefined}
                />
            )}
            {(editorMode.case === "creating" || editorMode.case === "editing") && (
                <CredentialForm
                    form={editorMode.form}
                    savedCredential={editorMode.case === "editing" ? selectedCredential : undefined}
                    onFormChange={(form) => setEditorMode({ ...editorMode, form })}
                    onCancel={() => {
                        setEditorMode({ case: "viewing" });
                        scrollCredentialSelectIntoView(credentialSelectWrapperRef.current);
                    }}
                    onSave={(credential) => {
                        onCustomHttpCredentialUpsert?.(credential);
                        onSettingsPatch({
                            customMetric: {
                                credentialId: credential.id,
                                allowPublicHttpCredentials: false,
                            },
                        });
                        setEditorMode({ case: "viewing" });
                        scrollCredentialSelectIntoView(credentialSelectWrapperRef.current);
                    }}
                    onDelete={editorMode.case === "editing" && selectedCredential !== undefined && onCustomHttpCredentialDelete !== undefined
                        ? () => {
                            setEditorMode({ case: "confirmingDelete" });
                            scrollCredentialSelectIntoView(credentialSelectWrapperRef.current);
                        }
                        : undefined}
                />
            )}
            {editorMode.case === "confirmingDelete" && selectedCredential !== undefined && (
                <DeleteCredentialConfirmation
                    credential={selectedCredential}
                    onCancel={() => setEditorMode({ case: "viewing" })}
                    onDelete={() => {
                        onCustomHttpCredentialDelete?.(selectedCredential.id);
                        onSettingsPatch({
                            customMetric: {
                                credentialId: undefined,
                                allowPublicHttpCredentials: false,
                            },
                        });
                        setEditorMode({ case: "viewing" });
                    }}
                />
            )}
        </SettingsSection>
    );
}

function CredentialView({
    credential,
    locale,
    canAdd,
    onAdd,
    onEdit,
    onDelete,
}: {
    readonly credential: ResolvedCustomHttpCredentialSummary | undefined;
    readonly locale: string;
    readonly canAdd: boolean;
    readonly onAdd: () => void;
    readonly onEdit: (() => void) | undefined;
    readonly onDelete: (() => void) | undefined;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <>
            {credential !== undefined && (
                <InspectorItem label={t(customMetricMessages.credentialDatesLabel)}>
                    <ReadonlyText text={formatCredentialDates(credential, locale, t)} />
                </InspectorItem>
            )}
            <InspectorItem>
                <div className="advanced-action-stack">
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={!canAdd}
                        onClick={onAdd}
                    >
                        {t(customMetricMessages.addCredentialButton)}
                    </button>
                    {onEdit !== undefined && (
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={onEdit}
                        >
                            {t(customMetricMessages.editCredentialButton)}
                        </button>
                    )}
                    {onDelete !== undefined && (
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={onDelete}
                        >
                            {t(customMetricMessages.deleteCredentialButton)}
                        </button>
                    )}
                </div>
            </InspectorItem>
        </>
    );
}

export function canUseCustomHttpCredentialForUrl(
    auth: ResolvedCustomHttpRequestAuth,
    normalizedUrl: string,
): boolean {
    if (auth.credentialId === undefined) {
        return true;
    }

    const urlKind = readUrlCredentialTransportKind(normalizedUrl);
    return urlKind === "https"
        || urlKind === "localHttp"
        || (urlKind === "publicHttp" && auth.allowPublicHttpCredentials);
}

function CredentialForm({
    form,
    savedCredential,
    onFormChange,
    onCancel,
    onSave,
    onDelete,
}: {
    readonly form: CredentialFormState;
    readonly savedCredential: ResolvedCustomHttpCredentialSummary | undefined;
    readonly onFormChange: (form: CredentialFormState) => void;
    readonly onCancel: () => void;
    readonly onSave: (credential: StoredCustomHttpCredentialInput) => void;
    readonly onDelete: (() => void) | undefined;
}): React.JSX.Element {
    const { t } = useI18n();
    const validationMessage = readCredentialFormValidationMessage(form, savedCredential !== undefined, t);
    const authKindOptionList = buildAuthKindOptionList(t);

    return (
        <>
            <TextSetting
                label={t(customMetricMessages.credentialNicknameLabel)}
                value={form.nickname}
                placeholder={t(customMetricMessages.credentialNicknamePlaceholder)}
                validationMessage={form.nickname.trim().length === 0
                    ? t(customMetricMessages.credentialNicknameRequired)
                    : undefined}
                onValueChange={(nickname) => onFormChange({ ...form, nickname })}
            />
            <SelectSetting
                label={t(customMetricMessages.credentialTypeLabel)}
                value={form.authKind}
                optionList={authKindOptionList}
                onValueChange={(authKind) => onFormChange({ ...form, authKind })}
            />
            <CredentialFormFields
                form={form}
                canPreserveStoredSecret={savedCredential !== undefined}
                onFormChange={onFormChange}
            />
            <InspectorItem>
                <div className="advanced-action-stack">
                    <button
                        className="inline-action-button"
                        type="button"
                        disabled={validationMessage !== undefined}
                        onClick={() => onSave(buildCredentialInput(form, savedCredential !== undefined))}
                    >
                        {t(customMetricMessages.saveCredentialButton)}
                    </button>
                    <button
                        className="inline-action-button"
                        type="button"
                        onClick={onCancel}
                    >
                        {t(customMetricMessages.cancelCredentialButton)}
                    </button>
                    {onDelete !== undefined && (
                        <button
                            className="inline-action-button"
                            type="button"
                            onClick={onDelete}
                        >
                            {t(customMetricMessages.deleteCredentialButton)}
                        </button>
                    )}
                    {validationMessage && <p className="section-note">{validationMessage}</p>}
                </div>
            </InspectorItem>
        </>
    );
}

function CredentialFormFields({
    form,
    canPreserveStoredSecret,
    onFormChange,
}: {
    readonly form: CredentialFormState;
    readonly canPreserveStoredSecret: boolean;
    readonly onFormChange: (form: CredentialFormState) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const secretPlaceholder = canPreserveStoredSecret
        ? t(customMetricMessages.credentialSecretPreservePlaceholder)
        : undefined;

    let credentialKindFields: React.JSX.Element;
    switch (form.authKind) {
        case "basic":
            credentialKindFields = (
                <>
                    <TextSetting
                        label={t(customMetricMessages.credentialUsernameLabel)}
                        value={form.username}
                        onValueChange={(username) => onFormChange({ ...form, username })}
                    />
                    <SecretTextSetting
                        label={t(customMetricMessages.credentialPasswordLabel)}
                        value={form.password}
                        placeholder={secretPlaceholder}
                        onValueChange={(password) => onFormChange({ ...form, password })}
                    />
                </>
            );
            break;
        case "bearer":
            credentialKindFields = (
                <>
                    <SecretTextSetting
                        label={t(customMetricMessages.credentialTokenLabel)}
                        value={form.token}
                        placeholder={secretPlaceholder}
                        onValueChange={(token) => onFormChange({ ...form, token })}
                    />
                </>
            );
            break;
        case "header":
            credentialKindFields = (
                <>
                    <TextSetting
                        label={t(customMetricMessages.credentialHeaderNameLabel)}
                        value={form.headerName}
                        placeholder="X-API-Key"
                        onValueChange={(headerName) => onFormChange({ ...form, headerName })}
                    />
                    <SecretTextSetting
                        label={t(customMetricMessages.credentialTokenLabel)}
                        value={form.token}
                        placeholder={secretPlaceholder}
                        onValueChange={(token) => onFormChange({ ...form, token })}
                    />
                </>
            );
            break;
        case "query":
            credentialKindFields = (
                <>
                    <TextSetting
                        label={t(customMetricMessages.credentialQueryParameterLabel)}
                        value={form.queryParameterName}
                        placeholder="api_key"
                        onValueChange={(queryParameterName) => onFormChange({ ...form, queryParameterName })}
                    />
                    <SecretTextSetting
                        label={t(customMetricMessages.credentialTokenLabel)}
                        value={form.token}
                        placeholder={secretPlaceholder}
                        onValueChange={(token) => onFormChange({ ...form, token })}
                    />
                </>
            );
            break;
    }

    return (
        <>
            {credentialKindFields}
            <SecretPreserveNote isVisible={canPreserveStoredSecret} />
        </>
    );
}

function SecretTextSetting({
    label,
    value,
    placeholder,
    onValueChange,
}: {
    readonly label: string;
    readonly value: string;
    readonly placeholder: string | undefined;
    readonly onValueChange: (value: string) => void;
}): React.JSX.Element {
    const { t } = useI18n();
    const inputId = useId();
    const [isSecretVisible, setIsSecretVisible] = useState(false);
    const revealMessage = isSecretVisible
        ? customMetricMessages.hideCredentialSecretButton
        : customMetricMessages.showCredentialSecretButton;
    const hideSecret = () => setIsSecretVisible(false);
    const hasEnteredSecret = value.length > 0;

    return (
        <InspectorItem label={label} labelFor={inputId}>
            <div className="text-field">
                <div className="secret-input-wrapper">
                    <input
                        id={inputId}
                        className={`native-input${hasEnteredSecret ? " secret-input-with-action" : ""}`}
                        type={isSecretVisible ? "text" : "password"}
                        placeholder={placeholder ?? ""}
                        value={value}
                        onChange={(event) => onValueChange(event.currentTarget.value)}
                    />
                    {hasEnteredSecret && (
                        <button
                            className="secret-reveal-button"
                            type="button"
                            title={t(revealMessage)}
                            aria-label={t(revealMessage)}
                            onPointerDown={() => setIsSecretVisible(true)}
                            onPointerUp={hideSecret}
                            onPointerCancel={hideSecret}
                            onPointerLeave={hideSecret}
                            onBlur={hideSecret}
                            onKeyDown={(event) => {
                                if (event.key === " " || event.key === "Enter") {
                                    setIsSecretVisible(true);
                                }
                            }}
                            onKeyUp={hideSecret}
                        >
                            <LucideIcon iconNode={isSecretVisible ? EyeOff : Eye} />
                        </button>
                    )}
                </div>
            </div>
        </InspectorItem>
    );
}

function LucideIcon({ iconNode }: { readonly iconNode: IconNode }): React.JSX.Element {
    return (
        <svg
            aria-hidden="true"
            className="secret-reveal-icon"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="16"
        >
            {iconNode.map(([tagName, attributes], index) => createElement(tagName, {
                ...attributes,
                key: index,
            }))}
        </svg>
    );
}

function SecretPreserveNote({ isVisible }: { readonly isVisible: boolean }): React.JSX.Element | null {
    const { t } = useI18n();
    return isVisible
        ? <CaptionNote text={t(customMetricMessages.credentialSecretPreserveNote)} />
        : null;
}

function DeleteCredentialConfirmation({
    credential,
    onCancel,
    onDelete,
}: {
    readonly credential: ResolvedCustomHttpCredentialSummary;
    readonly onCancel: () => void;
    readonly onDelete: () => void;
}): React.JSX.Element {
    const { t } = useI18n();

    return (
        <>
            <CaptionNote text={t(customMetricMessages.deleteCredentialWarning, {
                nickname: credential.nickname,
            })} />
            <InspectorItem>
                <div className="advanced-action-stack">
                    <button
                        className="inline-action-button"
                        type="button"
                        onClick={onDelete}
                    >
                        {t(customMetricMessages.confirmDeleteCredentialButton)}
                    </button>
                    <button
                        className="inline-action-button"
                        type="button"
                        onClick={onCancel}
                    >
                        {t(customMetricMessages.cancelCredentialButton)}
                    </button>
                </div>
            </InspectorItem>
        </>
    );
}

function PublicHttpCredentialConsent({
    normalizedUrl,
    hasCredential,
    allowPublicHttpCredentials,
    onAllowPublicHttpCredentialsChange,
}: {
    readonly normalizedUrl: string;
    readonly hasCredential: boolean;
    readonly allowPublicHttpCredentials: boolean;
    readonly onAllowPublicHttpCredentialsChange: (allowPublicHttpCredentials: boolean) => void;
}): React.JSX.Element | null {
    const { t } = useI18n();
    if (!hasCredential) {
        return null;
    }

    const urlKind = readUrlCredentialTransportKind(normalizedUrl);
    if (urlKind === "https" || urlKind === "invalid") {
        return null;
    }

    if (urlKind === "localHttp") {
        return null;
    }

    return (
        <InspectorItem label={t(customMetricMessages.publicHttpCredentialConsentLabel)}>
            <div className="advanced-action-stack">
                <label className="native-checkbox-row custom-http-public-consent-checkbox">
                    <input
                        type="checkbox"
                        checked={allowPublicHttpCredentials}
                        onChange={(event) => onAllowPublicHttpCredentialsChange(event.currentTarget.checked)}
                    />
                    <span>{t(customMetricMessages.publicHttpCredentialConsentCheckbox)}</span>
                </label>
                <p className="section-note">{t(customMetricMessages.publicHttpCredentialWarning)}</p>
            </div>
        </InspectorItem>
    );
}

function QueryParameterCollisionWarning({
    normalizedUrl,
    selectedCredential,
}: {
    readonly normalizedUrl: string;
    readonly selectedCredential: ResolvedCustomHttpCredentialSummary | undefined;
}): React.JSX.Element | null {
    const { t } = useI18n();
    if (selectedCredential?.authKind !== "query" || selectedCredential.authContext.length === 0) {
        return null;
    }

    if (!urlHasQueryParameter(normalizedUrl, selectedCredential.authContext)) {
        return null;
    }

    return (
        <CaptionNote text={t(customMetricMessages.queryCredentialCollisionWarning, {
            parameterName: selectedCredential.authContext,
        })} />
    );
}

function CaptionNote({ text }: { readonly text: string }): React.JSX.Element {
    return (
        <InspectorItem className="note-item note-item-caption">
            <p className="section-note">{text}</p>
        </InspectorItem>
    );
}

function ReadonlyText({ text }: { readonly text: string }): React.JSX.Element {
    return (
        <div className="readonly-inline">
            <span className="readonly-text">{text}</span>
        </div>
    );
}

function buildCredentialOptionList(options: {
    readonly credentials: readonly ResolvedCustomHttpCredentialSummary[];
    readonly isEditingNewCredential: boolean;
    readonly missingCredentialId: string | undefined;
    readonly t: ReturnType<typeof useI18n>["t"];
}): readonly SelectOption<string>[] {
    return [
        ...(options.isEditingNewCredential
            ? [{
                value: EDITING_NEW_CREDENTIAL_OPTION,
                label: options.t(customMetricMessages.editingNewCredentialOption),
                disabled: true,
            }]
            : []),
        { value: NO_CREDENTIAL_OPTION, label: options.t(customMetricMessages.noCredentialOption) },
        ...(options.missingCredentialId === undefined
            ? []
            : [{
                value: options.missingCredentialId,
                label: options.t(customMetricMessages.missingCredentialOption),
                disabled: true,
            }]),
        ...options.credentials.map((credential) => ({
            value: credential.id,
            label: formatCredentialOptionLabel(credential, options.t),
        })),
    ];
}

function buildAuthKindOptionList(
    t: ReturnType<typeof useI18n>["t"],
): readonly SelectOption<ResolvedCustomHttpCredentialAuthKind>[] {
    const authKindList: readonly ResolvedCustomHttpCredentialAuthKind[] = ["basic", "bearer", "header", "query"];
    return authKindList.map((authKind) => ({
        value: authKind,
        label: t(readAuthKindMessage(authKind)),
    }));
}

function formatCredentialOptionLabel(
    credential: ResolvedCustomHttpCredentialSummary,
    t: ReturnType<typeof useI18n>["t"],
): string {
    const context = credential.authContext.length === 0 ? "" : ` ${credential.authContext}`;
    return `${credential.nickname}: [${t(readAuthKindMessage(credential.authKind))}]${context}`;
}

function readAuthKindMessage(authKind: ResolvedCustomHttpCredentialAuthKind) {
    switch (authKind) {
        case "basic":
            return customMetricMessages.credentialTypeBasic;
        case "bearer":
            return customMetricMessages.credentialTypeBearer;
        case "header":
            return customMetricMessages.credentialTypeHeader;
        case "query":
            return customMetricMessages.credentialTypeQuery;
    }
}

function compareCredentialSummary(
    left: ResolvedCustomHttpCredentialSummary,
    right: ResolvedCustomHttpCredentialSummary,
): number {
    return left.authKind.localeCompare(right.authKind)
        || left.nickname.localeCompare(right.nickname)
        || left.id.localeCompare(right.id);
}

function createCredentialFormState(): CredentialFormState {
    return {
        id: createCustomHttpCredentialId(),
        authKind: "basic",
        nickname: "",
        username: "",
        password: "",
        token: "",
        headerName: "",
        queryParameterName: "",
        createdAtMilliseconds: undefined,
    };
}

function createCredentialEditFormState(credential: ResolvedCustomHttpCredentialSummary): CredentialFormState {
    return {
        id: credential.id,
        authKind: credential.authKind,
        nickname: credential.nickname,
        username: credential.authKind === "basic" ? credential.authContext : "",
        password: "",
        token: "",
        headerName: credential.authKind === "header" ? credential.authContext : "",
        queryParameterName: credential.authKind === "query" ? credential.authContext : "",
        createdAtMilliseconds: credential.createdAtMilliseconds,
    };
}

function buildCredentialInput(
    form: CredentialFormState,
    canPreserveStoredSecret: boolean,
): StoredCustomHttpCredentialInput {
    const now = wallClockNowMilliseconds();
    const createdAtMilliseconds = form.createdAtMilliseconds ?? now;
    const base = {
        id: form.id,
        nickname: form.nickname.trim(),
        createdAtMilliseconds,
        updatedAtMilliseconds: now,
    };

    switch (form.authKind) {
        case "basic":
            return {
                ...base,
                authKind: "basic",
                username: form.username.trim(),
                password: form.password.length === 0 && canPreserveStoredSecret ? undefined : form.password,
            };
        case "bearer":
            return {
                ...base,
                authKind: "bearer",
                token: form.token.length === 0 && canPreserveStoredSecret ? undefined : form.token,
            };
        case "header":
            return {
                ...base,
                authKind: "header",
                headerName: form.headerName.trim(),
                token: form.token.length === 0 && canPreserveStoredSecret ? undefined : form.token,
            };
        case "query":
            return {
                ...base,
                authKind: "query",
                queryParameterName: form.queryParameterName.trim(),
                token: form.token.length === 0 && canPreserveStoredSecret ? undefined : form.token,
            };
    }
}

function readCredentialFormValidationMessage(
    form: CredentialFormState,
    canPreserveStoredSecret: boolean,
    t: ReturnType<typeof useI18n>["t"],
): string | undefined {
    if (form.nickname.trim().length === 0) {
        return t(customMetricMessages.credentialNicknameRequired);
    }

    switch (form.authKind) {
        case "basic":
            return form.username.trim().length === 0 || (!canPreserveStoredSecret && form.password.length === 0)
                ? t(customMetricMessages.credentialBasicRequired)
                : undefined;
        case "bearer":
            return !canPreserveStoredSecret && form.token.length === 0
                ? t(customMetricMessages.credentialTokenRequired)
                : undefined;
        case "header":
            return form.headerName.trim().length === 0 || (!canPreserveStoredSecret && form.token.length === 0)
                ? t(customMetricMessages.credentialHeaderRequired)
                : undefined;
        case "query":
            return form.queryParameterName.trim().length === 0 || (!canPreserveStoredSecret && form.token.length === 0)
                ? t(customMetricMessages.credentialQueryRequired)
                : undefined;
    }
}

function scrollCredentialSelectIntoView(element: HTMLDivElement | null): void {
    requestAnimationFrame(() => element?.scrollIntoView({ block: "start" }));
}

function createCustomHttpCredentialId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `custom-http-credential-${wallClockNowMilliseconds()}-${Math.random()}`;
}

function formatCredentialDates(
    credential: ResolvedCustomHttpCredentialSummary,
    locale: string,
    t: ReturnType<typeof useI18n>["t"],
): string {
    const created = formatOptionalDate(credential.createdAtMilliseconds, locale);
    const updated = formatOptionalDate(credential.updatedAtMilliseconds, locale);
    if (created === undefined && updated === undefined) {
        return t(customMetricMessages.credentialDateUnknown);
    }

    return t(customMetricMessages.credentialDateSummary, {
        created: created ?? t(customMetricMessages.credentialDateUnknown),
        updated: updated ?? t(customMetricMessages.credentialDateUnknown),
    });
}

function formatOptionalDate(timestampMilliseconds: number | undefined, locale: string): string | undefined {
    return timestampMilliseconds === undefined
        ? undefined
        : new Intl.DateTimeFormat(readIntlLocale(locale), {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(timestampMilliseconds));
}

function readIntlLocale(locale: string): string {
    return locale === "zh_CN" ? "zh-CN" : locale;
}

type UrlCredentialTransportKind = "https" | "localHttp" | "publicHttp" | "invalid";

function readUrlCredentialTransportKind(normalizedUrl: string): UrlCredentialTransportKind {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(normalizedUrl);
    } catch {
        return "invalid";
    }

    if (parsedUrl.protocol === "https:") {
        return "https";
    }

    if (parsedUrl.protocol !== "http:") {
        return "invalid";
    }

    return isCustomHttpLocalOrPrivateUrl(parsedUrl) ? "localHttp" : "publicHttp";
}

function urlHasQueryParameter(normalizedUrl: string, parameterName: string): boolean {
    try {
        return new URL(normalizedUrl).searchParams.has(parameterName);
    } catch {
        return false;
    }
}
