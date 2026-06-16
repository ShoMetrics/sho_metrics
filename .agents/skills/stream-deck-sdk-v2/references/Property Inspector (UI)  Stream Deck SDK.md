The property inspector (UI) connects to Stream Deck using a WebSocket, allowing it to directly receive a subset of events, and send commands. The WebSocket connection also allows the property inspector to communicate with the application-layer (i.e. the plugin).

## Registration[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#registration "Direct link to Registration")

-   Manually
-   Automatically

A connection with Stream Deck is established within the property inspector by defining a function on the `window`, named [`connectElgatoStreamDeckSocket`](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#connectelgatostreamdecksocket). Once the DOM has loaded, Stream Deck will invoke this function and provide registration information, including the port to connect on.

Below is an example of implementing the `connectElgatoStreamDeckSocket` function to establish a connection with Stream Deck:

Connecting to Stream Deck in the property inspector

```
<span><span>window</span><span>.</span><span>connectElgatoStreamDeckSocket</span><span> = (</span><span>port</span><span>, </span><span>uuid</span><span>, </span><span>event</span><span>, </span><span>info</span><span>, </span><span>actionInfo</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>const</span><span> infoObj</span><span> = </span><span>JSON</span><span>.</span><span>parse</span><span>(</span><span>info</span><span>); </span><span>// Information about Stream Deck and the plugin.</span></span>
<span><span>    const</span><span> actionInfo</span><span> = </span><span>JSON</span><span>.</span><span>parse</span><span>(</span><span>actionInfo</span><span>); </span><span>// Information about the action the UI is for.</span></span>
<span></span>
<span><span>    // Establish a connection with Stream Deck</span></span>
<span><span>const</span><span> connection</span><span> = </span><span>new</span><span> WebSocket</span><span>(</span><span>`ws://127.0.0.1:</span><span>${</span><span>port</span><span>}</span><span>`</span><span>);</span></span>
<span><span>connection</span><span>.</span><span>onopen</span><span> = () </span><span>=&gt;</span><span> {</span></span>
<span><span>connection</span><span>.</span><span>send</span><span>(</span><span>JSON</span><span>.</span><span>stringify</span><span>({ </span><span>event</span><span>, </span><span>uuid</span><span> }));</span></span>
<span><span>};</span></span>
<span><span>};</span></span>
```

### connectElgatoStreamDeckSocket[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#connectelgatostreamdecksocket "Direct link to connectElgatoStreamDeckSocket")

Connects to the Stream Deck, enabling the UI to interact with the plugin, and access the Stream Deck API.

```
<span><span>window</span><span>.</span><span>connectElgatoStreamDeckSocket</span><span> = (</span><span>port</span><span>: </span><span>string</span><span>, </span><span>uuid</span><span>: </span><span>string</span><span>, </span><span>event</span><span>: </span><span>string</span><span>, </span><span>info</span><span>: </span><span>string</span><span>, </span><span>actionInfo</span><span>: </span><span>string</span><span>) </span><span>=&gt;</span><span> void</span><span> | </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt;</span></span>
```

**Parameters**

| Name | Description |
| --- | --- |
| port | Port to be used when connecting to Stream Deck. |
| uuid | Identifies the UI; this must be provided when establishing the connection with Stream Deck. |
| event | Name of the event that identifies the registration procedure; this must be provided when establishing the connection with Stream Deck. |
| info | Information about the Stream Deck application and operating system. |
| actionInfo | Information about the action the UI is associated with. |

### RegistrationInfo[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#registrationinfo "Direct link to RegistrationInfo")

Information about the Stream Deck application, the plugin, the user's operating system, user's Stream Deck devices, etc.

```
<span><span>type</span><span> RegistrationInfo</span><span> = {</span></span>
<span><span>    application</span><span>: {</span></span>
<span><span>        font</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        language</span><span>: </span><span>"de"</span><span> | </span><span>"en"</span><span> | </span><span>"es"</span><span> | </span><span>"fr"</span><span> | </span><span>"ja"</span><span> | </span><span>"ko"</span><span> | </span><span>"zh_CN"</span><span> | </span><span>"zh_TW"</span><span>;</span></span>
<span><span>        platform</span><span>: </span><span>"mac"</span><span> | </span><span>"windows"</span><span>;</span></span>
<span><span>        platformVersion</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        version</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>    colors</span><span>: {</span></span>
<span><span>        buttonMouseOverBackgroundColor</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        buttonPressedBackgroundColor</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        buttonPressedBorderColor</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        buttonPressedTextColor</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        highlightColor</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>    devicePixelRatio</span><span>: </span><span>number</span><span>;</span></span>
<span><span>    devices</span><span>: {</span></span>
<span><span>        id</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        name</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        size</span><span>: {</span></span>
<span><span>            columns</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            rows</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        type</span><span>: </span><span>DeviceType</span><span>;</span></span>
<span><span>    }[];</span></span>
<span><span>    plugin</span><span>: {</span></span>
<span><span>        uuid</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        version</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**application**: objectRequired **colors**: objectRequired **devicePixelRatio**: numberRequired **devices**: object\[\]Required **plugin**: objectRequired

## Events[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#events "Direct link to Events")

### DidReceiveGlobalSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#didreceiveglobalsettings "Direct link to DidReceiveGlobalSettings")

Occurs when the settings associated with the plugin are requested, or when the the plugin's settings were updated by the plugin.

```
<span><span>type</span><span> DidReceiveGlobalSettings</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"didReceiveGlobalSettings"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "didReceiveGlobalSettings"Required **payload**: objectRequired

### DidReceiveResources[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#didreceiveresources "Direct link to DidReceiveResources")

Occurs when the resources associated with an action instance are requested, or when the the resources were updated in the plugin.

```
<span><span>type</span><span> DidReceiveResources</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"didReceiveResources"</span><span>;</span></span>
<span><span>    id</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    payload</span><span>:</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span>;</span></span>
<span><span>              isInMultiAction</span><span>: </span><span>true</span><span>;</span></span>
<span><span>              resources</span><span>: {</span></span>
<span><span>                  [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>              state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span> | </span><span>"Encoder"</span><span>;</span></span>
<span><span>              coordinates</span><span>: {</span></span>
<span><span>                  column</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                  row</span><span>: </span><span>number</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              isInMultiAction</span><span>: </span><span>false</span><span>;</span></span>
<span><span>              resources</span><span>: {</span></span>
<span><span>                  [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>              state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "didReceiveResources"Required **id**: string **payload**: ActionPayloadRequired

### DidReceiveSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#didreceivesettings "Direct link to DidReceiveSettings")

Occurs when the settings associated with an action instance are requested, or when the the settings were updated by the plugin.

```
<span><span>type</span><span> DidReceiveSettings</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"didReceiveSettings"</span><span>;</span></span>
<span><span>    payload</span><span>:</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span>;</span></span>
<span><span>              isInMultiAction</span><span>: </span><span>true</span><span>;</span></span>
<span><span>              resources</span><span>: {</span></span>
<span><span>                  [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>              state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span> | </span><span>"Encoder"</span><span>;</span></span>
<span><span>              coordinates</span><span>: {</span></span>
<span><span>                  column</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                  row</span><span>: </span><span>number</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              isInMultiAction</span><span>: </span><span>false</span><span>;</span></span>
<span><span>              resources</span><span>: {</span></span>
<span><span>                  [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>              state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "didReceiveSettings"Required **payload**: ActionPayloadRequired

### SendToPropertyInspector[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#sendtopropertyinspector "Direct link to SendToPropertyInspector")

Occurs when a payload was sent to the property inspector from the plugin.

```
<span><span>type</span><span> SendToPropertyInspector</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"sendToPropertyInspector"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonValue</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **event**: "sendToPropertyInspector"Required **payload**: JsonValueRequired

## Commands[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#commands "Direct link to Commands")

### GetGlobalSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#getglobalsettings "Direct link to GetGlobalSettings")

Gets the global settings associated with the plugin. Causes `didReceiveGlobalSettings` to be emitted.

```
<span><span>type</span><span> GetGlobalSettings</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"getGlobalSettings"</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "getGlobalSettings"Required

### GetResources[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#getresources "Direct link to GetResources")

Gets the resources (files) associated with the action; these resources are embedded into the action when it is exported, either individually, or as part of a profile.

Available from Stream Deck 7.1.

```
<span><span>type</span><span> GetResources</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"getResources"</span><span>;</span></span>
<span><span>    id</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **event**: "getResources"Required **id**: string

### GetSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#getsettings "Direct link to GetSettings")

Gets the settings associated with an instance of an action. Causes `didReceiveSettings` to be emitted.

```
<span><span>type</span><span> GetSettings</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"getSettings"</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **event**: "getSettings"Required

### OpenUrl[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#openurl "Direct link to OpenUrl")

Opens the URL in the user's default browser.

```
<span><span>type</span><span> OpenUrl</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"openUrl"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        url</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "openUrl"Required **payload**: objectRequired

### SendToPlugin[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#sendtoplugin "Direct link to SendToPlugin")

Sends a message to the plugin.

```
<span><span>type</span><span> SendToPlugin</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"sendToPlugin"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonValue</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **event**: "sendToPlugin"Required **payload**: JsonValueRequired

### SetGlobalSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#setglobalsettings "Direct link to SetGlobalSettings")

Sets the global settings associated with the plugin, and notifies the plugin by emitting `didReceiveGlobalSettings`.

```
<span><span>type</span><span> SetGlobalSettings</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setGlobalSettings"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setGlobalSettings"Required **payload**: JsonObjectRequired

### SetResources[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#setresources "Direct link to SetResources")

Sets the resources (files) associated with the action; these resources are embedded into the action when it is exported, either individually, or as part of a profile.

Available from Stream Deck 7.1.

```
<span><span>type</span><span> SetResources</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setResources"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **event**: "setResources"Required **payload**: ResourcesRequired

### SetSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/ui/#setsettings "Direct link to SetSettings")

Sets the settings associated with an action instance, and notifies the plugin by emitting `didReceiveSettings`.

```
<span><span>type</span><span> SetSettings</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setSettings"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **event**: "setSettings"Required **payload**: JsonObjectRequired