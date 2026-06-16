Deep-linking is the process of sending messages to local apps via custom URL scheme registered on the user's device, for example a computer or mobile phone. This can be useful when:

-   Handling callbacks from an authorization provider (OAuth2).
-   Configuring a local IPC between two local apps.
-   Receiving settings from a separate integration.

Stream Deck SDK streamlines the process of deep-linking by providing plugins with a unique URL that allows them to receive deep-link messages under the pre-registered `streamdeck://` scheme.

## Receiving Messages[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#receiving-messages "Direct link to Receiving Messages")

Handling inbound deep-link messages can be achieved with the `onDidReceiveDeepLink` event handler found in the `system` namespace, for example:

Deep-link event callback

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onDidReceiveDeepLink</span><span>((</span><span>ev</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// Handle the deep-link message</span></span>
<span><span>});</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

With a handler function registered, your plugin is now set up to receive deep-link messages.

### Deep-Link URL[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#deep-link-url "Direct link to Deep-Link URL")

Each plugin has a unique URL based on their unique identifier using the following format:

```
<span><span>streamdeck://plugins/message/&lt;PLUGIN_UUID&gt;</span></span>
```

With this URL, the plugin is able to receive inbound deep-link messages in the form of a URL that follows the [RFC-3986](https://datatracker.ietf.org/doc/html/rfc3986#section-3) structure:

```
<span><span>streamdeck://plugins/message/&lt;PLUGIN_UUID&gt;[path]["?" query]["#" fragment]</span></span>
```

For example:

```
<span><span>                                                              href</span></span>
<span><span>                                                   ┌───────────┴───────────┐</span></span>
<span><span>streamdeck://plugins/message/com.elgato.hello-world/hello?name=Elgato#waving</span></span>
<span><span>                                                   └─┬──┘ └────┬────┘ └─┬──┘</span></span>
<span><span>                                                    path      query    fragment</span></span>
```

### Active vs Passive[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#active-vs-passive "Direct link to Active vs Passive")

By default, when your plugin receives a deep-link message, Stream Deck's window is brought to the foreground. These are referred to as active deep-links, and are useful in scenarios such as OAuth, when you want the user to continue a flow in Stream Deck.

Example of an active deep-link

```
<span><span>streamdeck://plugins/message/com.elgato.hello-world/hello</span></span>
```

From Stream Deck 7.0, it is also possible to send deep-link messages whereby Stream Deck's window is _not_ brought to the foreground. These are referred to as passive deep-links, and are useful in scenarios such as setup operations. For example, sending the port of a local WebSocket server from your app to your plugin so that they can communicate.

To a receive deep-link message as a passive message, you must specify the query string parameter `streamdeck=hidden` within your deep-link URL, for example:

Example of a passive deep-link

```
<span><span>streamdeck://plugins/message/com.elgato.hello-world/hello?streamdeck=hidden</span></span>
<span><span>                                                          └───────┬───────┘</span></span>
<span><span>                                                          Passive deep-link</span></span>
```

Below is a summary of the differences between active and passive deep-links.

|  | Active | Passive |
| --- | --- | --- |
| Default | Yes | No |
| Stream Deck version | 6.5 or higher | 7.0 or higher |
| Stream Deck brought to foreground | Yes | No |
| `streamdeck` query string value | \- | `hidden` |
| OAuth | ✅ Recommended | ❌ Not recommended |
| Setup messages requiring user | ✅ Recommended | ❌ Not recommended |
| Setup messages not requiring user | ❌ Not recommended | ✅ Recommended |

### Example[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#example "Direct link to Example")

Given the following event handler:

Reading a deep-link message

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onDidReceiveDeepLink</span><span>((</span><span>ev</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>const</span><span> { </span><span>path</span><span>, </span><span>fragment</span><span> } = </span><span>ev</span><span>.</span><span>url</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>`Path = </span><span>${</span><span>path</span><span>}</span><span>`</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>`Fragment = </span><span>${</span><span>fragment</span><span>}</span><span>`</span><span>);</span></span>
<span><span>});</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

To send a message to the plugin with the unique identifier `com.elgato.hello-world`, you would submit the following URL:

```
<span><span>streamdeck://plugins/message/com.elgato.hello-world/Hello%20world#Testing</span></span>
```

Which would then log the following:

```
<span><span>Path = /Hello%20world</span></span>
<span><span>Fragment = Testing</span></span>
```

Information on the event is parsed from the deep-link URL using the native [URL](https://developer.mozilla.org/en-US/docs/Web/API/URL) API, with the unique prefix ignored, i.e. `streamdeck://plugins/message/<PLUGIN_UUID>`.

Testing deep-links

To test deep-linking, enter the URL in your browsers URL bar and press return. Alternatively, on Windows you can submit the URL directly in the Run panel, opened with Win + R.

## Known Limitations[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#known-limitations "Direct link to Known Limitations")

-   Some authorization providers do not accept custom URL schemes as a callback URL. If this is the case, consider using the [OAuth2 redirect proxy](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#oauth2-redirect-proxy).
-   Keep deep-link messages small (under 2,000 characters). If you need to transfer more data, consider using a WebSocket connection.
-   Deep-links are only accessible locally, and it is therefore not possible to receive deep-link messages from remote sources.

## OAuth2 Redirect Proxy[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#oauth2-redirect-proxy "Direct link to OAuth2 Redirect Proxy")

warning

The OAuth2 redirect proxy is designed to assist with OAuth2 code grant flow for authorization providers that do not accept custom schemes as part of their callback URLs, for example `streamdeck://`.

It is recommended you use your plugin's deep-link URL as the callback URL unless absolutely necessary.

The OAuth2 redirect proxy is a remotely accessibly `https://` URL that has the single responsibility of forwarding messages to Stream Deck plugins via deep-linking. Due to the sensitive nature of the redirect proxy, no information sent to the proxy is stored on Elgato servers.

The following diagram provides an overview of the flow:

![Flow diagram that depicts OAuth2 authorization code grant flow; the callback of the authorization provider goes via the redirect proxy, which then forwards the message to the plugin via deep-linking](https://docs.elgato.com/img/streamdeck/sdk/oauth2-flow.svg)

### Redirect URL[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#redirect-url "Direct link to Redirect URL")

The redirect URL follows a similar structure to the [deep-link URL](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#deep-link-url), and is uniquely identifiable based on your plugin's identifier. This unique URL should be supplied to the authorization provider as the callback URL when authenticating with OAuth2. The format is as follows:

```
<span><span>https://oauth2-redirect.elgato.com/streamdeck/plugins/message/&lt;PLUGIN_UUID&gt;</span></span>
```

Upon receiving a callback from an authorization provider, the request is forwarded to your plugin. Please note, only a subset of query parameters are forwarded when present, these are:

| Query Parameter | Description |
| --- | --- |
| `code` | Authorization code to exchange for an access token. |
| `state` | Optional value supplied as part of requesting authorization. |
| `scope` | Specifies the level of access that was granted to the app. |
| `error` | Error returned by the authorization provider when unsuccessful. |

## URL Builder[](https://docs.elgato.com/streamdeck/sdk/guides/deep-linking/#url-builder "Direct link to URL Builder")

Plugin UUID:Path:

URLs:

Deep-link URL

```
<span><span>streamdeck://plugins/message/com.elgato.hello-world/auth</span><br></span>
```

OAuth2 redirect proxy URL

```
<span><span>https://oauth2-redirect.elgato.com/streamdeck/plugins/message/com.elgato.hello-world/auth</span><br></span>
```

OAuth2 redirect proxy URL (encoded)

```
<span><span>https%3A%2F%2Foauth2-redirect.elgato.com%2Fstreamdeck%2Fplugins%2Fmessage%2Fcom.elgato.hello-world%2Fauth</span><br></span>
```