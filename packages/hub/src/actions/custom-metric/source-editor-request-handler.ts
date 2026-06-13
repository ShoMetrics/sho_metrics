import streamDeck, {
    type SendToPluginEvent,
} from "@elgato/streamdeck";
import { formatMetricUnit } from "../../metrics/metric-unit-format";
import {
    NodeCustomHttpFetcher,
    type CustomHttpFetchFailureResult,
    type CustomHttpFetcher,
} from "../../runtime/sources/custom-http/custom-http-fetcher";
import { redactSecretLikeJsonText } from "../../runtime/sources/custom-http/custom-http-redaction";
import {
    readCustomHttpSourceEditorRequest,
    type CustomHttpSourceEditorFetchSampleResult,
    type CustomHttpSourceEditorResponse,
    type CustomHttpSourceEditorTransformResult,
} from "../../runtime/sources/custom-http/custom-http-source-editor-messages";
import { validateCustomHttpMetricTransformOutput } from "../../runtime/sources/custom-http/custom-http-output-schema";
import {
    CustomHttpTransformWorkerPool,
    type CustomHttpTransformRunner,
} from "../../runtime/sources/custom-http/custom-http-transform-worker-pool";
import type { ResolvedSingleCustomHttpRequest } from "../../settings/resolved-settings";

const CUSTOM_METRIC_SAMPLE_PREVIEW_LIMIT_CHARACTERS = 4096;

export interface CustomHttpSourceEditorRequestHandlerDependencies {
    /** Injectable dependency for unit tests; production performs real HTTP sample fetches. */
    readonly fetcher?: CustomHttpFetcher | undefined;
    /** Injectable dependency for unit tests; production runs jq through the worker pool. */
    readonly transformRunner?: CustomHttpTransformRunner | undefined;
    /** Injectable dependency for unit tests; production sends only to the active PI action. */
    readonly sendResponse?: CustomHttpSourceEditorResponseSender | undefined;
}

/**
 * Sends a validated Custom HTTP editor response back through the Stream Deck PI boundary.
 */
export type CustomHttpSourceEditorResponseSender = (
    event: SendToPluginEvent<never, Record<string, never>>,
    response: CustomHttpSourceEditorResponse,
) => Promise<void>;

/**
 * Handles Property Inspector sample-fetch and transform-check requests for Custom HTTP editors.
 */
export class CustomHttpSourceEditorRequestHandler {
    private readonly fetcher: CustomHttpFetcher;
    private readonly transformRunner: CustomHttpTransformRunner;
    private readonly sendResponse: CustomHttpSourceEditorResponseSender;
    private readonly sampleCacheByActionId = new Map<string, Map<string, CachedCustomHttpSample>>();

    constructor(options: CustomHttpSourceEditorRequestHandlerDependencies = {}) {
        this.fetcher = options.fetcher ?? new NodeCustomHttpFetcher();
        this.transformRunner = options.transformRunner ?? new CustomHttpTransformWorkerPool();
        this.sendResponse = options.sendResponse ?? sendCustomHttpSourceEditorResponseToActivePropertyInspector;
    }

    /**
     * Handles a Stream Deck plugin message when it is a Custom HTTP source editor request.
     */
    handle(event: SendToPluginEvent<never, Record<string, never>>): boolean {
        const request = readCustomHttpSourceEditorRequest(event.payload);
        if (request === undefined) {
            return false;
        }

        if (request.command === "fetchSample") {
            void this.fetchSampleForPropertyInspector(
                event.action.id,
                request.consumerSlug,
                request.url,
                request.requestSettings,
            )
                .then(result => this.sendResponse(event, {
                    type: request.type,
                    command: request.command,
                    requestId: request.requestId,
                    result,
                }));
            return true;
        }

        void this.testTransformForPropertyInspector(
            event.action.id,
            request.consumerSlug,
            request.url,
            request.jqTransform,
        )
            .then(result => this.sendResponse(event, {
                type: request.type,
                command: request.command,
                requestId: request.requestId,
                result,
            }));
        return true;
    }

    /**
     * Clears action-local scratch samples when the owning action disappears.
     */
    clearAction(actionId: string): void {
        this.sampleCacheByActionId.delete(actionId);
    }

    private async fetchSampleForPropertyInspector(
        actionId: string,
        consumerSlug: string,
        url: string,
        requestSettings: ResolvedSingleCustomHttpRequest["requestSettings"],
    ): Promise<CustomHttpSourceEditorFetchSampleResult> {
        const startedAtMilliseconds = performance.now();
        const fetchResult = await this.fetcher.fetchJson(url, {
            ...requestSettings,
            includeFailureResponsePreview: true,
        });
        const elapsedMilliseconds = Math.max(0, Math.round(performance.now() - startedAtMilliseconds));
        if (!fetchResult.ok) {
            this.deleteCachedSample(actionId, consumerSlug);
            return {
                ok: false,
                stage: fetchResult.reason,
                detail: buildHttpFetchFailureDetail(fetchResult),
            };
        }

        this.writeCachedSample(actionId, consumerSlug, {
            url,
            responseText: fetchResult.responseText,
        });
        const samplePreview = buildSamplePreview(fetchResult.responseText, CUSTOM_METRIC_SAMPLE_PREVIEW_LIMIT_CHARACTERS);

        return {
            ok: true,
            responseBytes: Buffer.byteLength(fetchResult.responseText, "utf8"),
            elapsedMilliseconds,
            samplePreview: samplePreview.text,
            isSamplePreviewTruncated: samplePreview.isTruncated,
        };
    }

    private async testTransformForPropertyInspector(
        actionId: string,
        consumerSlug: string,
        url: string,
        jqTransform: string,
    ): Promise<CustomHttpSourceEditorTransformResult> {
        const cachedSample = this.sampleCacheByActionId.get(actionId)?.get(consumerSlug);
        if (cachedSample === undefined || cachedSample.url !== url) {
            return {
                ok: false,
                stage: "sample",
                detail: "Fetch a sample for the current URL before testing the transform.",
            };
        }

        let inputJson: unknown;
        try {
            inputJson = JSON.parse(cachedSample.responseText);
        } catch {
            return {
                ok: false,
                stage: "json",
                detail: "HTTP response was not valid JSON.",
            };
        }

        const transformResult = await this.transformRunner.runTransform({ inputJson, jqTransform });
        if (!transformResult.ok) {
            return {
                ok: false,
                stage: transformResult.reason === "jqFailure" ? "jq" : transformResult.reason,
                detail: transformResult.detail,
            };
        }

        const validationResult = validateCustomHttpMetricTransformOutput(transformResult.output);
        if (!validationResult.ok) {
            return {
                ok: false,
                stage: "schema",
                detail: validationResult.reason,
            };
        }

        const output = validationResult.output;
        return {
            ok: true,
            metric: {
                label: output.label,
                value: output.value,
                unitText: output.customUnit ?? formatMetricUnit(output.unit),
                ...(output.maximum === undefined ? {} : { maximum: output.maximum }),
                ...(output.suggestedLucideIconId === undefined ? {} : {
                    suggestedLucideIconId: output.suggestedLucideIconId,
                }),
            },
        };
    }

    private writeCachedSample(actionId: string, consumerSlug: string, sample: CachedCustomHttpSample): void {
        const actionSamples = this.sampleCacheByActionId.get(actionId) ?? new Map<string, CachedCustomHttpSample>();
        actionSamples.set(consumerSlug, sample);
        this.sampleCacheByActionId.set(actionId, actionSamples);
    }

    private deleteCachedSample(actionId: string, consumerSlug: string): void {
        const actionSamples = this.sampleCacheByActionId.get(actionId);
        if (actionSamples === undefined) {
            return;
        }

        actionSamples.delete(consumerSlug);
        if (actionSamples.size === 0) {
            this.sampleCacheByActionId.delete(actionId);
        }
    }
}

interface CachedCustomHttpSample {
    readonly url: string;
    readonly responseText: string;
}

function sendCustomHttpSourceEditorResponseToActivePropertyInspector(
    event: SendToPluginEvent<never, Record<string, never>>,
    response: CustomHttpSourceEditorResponse,
): Promise<void> {
    if (streamDeck.ui.action?.id !== event.action.id) {
        return Promise.resolve();
    }

    return streamDeck.ui.sendToPropertyInspector(
        response as unknown as Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0],
    );
}

function buildHttpFetchFailureDetail(fetchResult: CustomHttpFetchFailureResult): string {
    if (fetchResult.responseTextPreview === undefined) {
        return fetchResult.detail;
    }

    const responsePreview = buildSamplePreview(
        redactSecretLikeJsonText(fetchResult.responseTextPreview),
        CUSTOM_METRIC_SAMPLE_PREVIEW_LIMIT_CHARACTERS,
    );
    const isTruncated = fetchResult.isResponseTextPreviewTruncated === true || responsePreview.isTruncated;

    return [
        fetchResult.detail,
        "",
        `Response body preview${isTruncated ? " (truncated)" : ""}:`,
        responsePreview.text,
    ].join("\n");
}

function buildSamplePreview(value: string, maxCharacters: number): {
    readonly text: string;
    readonly isTruncated: boolean;
} {
    return value.length <= maxCharacters
        ? {
            text: value,
            isTruncated: false,
        }
        : {
            text: `${value.slice(0, maxCharacters)}...`,
            isTruncated: true,
        };
}
