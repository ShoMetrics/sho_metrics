import streamDeck from "@elgato/streamdeck";

import { Cpu } from "./actions/cpu";
import { Network } from "./actions/network";
import { Gpu } from "./actions/gpu";
import { Memory } from "./actions/memory";
import { Disk } from "./actions/disk";
import { CatalogMetric } from "./actions/catalog-metric";
import { DenseMultiMetric } from "./actions/dense-multi-metric";
import { logger } from "./logging/logger";
import { pluginGlobalSettingsStore } from "./settings/global-settings-store";
import { backgroundMetricCollection } from "./runtime/metric-collection/background-metric-collection";
import { updateCommittedColorCompensationProfileFromStoredSettings } from "./color-compensation/runtime-store";

logger.setLevel(__LOG_LEVEL__);
const log = logger.for("Plugin");

pluginGlobalSettingsStore.subscribe(updateCommittedColorCompensationProfileFromStoredSettings);

streamDeck.settings.onDidReceiveGlobalSettings(event => {
    pluginGlobalSettingsStore.update(event.settings);
});

streamDeck.actions.registerAction(new Cpu());
streamDeck.actions.registerAction(new Network());
streamDeck.actions.registerAction(new Memory());
streamDeck.actions.registerAction(new Disk());
streamDeck.actions.registerAction(new Gpu());
streamDeck.actions.registerAction(new CatalogMetric());
streamDeck.actions.registerAction(new DenseMultiMetric());

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
