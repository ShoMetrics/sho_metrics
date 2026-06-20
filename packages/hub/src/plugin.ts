import streamDeck from "@elgato/streamdeck";

import { Cpu } from "./actions/cpu";
import { Network } from "./actions/network";
import { Gpu } from "./actions/gpu";
import { Memory } from "./actions/memory";
import { Disk } from "./actions/disk";
import { System } from "./actions/system";
import { CatalogMetric } from "./actions/catalog-metric";
import { CustomMetric } from "./actions/custom-metric";
import { DenseMultiMetric } from "./actions/dense-multi-metric";
import { StackedMetric } from "./actions/stacked-metric";
import { logger } from "./logging/logger";
import { pluginGlobalSettingsStore } from "./settings/global-settings-store";
import { backgroundMetricCollection } from "./runtime/metric-collection/background-metric-collection";
import { updateCommittedColorCompensationProfileFromStoredSettings } from "./color-compensation/runtime-store";
import { STREAM_DECK_PLUGIN_UUID } from "./shared/stream-deck-actions";

logger.setLevel(__LOG_LEVEL__);
const log = logger.for("Plugin");
const registeredActions = [
    new Cpu(),
    new Network(),
    new Memory(),
    new Disk(),
    new Gpu(),
    new System(),
    new CatalogMetric(),
    new CustomMetric(),
    new DenseMultiMetric(),
    new StackedMetric(),
];

pluginGlobalSettingsStore.subscribe(updateCommittedColorCompensationProfileFromStoredSettings);

streamDeck.settings.onDidReceiveGlobalSettings(event => {
    pluginGlobalSettingsStore.update(event.settings);
});

for (const action of registeredActions) {
    streamDeck.actions.registerAction(action);
}

log.info(() => [
    "pluginStarted",
    `pluginUuid=${STREAM_DECK_PLUGIN_UUID}`,
    `buildMode=${__BUILD_MODE__}`,
    `logLevel=${__LOG_LEVEL__}`,
    `platform=${process.platform}`,
    `nodeVersion=${process.version}`,
    `registeredActionCount=${registeredActions.length}`,
].join(" "));

process.once("exit", () => {
    backgroundMetricCollection.dispose();
});

streamDeck.connect()
    .then(() => streamDeck.settings.getGlobalSettings())
    .then(settings => {
        pluginGlobalSettingsStore.update(settings);
    })
    .catch(error => {
        log.warn("Failed to connect or load global settings", error);
    });
