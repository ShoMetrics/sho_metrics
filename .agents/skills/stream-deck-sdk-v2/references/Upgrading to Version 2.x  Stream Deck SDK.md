This documentation will guide you through upgrading your Stream Deck plugin, using `@elgato/streamdeck`, to version 2.

Terminal

```
<span><span>npm</span><span> i</span><span> @elgato/streamdeck@latest</span></span>
```

## Breaking Changes[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#breaking-changes "Direct link to Breaking Changes")

-   [UI namespace](https://docs.elgato.com/streamdeck/sdk/guides/logging/#ui-communication) has been simplified.
-   [Dependencies](https://docs.elgato.com/streamdeck/sdk/guides/logging/#dependencies) have been decoupled.
-   [Manifest namespace](https://docs.elgato.com/streamdeck/sdk/guides/logging/#manifest) has been removed.
-   [Browser import](https://docs.elgato.com/streamdeck/sdk/guides/logging/#browser-import) has been removed.

## UI Communication[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#ui-communication "Direct link to UI Communication")

The UI namespace responsible for communicating with the property inspector has been streamlined; these improvements come with two breaking changes.

### Send to Property Inspector[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#send-to-property-inspector "Direct link to Send to Property Inspector")

Sending payloads to the property inspector has now been streamlined, and no longer requires `.current?`.

-   Before
-   Now

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>ui</span><span>.</span><span>current</span><span>?.</span><span>sendToPropertyInspector</span><span>({</span></span>
<span><span>message:</span><span> "Hello world"</span><span>,</span></span>
<span><span>});</span></span>
```

### Property Inspector Action[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#property-inspector-action "Direct link to Property Inspector Action")

Accessing the action for current property inspector is now achieved using the `.action` property.

-   Before
-   Now

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>ui</span><span>.</span><span>current</span><span>;</span></span>
```

## Dependencies[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#dependencies "Direct link to Dependencies")

Previously when publishing `@elgato/streamdeck` the package was bundled into a single file making dependency resolution difficult, and prone to conflicts.

Starting with version 2.0, `@elgato/streamdeck` is no longer pre-bundle; this allows more functionality, previously isolated to the Stream Deck SDK, to become accessible, starting with `@elgato/utils`.

### JSON[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#json "Direct link to JSON")

-   Before
-   Now

```
<span><span>import</span><span> type</span><span> {</span></span>
<span><span>JsonObject</span><span>,</span></span>
<span><span>JsonPrimitive</span><span>,</span></span>
<span><span>JsonValue</span></span>
<span><span>} </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
```

### Logging[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#logging "Direct link to Logging")

-   Before
-   Now

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>LogLevel</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>setLevel</span><span>(</span><span>LogLevel</span><span>.</span><span>TRACE</span><span>);</span></span>
```

### Miscellaneous[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#miscellaneous "Direct link to Miscellaneous")

-   Before
-   Now

```
<span><span>import</span><span> {</span></span>
<span><span>Enumerable</span><span>,</span></span>
<span><span>EventEmitter</span><span>,</span></span>
<span><span>type</span><span> EventsOf</span><span>,</span></span>
<span><span>} </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
```

## Manifest[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#manifest "Direct link to Manifest")

With the introduction of DRM protection, the manifest is now considered a protected resource, and access to `streamDeck.manifest` at runtime has been removed. Learn more about [DRM protection](https://docs.elgato.com/streamdeck/sdk/introduction/distribution#drm-protection).

## Browser Import[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#browser-import "Direct link to Browser Import")

The ability to import `@elgato/streamdeck` into the browser (property inspector) has been removed.