The Stream Deck SDK provides utilities to streamline interacting with common system functionality, such as [monitoring an app launching or terminating](https://docs.elgato.com/streamdeck/sdk/guides/app-monitoring) and [receiving deep-links](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking). In addition to these, the following utilities are available.

## Opening URLs[](https://docs.elgato.com/streamdeck/sdk/guides/system/#opening-urls "Direct link to Opening URLs")

There may be occasions when your plugin needs to direct the user to a website in their browser, for example when authenticating a service, or when the user is seeking help. This can be achieved with the following utility:

Open URL from plugin

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>onKeyDown</span><span>(() </span><span>=&gt;</span><span> {</span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>openUrl</span><span>(</span><span>"https://elgato.com"</span><span>);</span></span>
<span><span>});</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

The above example will open `https://elgato.com` in the user's default browser.

note

All URLs are opened in the user's default browser. Custom URL schemes, for example `my-app://` are not yet supported by the SDK.

## System Wake[](https://docs.elgato.com/streamdeck/sdk/guides/system/#system-wake "Direct link to System Wake")

Handling system wake correctly is an important part of ensuring your plugin resumes seamlessly. As part of the system wake procedure, your plugin will receive the following events:

-   `onWillAppear` for all visible actions.
-   A one-time `onSystemDidWakeUp` event.

The latter `systemDidWakeUp` event can be used to restore connections / state, for example a websocket connection with an API, or IPC with local app. Listening for this event is achieved with the following:

System wake callback

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onSystemDidWakeUp</span><span>((</span><span>ev</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// Handle system wake.</span></span>
<span><span>});</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

warning

`onSystemDidWakeUp` is only available in the context of the plugin, and is not available in the property inspector.