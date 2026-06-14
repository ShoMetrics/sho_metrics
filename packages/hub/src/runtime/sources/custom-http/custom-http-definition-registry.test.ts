import assert from "node:assert/strict";
import test from "node:test";
import type {
    ResolvedCustomHttpRequestAuth,
    ResolvedCustomHttpRequestSettings,
} from "../../../settings/resolved-settings";
import { CustomHttpDefinitionRegistry } from "./custom-http-definition-registry";
import {
    buildCustomHttpRuntimeIdentity,
    CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
} from "./custom-http-metric-key";

test("CustomHttpDefinitionRegistry registers and explicitly replaces definitions by runtime metric key", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const identity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/first",
        actionId: "action-1",
        consumerSlug: CUSTOM_HTTP_SINGLE_CONSUMER_SLUG,
    });

    registry.register({
        identity,
        request: {
            url: "https://api.example.com/first",
            userIntent: "first",
            jqTransform: ".",
            requestSettings: defaultRequestSettings(),
            auth: defaultRequestAuth(),
        },
    });
    assert.throws(
        () => registry.register({
            identity,
            request: {
                url: "https://api.example.com/duplicate",
                userIntent: "duplicate",
                jqTransform: ".",
                requestSettings: defaultRequestSettings(),
                auth: defaultRequestAuth(),
            },
        }),
        /already registered/,
    );
    registry.replace({
        identity,
        request: {
            url: "https://api.example.com/second",
            userIntent: "second",
            jqTransform: ".metric",
            requestSettings: defaultRequestSettings(),
            auth: defaultRequestAuth(),
        },
    });

    assert.deepEqual(registry.read(identity.metricKey)?.request, {
        url: "https://api.example.com/second",
        userIntent: "second",
        jqTransform: ".metric",
        requestSettings: defaultRequestSettings(),
        auth: defaultRequestAuth(),
    });
    assert.equal(registry.list().length, 1);
});

test("CustomHttpDefinitionRegistry unregisters one definition without touching others", () => {
    const registry = new CustomHttpDefinitionRegistry();
    const firstIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/one",
        actionId: "action-1",
        consumerSlug: "single",
    });
    const secondIdentity = buildCustomHttpRuntimeIdentity({
        url: "https://api.example.com/two",
        actionId: "action-2",
        consumerSlug: "single",
    });

    registry.register({
        identity: firstIdentity,
        request: {
            url: "https://api.example.com/one",
            userIntent: undefined,
            jqTransform: ".",
            requestSettings: defaultRequestSettings(),
            auth: defaultRequestAuth(),
        },
    });
    registry.register({
        identity: secondIdentity,
        request: {
            url: "https://api.example.com/two",
            userIntent: undefined,
            jqTransform: ".",
            requestSettings: defaultRequestSettings(),
            auth: defaultRequestAuth(),
        },
    });
    registry.unregister(firstIdentity.metricKey);

    assert.equal(registry.read(firstIdentity.metricKey), undefined);
    assert.equal(registry.read(secondIdentity.metricKey)?.identity.metricKey, secondIdentity.metricKey);
});

function defaultRequestSettings(): ResolvedCustomHttpRequestSettings {
    return { timeoutSeconds: 5, retryCount: 0 };
}

function defaultRequestAuth(): ResolvedCustomHttpRequestAuth {
    return { credentialId: undefined, allowPublicHttpCredentials: false };
}
