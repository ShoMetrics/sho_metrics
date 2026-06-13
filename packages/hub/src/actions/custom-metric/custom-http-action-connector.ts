import type { SendToPluginEvent } from "@elgato/streamdeck";
import {
    customHttpDefinitionRegistry,
    type CustomHttpDefinitionRegistry,
    type CustomHttpMetricDefinition,
} from "../../runtime/sources/custom-http/custom-http-definition-registry";
import type { CustomHttpFetcher } from "../../runtime/sources/custom-http/custom-http-fetcher";
import type { CustomHttpTransformRunner } from "../../runtime/sources/custom-http/custom-http-transform-worker-pool";
import {
    type RegisteredCustomHttpMetricKeysByActionId,
    syncCustomHttpRuntimeDefinitionsForAction,
    unregisterCustomHttpRuntimeDefinitionsForAction,
} from "./runtime-source-registration";
import {
    CustomHttpSourceEditorRequestHandler,
    type CustomHttpSourceEditorResponseSender,
} from "./source-editor-request-handler";

export interface CustomHttpActionConnectorDependencies {
    /** Injectable dependency for unit tests; production uses the shared Custom HTTP registry. */
    readonly customHttpDefinitionRegistry?: CustomHttpDefinitionRegistry | undefined;
    /** Injectable dependency for unit tests; production performs real HTTP sample fetches. */
    readonly fetcher?: CustomHttpFetcher | undefined;
    /** Injectable dependency for unit tests; production runs jq through the worker pool. */
    readonly transformRunner?: CustomHttpTransformRunner | undefined;
    /** Injectable dependency for unit tests; production sends only to the active Stream Deck PI. */
    readonly sendCustomHttpSourceEditorResponse?: CustomHttpSourceEditorResponseSender | undefined;
}

/**
 * Owns the Custom HTTP lifecycle wiring that every action host must perform.
 */
export class CustomHttpActionConnector {
    private readonly customHttpDefinitionRegistry: CustomHttpDefinitionRegistry;
    private readonly sourceEditorRequestHandler: CustomHttpSourceEditorRequestHandler;
    private readonly registeredMetricKeysByActionId: RegisteredCustomHttpMetricKeysByActionId = new Map();

    constructor(options: CustomHttpActionConnectorDependencies = {}) {
        this.customHttpDefinitionRegistry = options.customHttpDefinitionRegistry ?? customHttpDefinitionRegistry;
        this.sourceEditorRequestHandler = new CustomHttpSourceEditorRequestHandler({
            fetcher: options.fetcher,
            transformRunner: options.transformRunner,
            sendResponse: options.sendCustomHttpSourceEditorResponse,
        });
    }

    /**
     * Reconciles the runtime registry entries owned by one Stream Deck action.
     */
    syncActionDefinitions(actionId: string, definitions: readonly CustomHttpMetricDefinition[]): void {
        syncCustomHttpRuntimeDefinitionsForAction({
            customHttpDefinitionRegistry: this.customHttpDefinitionRegistry,
            registeredMetricKeysByActionId: this.registeredMetricKeysByActionId,
            actionId,
            definitions,
        });
    }

    /**
     * Removes runtime definitions and editor scratch data for a disappearing action.
     */
    clearAction(actionId: string): void {
        unregisterCustomHttpRuntimeDefinitionsForAction({
            customHttpDefinitionRegistry: this.customHttpDefinitionRegistry,
            registeredMetricKeysByActionId: this.registeredMetricKeysByActionId,
            actionId,
        });
        this.sourceEditorRequestHandler.clearAction(actionId);
    }

    /**
     * Handles Property Inspector source-editor messages when they target Custom HTTP.
     */
    handleSendToPlugin(event: SendToPluginEvent<never, Record<string, never>>): boolean {
        return this.sourceEditorRequestHandler.handle(event);
    }

}
