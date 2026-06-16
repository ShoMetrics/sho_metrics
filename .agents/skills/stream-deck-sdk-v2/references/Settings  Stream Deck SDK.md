The Stream Deck SDK provides support for managing settings associated with your plugin. This is useful when you want to provide a higher level of configurability for your plugin, provide a persisted context to an action, or securely store an access token to an API, etc.

There are two types of settings:

-   Action settings - settings associated with one of your plugin's actions.
-   Global settings - plugin-wide settings.

Both types of settings can only be accessed by the plugin they are associated with.

## Overview[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#overview "Direct link to Overview")

Global and action settings share similarities in their APIs, and both can be managed from either the application-layer, or [property inspector (UI)](https://docs.elgato.com/streamdeck/sdk/guides/ui). Additionally, once settings have been set, the adjacent environment is notified of the update, for example:

-   When updated in the property inspector, the application-layer is notified.
-   When updated in the application-layer, and there is an active property inspector, the property inspector will notified.

The following table provides an overview of the common functions and events:

-   Action settings
-   Global settings

-   [Writing](https://docs.elgato.com/streamdeck/sdk/guides/settings/#writing-action-settings):
    -   `ev.action.setSettings(settings)`<sup>1</sup>
-   [Reading](https://docs.elgato.com/streamdeck/sdk/guides/settings/#reading-action-settings):
    -   `ev.payload.settings`
    -   `ev.action.getSettings()`<sup>1</sup>
-   [Changed](https://docs.elgato.com/streamdeck/sdk/guides/settings/#action-settings-changed):
    -   `SingletonAction.onDidReceiveSettings(handler)`
    -   `streamDeck.settings.onDidReceiveSettings(handler)`

<sup>1</sup> available whilst the action is visible.

note

In this context, `ev` are event arguments associated with an event emitted within the `SingletonAction` or from `streamDeck.*` for events that are associated with an action.

info

Settings are persisted as JSON objects, meaning values can be `boolean`, `number`, `string`, `null`, arrays, or objects.

## Action Settings[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#action-settings "Direct link to Action Settings")

### Writing Settings[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#writing-action-settings "Direct link to Writing Settings")

Settings can be associated with an instance of an action to provide it context. This is useful when you want to allow a user to customize a specific action provided by your plugin, or the action has a state that it manages, for example a counter.

The following example demonstrates setting `count` to 1 when the `Counter` action key is pressed down.

Write to settings on key down

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.counter"</span><span> })</span></span>
<span><span>class</span><span> Counter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> async</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>// Set the actions settings on key down.</span></span>
<!-- -->
<span><span>await</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>setSettings</span><span>({</span></span>
<span><span>count:</span><span> 1</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>registerAction</span><span>(</span><span>new</span><span> Counter</span><span>());</span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

Security

Security-sensitive settings, such as API keys, should always be persisted using [global settings](https://docs.elgato.com/streamdeck/sdk/guides/settings/#global-settings), never action settings. Action settings are stored as plain-text and are included when exporting Stream Deck profiles, and in their nature action settings are not secure.

### Reading Settings[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#reading-action-settings "Direct link to Reading Settings")

An action's settings are provided as part of the event arguments, for example when `onWillAppear` or `onKeyDown` occurs. By default, the settings' type is `JsonObject` and whilst this is fine when setting them, it isn't particularly useful when reading them. To fix this, a type that represents the settings should be defined separately, and provided when declaring the class.

The following example demonstrates defining the settings' type to provide intellisense when reading the settings from the event arguments:

Using types with settings

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<!-- -->
<span><span>// Define the action's settings type.</span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>count</span><span>: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.counter"</span><span> })</span></span>
<!-- -->
<span><span>class</span><span> Counter</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>Settings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<!-- -->
<span><span>override</span><span> async</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>// `ev.payload.settings` now contains typed-settings.</span></span>
<span></span>
<span><span>// Set the actions settings on key down.</span></span>
<span><span>await</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>setSettings</span><span>({</span></span>
<span><span>count:</span><span> 1</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>registerAction</span><span>(</span><span>new</span><span> Counter</span><span>());</span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

Type safety

Defining the type of your settings provides insight into what their type might be, but does not guarantee their underlying type. [Learn more about type-safety to prevent runtime errors](https://docs.elgato.com/streamdeck/sdk/guides/settings/#type-safety).

Event argument types

In the above the `KeyDownEvent` includes the settings type `Settings` to provide typing. This is also possible of other event arguments for events within the `SingletonAction` action, including:

-   `onDialDown`, `onDialRotate`, `onDialUp`, `onTouchTap`.
-   `onDidReceiveSettings`.
-   `onKeyDown`, `onKeyUp`.
-   `onTitleParametersDidChange`.
-   `onWillAppear`, `onWillDisappear`.

The following example demonstrates reading the settings as part of the `onKeyDown` event, and incrementing the count by one, and then updating the action's settings.

Access settings via event payload

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>// Define the action's settings type.</span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>count</span><span>: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.counter"</span><span> })</span></span>
<span><span>class</span><span> Counter</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>Settings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> async</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>// Read the current count.</span></span>
<span><span>let</span><span> { </span><span>count</span><span> = </span><span>0</span><span> } = </span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>settings</span><span>; </span></span>
<span><span>count</span><span>++;</span></span>
<span></span>
<span><span>// Set the new count.</span></span>
<span><span>await</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>setSettings</span><span>({ </span><span>count</span><span> });</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>registerAction</span><span>(</span><span>new</span><span> Counter</span><span>());</span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

info

You can also request a **visible** action's settings using `ev.action.getSettings()`; as there is no guarantee the action will be visible, we recommend using the settings supplied as part of the event arguments where possible.

### Settings Changed[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#action-settings-changed "Direct link to Settings Changed")

Upon the settings of an action being set in the property inspector, your application-layer will receive an event allowing you to react accordingly, for example your plugin could set the image of the action based on the user's selection of a drop down:

Receive settings callback

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>action</span><span>, </span><span>type</span><span> DidReceiveSettingsEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>// Define the action's settings type.</span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>count</span><span>: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.counter"</span><span> })</span></span>
<span><span>class</span><span> Counter</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>Settings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the application-layer receives the settings from the UI.</span></span>
<span><span> */</span></span>
<!-- -->
<span><span>override</span><span> onDidReceiveSettings</span><span>(</span><span>ev</span><span>: </span><span>DidReceiveSettingsEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>void</span><span> {</span></span>
<span><span>// Handle the settings changing in the property inspector (UI).</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>actions</span><span>.</span><span>registerAction</span><span>(</span><span>new</span><span> Counter</span><span>());</span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

## Global Settings[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#global-settings "Direct link to Global Settings")

### Writing Settings[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#writing-global-settings "Direct link to Writing Settings")

Global settings are persisted at the plugin-level, and are accessible only to the plugin that persisted them.

The following example demonstrates setting the global settings from the application-layer after receiving a deep-link message:

Write global settings from plugin

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onDidReceiveDeepLink</span><span>((</span><span>ev</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// Set the global settings after receiving a deep-link.</span></span>
<span><span>streamDeck</span><span>.</span><span>settings</span><span>.</span><span>setGlobalSettings</span><span>({</span></span>
<span><span>messageReceived:</span><span> true</span><span>,</span></span>
<span><span>});</span></span>
<span><span>});</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

Security

Security-sensitive settings, such as access tokens, should always be persisted using global settings as these are stored securely on the user's local machine. However, as these are stored locally, users can access them. We therefore recommend you:

-   Do:
    
    use global settings for user-specific settings, for example OAuth2 access tokens or API keys provided by the user.
    
-   Do:use global settings for non-sensitive plugin-level settings.
-   Don't:use global settings for your plugin's secrets, for example API keys.

### Reading Settings[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#reading-global-settings "Direct link to Reading Settings")

Retrieving global settings is achieved using `getGlobalSettings` found in the `settings` namespace, for example:

Get global settings in plugin

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onDidReceiveDeepLink</span><span>(</span><span>async</span><span> (</span><span>ev</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// Get the settings.</span></span>
<span><span>const</span><span> settings</span><span> = </span><span>await</span><span> streamDeck</span><span>.</span><span>settings</span><span>.</span><span>getGlobalSettings</span><span>();</span></span>
<span><span>});</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

When retrieving the global settings, the result has a type of `JsonObject` which does not allow intellisense to provide suggestions. To overcome this limitation, a type may be provided as part of the call to request the settings. The following combines the [reading](https://docs.elgato.com/streamdeck/sdk/guides/settings/#reading-global-settings) and [writing](https://docs.elgato.com/streamdeck/sdk/guides/settings/#writing-global-settings) examples, updated to demonstrate how typed settings can be used to track the number of deep-link messages received.

Using types with global settings

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>// Define a type that represents the settings.</span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>count</span><span>: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>system</span><span>.</span><span>onDidReceiveDeepLink</span><span>(</span><span>async</span><span> (</span><span>ev</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// When getting the settings, supply the type.</span></span>
<span><span>let</span><span> { </span><span>count</span><span> = </span><span>0</span><span> } = </span><span>await</span><span> streamDeck</span><span>.</span><span>settings</span><span>.</span><span>getGlobalSettings</span><span>&lt;</span><span>Settings</span><span>&gt;();</span></span>
<span></span>
<span><span>count</span><span>++;</span></span>
<span><span>await</span><span> streamDeck</span><span>.</span><span>settings</span><span>.</span><span>setGlobalSettings</span><span>({ </span><span>count</span><span> });</span></span>
<span><span>});</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

Type safety

Defining the type of your settings provides insight into what their type might be, but does not guarantee their underlying type. [Learn more about type-safety to prevent runtime errors](https://docs.elgato.com/streamdeck/sdk/guides/settings/#type-safety).

### Settings Changed[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#global-settings-changed "Direct link to Settings Changed")

In addition to explicitly requesting the global settings, the application-layer and property inspector can subscribe to an event to be notified when the other updates the global settings. For example, the property inspector can listen to changes to global settings made by the application-layer in the following way:

Global settings callback

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>settings</span><span>.</span><span>onDidReceiveGlobalSettings</span><span>((</span><span>ev</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>// Handle the global settings changing in application layer.</span></span>
<span><span>});</span></span>
```

tip

The application-layer can also listen for the global settings changing in the property inspector using `onDidReceiveGlobalSettings` in the `settings` namespace.

## Changed vs Requested[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#changed-vs-requested "Direct link to Changed vs Requested")

By default, when calling `action.getSettings` or `streamDeck.settings.getGlobalSettings` the relevant settings-changed handler is also called. Historically, this has made it difficult to determine when settings were changed in the property inspector, vs requested in the plugin.

Starting with `@elgato/streamdeck` version 2 and Stream Deck 7.1, this flow can be improved by enabling experimental message identifiers.

Global settings callback

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<!-- -->
<span><span>// Only call onDidReceive[Global]Settings when settings change.</span></span>
<span><span>streamDeck</span><span>.</span><span>settings</span><span>.</span><span>useExperimentalMessageIdentifiers</span><span> = </span><span>true</span><span>;</span></span>
<span></span>
<span><span>// ...</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

Below is a comparison of the behavior with message identifiers off vs on.

| Scenario | Message Identifiers Off  
(Default) | Message Identifiers On |
| --- | --- | --- |
| Settings changed in UI | `onDidReceive[Global]Settings`  
🟢 Called | `onDidReceive[Global]Settings`  
🟢 Called |
| Settings requested (get) | `onDidReceive[Global]Settings`  
🟢 Called | `onDidReceive[Global]Settings`  
🔴 Not called |

## Type Safety[](https://docs.elgato.com/streamdeck/sdk/guides/settings/#type-safety "Direct link to Type Safety")

TypeScript types provide good insight into what values might be, but do not _guarantee_ the types of values. The following example demonstrates how runtime errors can occur, even with types.

Bad: Example of how runtime errors can occur

```
<span><span>import</span><span> { </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>name</span><span>: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
<span></span>
<span><span>export</span><span> class</span><span> MyAction</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>Settings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> async</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>/*</span></span>
<span><span> * Even though the settings are typed, if they have not</span></span>
<span><span> * been previously set, their values will be undefined.</span></span>
<span><span> */</span></span>
<span><span>const</span><span> { </span><span>name</span><span> } = </span><span>await</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>getSettings</span><span>();</span></span>
<!-- -->
<span><span>name</span><span>.</span><span>toLowerCase</span><span>(); </span><span>// Runtime error!</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

To reduce runtime errors with data, you should always the check values before attempting to use them. When using values that might not be safe, we recommend:

-   Use default values when destructuring objects that might be nullish.
-   For complex types, consider using a schema validation library such as [Zod](https://zod.dev/).

The following example demonstrates using Zod to validate settings.

Example of using Zod to validate data

```
<span><span>import</span><span> { </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span><span>import</span><span> z</span><span> from</span><span> "zod"</span><span>;</span></span>
<span></span>
<span><span>// Define the Zod schema.</span></span>
<span><span>const</span><span> Settings</span><span> = </span><span>z</span><span>.</span><span>object</span><span>({</span></span>
<span><span>name:</span><span> z</span><span>.</span><span>string</span><span>().</span><span>default</span><span>(</span><span>"Elgato"</span><span>),</span></span>
<span><span>});</span></span>
<span></span>
<span><span>// Infer the settings type.</span></span>
<span><span>type</span><span> Settings</span><span> = </span><span>z</span><span>.</span><span>infer</span><span>&lt;</span><span>typeof</span><span> Settings</span><span>&gt;;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * An example action that demonstrates parsing settings with Zod.</span></span>
<span><span> */</span></span>
<span><span>export</span><span> class</span><span> MyAction</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>Settings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> async</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>/*</span></span>
<span><span> * Settings can safely be undefined here, Zod</span></span>
<span><span> * will fallback `name` to "Elgato".</span></span>
<span><span> */</span></span>
<span><span>const</span><span> { </span><span>name</span><span> } = </span><span>Settings</span><span>.</span><span>parse</span><span>(</span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>settings</span><span>);</span></span>
<span><span>name</span><span>.</span><span>toLowerCase</span><span>(); </span><span>// "elgato"</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```