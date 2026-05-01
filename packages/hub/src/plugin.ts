import streamDeck from "@elgato/streamdeck";

import { IncrementCounter } from "./actions/increment-counter";
import { CpuUsage } from "./actions/cpu-usage";
import { NetSpeed } from "./actions/net-speed";
import { GpuUsage, GpuTemp, GpuVram, GpuPower } from "./actions/gpu-usage";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel("debug");

// Register the increment action.
streamDeck.actions.registerAction(new IncrementCounter());
streamDeck.actions.registerAction(new CpuUsage());
streamDeck.actions.registerAction(new NetSpeed());
streamDeck.actions.registerAction(new GpuUsage());
streamDeck.actions.registerAction(new GpuTemp());
streamDeck.actions.registerAction(new GpuVram());
streamDeck.actions.registerAction(new GpuPower());

// Finally, connect to the Stream Deck.
streamDeck.connect();
