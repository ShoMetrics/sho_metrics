Learn more about changes related to building Stream Deck plugins using the Web Socket API.

## Stream Deck[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck "Direct link to Stream Deck")

### v7.1.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-7-1-0 "Direct link to v7.1.0")

-   Added support for [embedding resources](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin#setresources) within actions.
-   Added support for Node.js 24, configurable within the [manifest](https://docs.elgato.com/streamdeck/sdk/references/manifest#nodejs-version).
-   Added in-app developer tools that track the current property inspector.
-   Fixed device type mapping for Stream Deck Scissor Keys and Corsair keyboards.

### v7.0.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-7-0-0 "Direct link to v7.0.0")

-   Added `deviceDidChange` event.
    -   Occurs when a devices' metadata or size changes.
    -   [Learn more](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin#devicedidchange) about listening to device changes.
-   Added support for passive deep-link messages using the `?streamdeck=hidden` query parameter.
    -   Passive deep-links messages will not bring Stream Deck to the foreground.
    -   [Learn more](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking#active-vs-passive) about active vs passive deep-link message.
-   Added `SupportedInKeyLogicActions` property to actions within the manifest.
    -   When `false`, the action will not be usable within Key Logic actions.
    -   Optional property; default is `true`.
-   Added device type for Virtual Stream Deck (11).
-   Updated device `size` to reflect the visual size of the device.
    -   Previously always 8 x 8 for Stream Deck Mobile and Virtual Stream Deck.
-   Fixed an issue whereby linked plugins would not run on first launch after installing Stream Deck.

### v6.9.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-6-9-0 "Direct link to v6.9.0")

-   Added `SupportURL` option to the manifest:
    -   When specified, users will see a help button above the property inspector of the selected action.
    -   Specifying a `SupportURL` at the [root level](https://docs.elgato.com/streamdeck/sdk/references/manifest#manifest-supporturl) (plugin) will apply to all actions.
    -   Specifying a `SupportURL` at the [action level](https://docs.elgato.com/streamdeck/sdk/references/manifest#action-supporturl) will override the plugin `SupportURL`.
    -   `SupportURL` values are optional, but recommended.
-   Added device type for Stream Deck Studio.
-   Improved parsing of URLs when receiving deep-link messages, to support empty segments.
-   Resolved an issue whereby updating a layout item's `zOrder` to the same value would result in an error.
-   Updated Node.js runtime to v20.19.0.
-   Updated Chromium to v122.0.6261.171.

Property inspector event changes

As part of the upgrade to Chromium 122, the `beforeunload` event is no longer emitted within the property inspector when the property inspector disappears.

Quality of life improvement

Stream Deck now will appear in the Dock on macOS when the main configuration window is active.

### v6.7.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-6-7-0 "Direct link to v6.7.0")

-   Added `isInMultiAction` to property inspector action information.
-   Updated Node.js runtime to v20.15.0
-   Updated Chromium to v118.0.5993.220.

### v6.6.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-6-6-0 "Direct link to v6.6.0")

-   Added support for Stream Deck Neo, and SCUF controllers.
-   Added support for OS-specific actions via `Actions[].OS` within the manifest.
-   Added the ability to disable automatically installing pre-defined profiles, when a plugin is installed, via `Profiles[].AutoInstall` within the manifest.

### v6.5.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-6-5-0 "Direct link to v6.5.0")

warning

Please note, from Stream Deck 6.5 onwards, `dialPress` will not be emitted by the API. Plugins should use `dialDown` and `dialUp` to receive events relating to dial presses.

-   Added support for receiving deep-link messages.
-   Added support for switching to a specific profile page when calling `switchToProfile`.
-   Added `controller` information to `WillAppear` and `WillDisappear` events for multi-actions.
-   Added support for Node.js plugins with the `.cjs` or `.mjs` file extensions.
-   Removed `dialPress` event in favour of `dialDown` and `dialUp`.
-   Updated Node.js runtime to v20.8.1.

### v6.4.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-6-4-0 "Direct link to v6.4.0")

-   Added support for Node.js plugins (beta).
-   Added `DisableAutomaticStates` option to manifest.
-   Added `setTriggerDescription` command for Stream Deck + encoders.
-   Added `range` to BAR layout item.
-   Added `range` to GBAR layout item.
-   Added `text-overflow` to TEXT layout item.
-   Deprecated support for installing plugins using the `streamdeck://` scheme.

### v6.1.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-6-1-0 "Direct link to v6.1.0")

-   Add `dialDown` event for Stream Deck + encoders.
-   Add `dialUp` event for Stream Deck + encoders.
-   Deprecated `dialPress` event for Stream Deck + encoders.

### v6.0.0[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-6-0-0 "Direct link to v6.0.0")

-   Add support for Stream Deck +.
-   Add `UserTitleEnabled` property to the manifest.
-   Add `Encoder` to the manifest for Stream Deck + devices.
-   Add `TriggerDescription` to the manifest for Stream Deck + devices.
-   Add `Layouts` for Stream Deck + displays.
-   Add `setFeedback` event for Stream Deck + displays.
-   Add `setFeedbackLayout` event for Stream Deck + displays.
-   Add `touchTap` event for Stream Deck + displays.
-   Add `dialPress` event for Stream Deck + encoders.
-   Add `dialRotate` event for Stream Deck + encoders.
-   Update `willAppear` and `willDisappear` events to include the `controller` property.

## Archive[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#archive "Direct link to Archive")

### Stream Deck v5[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-v5 "Direct link to Stream Deck v5")

### Stream Deck v4[](https://docs.elgato.com/streamdeck/sdk/references/websocket/changelog/#stream-deck-v4 "Direct link to Stream Deck v4")