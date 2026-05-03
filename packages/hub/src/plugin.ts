import streamDeck from "@elgato/streamdeck";

import { CpuUsage } from "./actions/cpu-usage";
import { NetSpeed } from "./actions/net-speed";
import { GpuUsage, GpuTemp, GpuVram, GpuPower } from "./actions/gpu-usage";
import { RamUsage } from "./actions/ram-usage";
import { Disk } from "./actions/disk";
import { logger } from "./logging/logger";

logger.setLevel(__LOG_LEVEL__);

streamDeck.actions.registerAction(new CpuUsage());
streamDeck.actions.registerAction(new NetSpeed());
streamDeck.actions.registerAction(new RamUsage());
streamDeck.actions.registerAction(new Disk());
streamDeck.actions.registerAction(new GpuUsage());
streamDeck.actions.registerAction(new GpuTemp());
streamDeck.actions.registerAction(new GpuVram());
streamDeck.actions.registerAction(new GpuPower());

// Finally, connect to the Stream Deck.
streamDeck.connect();
