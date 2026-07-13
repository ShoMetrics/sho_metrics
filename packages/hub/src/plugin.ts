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
import { logger } from "./logging/node-logger";
import { pluginGlobalSettingsStore } from "./settings/global-settings-store";
import { backgroundMetricCollection } from "./runtime/metric-collection/background-metric-collection";
import { helperUpdateNotifier } from "./runtime/helper-update/helper-update-notifier";
import { sendHelperUpdateNoticeResultMessage } from "./property-inspector/helper-update-notice-messages";
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

// The Helper is a Windows product, and createDefaultSourceRegistry registers its
// source client on no other platform. Started anywhere else the notifier would
// wait forever for a version that nothing can ever report, so it is not started:
// an update check for something that cannot be installed has no answer to give.
if (process.platform === "win32") {
    // A check that resolves after the panel is already open still has to reach
    // it, so the notifier pushes as well as caches. An open panel asks for the
    // cached notice itself, and Stream Deck drops this send when no panel is open.
    helperUpdateNotifier.subscribe(notice => {
        sendHelperUpdateNoticeResultMessage(streamDeck.ui, notice).catch(error => {
            log.info(() => `Failed to push the Helper update notice: ${String(error)}`);
        });
    });
    helperUpdateNotifier.start();
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
    helperUpdateNotifier.dispose();
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
