Stream Deck provides an API for distributing plugins as native console apps, for example those written in C++, C#, etc, with communication being handled by a dedicated WebSocket connection.

warning

Creating native plugins is an advanced technique, and is not recommended. Instead, consider using the Stream Deck SDK with [Node.js native addons](https://nodejs.org/api/n-api.html#node-api).

## Registration[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#registration "Direct link to Registration")

In order to establish a connection with Stream Deck, your plugin must first register itself using a unique identifier. The information required to establish the connection is provided as a command line parameter, along with:

| Parameter | Description |
| --- | --- |
| `-port` | The port the WebSocket is running on. |
| `-info` | A serialized JSON string that contains information about Stream Deck, Stream Deck devices, and your plugin. See [RegistrationInfo](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#registrationinfo). |
| `-pluginUUID` | Your plugin's unique registration identifier. |
| `‑registerEvent` | Name of the registration event. |

Upon startup, your plugin must connect to the WebSocket on the specified `-port`, and send a registration message as a JSON serialized string in the following format:

Registration event type

```
<span><span>type</span><span> RegisterEvent</span><span> = {</span></span>
<span><span>event</span><span>: </span><span>string</span><span>; </span><span>// -registerEvent parameter</span></span>
<span><span>uuid</span><span>: </span><span>string</span><span>; </span><span>// -pluginUUID parameter</span></span>
<span><span>};</span></span>
```

### RegistrationInfo[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#registrationinfo "Direct link to RegistrationInfo")

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

## Events[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#events "Direct link to Events")

Plugins can receive the following events from Stream Deck via their WebSocket connection.

warning

The `context` of an action is not guaranteed to persist across app cycles and therefore should not be used as a long-term identifier externally.

### ApplicationDidLaunch[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#applicationdidlaunch "Direct link to ApplicationDidLaunch")

Occurs when a monitored application is launched. Monitored applications can be defined in the `manifest.json` file via the `Manifest.ApplicationsToMonitor` property. See also `ApplicationDidTerminate`.

```
<span><span>type</span><span> ApplicationDidLaunch</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"applicationDidLaunch"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        application</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "applicationDidLaunch"Required **payload**: objectRequired

### ApplicationDidTerminate[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#applicationdidterminate "Direct link to ApplicationDidTerminate")

Occurs when a monitored application terminates. Monitored applications can be defined in the `manifest.json` file via the `Manifest.ApplicationsToMonitor` property. See also `ApplicationDidLaunch`.

```
<span><span>type</span><span> ApplicationDidTerminate</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"applicationDidTerminate"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        application</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "applicationDidTerminate"Required **payload**: objectRequired

### DeviceDidChange[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#devicedidchange "Direct link to DeviceDidChange")

Occurs when a Stream Deck device changed, for example its name or size.

Available from Stream Deck 7.0.

```
<span><span>type</span><span> DeviceDidChange</span><span> = {</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    deviceInfo</span><span>: {</span></span>
<span><span>        name</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        size</span><span>: {</span></span>
<span><span>            columns</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            rows</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        type</span><span>: </span><span>DeviceType</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>    event</span><span>: </span><span>"deviceDidChange"</span><span>;</span></span>
<span><span>};</span></span>
```

**device**: stringRequired **deviceInfo**: DeviceInfoRequired **event**: "deviceDidChange"Required

### DeviceDidConnect[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#devicedidconnect "Direct link to DeviceDidConnect")

Occurs when a Stream Deck device is connected. See also `DeviceDidDisconnect`.

```
<span><span>type</span><span> DeviceDidConnect</span><span> = {</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    deviceInfo</span><span>: {</span></span>
<span><span>        name</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        size</span><span>: {</span></span>
<span><span>            columns</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            rows</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        type</span><span>: </span><span>DeviceType</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>    event</span><span>: </span><span>"deviceDidConnect"</span><span>;</span></span>
<span><span>};</span></span>
```

**device**: stringRequired **deviceInfo**: DeviceInfoRequired **event**: "deviceDidConnect"Required

### DeviceDidDisconnect[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#devicediddisconnect "Direct link to DeviceDidDisconnect")

Occurs when a Stream Deck device is disconnected. See also `DeviceDidConnect`.

```
<span><span>type</span><span> DeviceDidDisconnect</span><span> = {</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"deviceDidDisconnect"</span><span>;</span></span>
<span><span>};</span></span>
```

**device**: stringRequired **event**: "deviceDidDisconnect"Required

### DialDown[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#dialdown "Direct link to DialDown")

Occurs when the user presses a dial (Stream Deck +). See also `DialUp`.

NB: For other action types see `KeyDown`.

```
<span><span>type</span><span> DialDown</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"dialDown"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        controller</span><span>: </span><span>"Encoder"</span><span>;</span></span>
<span><span>        coordinates</span><span>: {</span></span>
<span><span>            column</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            row</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        resources</span><span>: {</span></span>
<span><span>            [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "dialDown"Required **payload**: TPayloadRequired

### DialRotate[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#dialrotate "Direct link to DialRotate")

Occurs when the user rotates a dial (Stream Deck +).

```
<span><span>type</span><span> DialRotate</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"dialRotate"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        controller</span><span>: </span><span>"Encoder"</span><span>;</span></span>
<span><span>        coordinates</span><span>: {</span></span>
<span><span>            column</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            row</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        pressed</span><span>: </span><span>boolean</span><span>;</span></span>
<span><span>        resources</span><span>: {</span></span>
<span><span>            [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>        ticks</span><span>: </span><span>number</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "dialRotate"Required **payload**: TPayloadRequired

### DialUp[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#dialup "Direct link to DialUp")

Occurs when the user releases a pressed dial (Stream Deck +). See also `DialDown`.

NB: For other action types see `KeyUp`.

```
<span><span>type</span><span> DialUp</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"dialUp"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        controller</span><span>: </span><span>"Encoder"</span><span>;</span></span>
<span><span>        coordinates</span><span>: {</span></span>
<span><span>            column</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            row</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        resources</span><span>: {</span></span>
<span><span>            [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "dialUp"Required **payload**: TPayloadRequired

### DidReceiveDeepLink[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#didreceivedeeplink "Direct link to DidReceiveDeepLink")

Occurs when Stream Deck receives a deep-link message intended for the plugin. The message is re-routed to the plugin, and provided as part of the payload. One-way deep-link message can be routed to the plugin using the URL format `streamdeck://plugins/message/<PLUGIN_UUID>/{MESSAGE}`.

```
<span><span>type</span><span> DidReceiveDeepLink</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"didReceiveDeepLink"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        url</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "didReceiveDeepLink"Required **payload**: objectRequired

### DidReceiveGlobalSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#didreceiveglobalsettings "Direct link to DidReceiveGlobalSettings")

Occurs when the plugin receives the global settings from Stream Deck.

```
<span><span>type</span><span> DidReceiveGlobalSettings</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"didReceiveGlobalSettings"</span><span>;</span></span>
<span><span>    id</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "didReceiveGlobalSettings"Required **id**: string **payload**: objectRequired

### DidReceivePropertyInspectorMessage[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#didreceivepropertyinspectormessage "Direct link to DidReceivePropertyInspectorMessage")

Occurs when a payload was received from the UI.

```
<span><span>type</span><span> DidReceivePropertyInspectorMessage</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"sendToPlugin"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonValue</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **event**: "sendToPlugin"Required **payload**: JsonValueRequired

### DidReceiveResources[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#didreceiveresources "Direct link to DidReceiveResources")

Occurs when the resources associated with an action instance are requested, or when the the resources were updated in the property inspector.

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
<span><span>              controller</span><span>: </span><span>"Encoder"</span><span> | </span><span>"Keypad"</span><span>;</span></span>
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

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "didReceiveResources"Required **id**: string **payload**: MultiActionPayload | SingleActionPayloadRequired

### DidReceiveSecrets[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#didreceivesecrets "Direct link to DidReceiveSecrets")

Occurs when the plugin receives secrets from Stream Deck.

```
<span><span>type</span><span> DidReceiveSecrets</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"didReceiveSecrets"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        secrets</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "didReceiveSecrets"Required **payload**: objectRequired

### DidReceiveSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#didreceivesettings "Direct link to DidReceiveSettings")

Occurs when the settings associated with an action instance are requested, or when the the settings were updated in the property inspector.

```
<span><span>type</span><span> DidReceiveSettings</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"didReceiveSettings"</span><span>;</span></span>
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
<span><span>              controller</span><span>: </span><span>"Encoder"</span><span> | </span><span>"Keypad"</span><span>;</span></span>
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

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "didReceiveSettings"Required **id**: string **payload**: MultiActionPayload | SingleActionPayloadRequired

### KeyDown[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#keydown "Direct link to KeyDown")

Occurs when the user presses a action down. See also `KeyUp`.

NB: For dials / touchscreens see `DialDown`.

```
<span><span>type</span><span> KeyDown</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"keyDown"</span><span>;</span></span>
<span><span>    payload</span><span>:</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span>;</span></span>
<span><span>              isInMultiAction</span><span>: </span><span>true</span><span>;</span></span>
<span><span>              resources</span><span>: {</span></span>
<span><span>                  [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>              state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              userDesiredState</span><span>: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span>;</span></span>
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

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "keyDown"Required **payload**: MultiActionKeyGesturePayload | SingleActionPayloadRequired

### KeyUp[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#keyup "Direct link to KeyUp")

Occurs when the user releases a pressed action. See also `KeyDown`.

NB: For dials / touchscreens see `DialUp`.

```
<span><span>type</span><span> KeyUp</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"keyUp"</span><span>;</span></span>
<span><span>    payload</span><span>:</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span>;</span></span>
<span><span>              isInMultiAction</span><span>: </span><span>true</span><span>;</span></span>
<span><span>              resources</span><span>: {</span></span>
<span><span>                  [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>              state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              userDesiredState</span><span>: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>        | {</span></span>
<span><span>              controller</span><span>: </span><span>"Keypad"</span><span>;</span></span>
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

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "keyUp"Required **payload**: MultiActionKeyGesturePayload | SingleActionPayloadRequired

### PropertyInspectorDidAppear[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#propertyinspectordidappear "Direct link to PropertyInspectorDidAppear")

Occurs when the property inspector associated with the action becomes visible, i.e. the user selected an action in the Stream Deck application. See also `PropertyInspectorDidDisappear`.

```
<span><span>type</span><span> PropertyInspectorDidAppear</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"propertyInspectorDidAppear"</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "propertyInspectorDidAppear"Required

### PropertyInspectorDidDisappear[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#propertyinspectordiddisappear "Direct link to PropertyInspectorDidDisappear")

Occurs when the property inspector associated with the action becomes invisible, i.e. the user unselected the action in the Stream Deck application. See also `PropertyInspectorDidAppear`.

```
<span><span>type</span><span> PropertyInspectorDidDisappear</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"propertyInspectorDidDisappear"</span><span>;</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "propertyInspectorDidDisappear"Required

### SystemDidWakeUp[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#systemdidwakeup "Direct link to SystemDidWakeUp")

Occurs when the computer wakes up.

```
<span><span>type</span><span> SystemDidWakeUp</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"systemDidWakeUp"</span><span>;</span></span>
<span><span>};</span></span>
```

**event**: "systemDidWakeUp"Required

### TitleParametersDidChange[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#titleparametersdidchange "Direct link to TitleParametersDidChange")

Occurs when the user updates an action's title settings in the Stream Deck application.

```
<span><span>type</span><span> TitleParametersDidChange</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"titleParametersDidChange"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        controller</span><span>: </span><span>"Encoder"</span><span> | </span><span>"Keypad"</span><span>;</span></span>
<span><span>        coordinates</span><span>: {</span></span>
<span><span>            column</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            row</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        resources</span><span>: {</span></span>
<span><span>            [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>        state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>        title</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        titleParameters</span><span>: {</span></span>
<span><span>            fontFamily</span><span>: </span><span>string</span><span>;</span></span>
<span><span>            fontSize</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            fontStyle</span><span>: </span><span>""</span><span> | </span><span>"Bold Italic"</span><span> | </span><span>"Bold"</span><span> | </span><span>"Italic"</span><span> | </span><span>"Regular"</span><span>;</span></span>
<span><span>            fontUnderline</span><span>: </span><span>boolean</span><span>;</span></span>
<span><span>            showTitle</span><span>: </span><span>boolean</span><span>;</span></span>
<span><span>            titleAlignment</span><span>: </span><span>"bottom"</span><span> | </span><span>"middle"</span><span> | </span><span>"top"</span><span>;</span></span>
<span><span>            titleColor</span><span>: </span><span>string</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "titleParametersDidChange"Required **payload**: TPayloadRequired

### TouchTap[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#touchtap "Direct link to TouchTap")

Occurs when the user taps the touchscreen (Stream Deck +).

```
<span><span>type</span><span> TouchTap</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"touchTap"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        controller</span><span>: </span><span>"Encoder"</span><span>;</span></span>
<span><span>        coordinates</span><span>: {</span></span>
<span><span>            column</span><span>: </span><span>number</span><span>;</span></span>
<span><span>            row</span><span>: </span><span>number</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        hold</span><span>: </span><span>boolean</span><span>;</span></span>
<span><span>        resources</span><span>: {</span></span>
<span><span>            [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>        };</span></span>
<span><span>        settings</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>        tapPos</span><span>: [</span><span>x</span><span>: </span><span>number</span><span>, </span><span>y</span><span>: </span><span>number</span><span>];</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "touchTap"Required **payload**: TPayloadRequired

### WillAppear[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#willappear "Direct link to WillAppear")

Occurs when an action appears on the Stream Deck due to the user navigating to another page, profile, folder, etc. This also occurs during startup if the action is on the "front page". An action refers to _all_ types of actions, e.g. keys, dials, touchscreens, pedals, etc.

```
<span><span>type</span><span> WillAppear</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"willAppear"</span><span>;</span></span>
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
<span><span>              controller</span><span>: </span><span>"Encoder"</span><span> | </span><span>"Keypad"</span><span>;</span></span>
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

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "willAppear"Required **payload**: MultiActionPayload | SingleActionPayloadRequired

### WillDisappear[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#willdisappear "Direct link to WillDisappear")

Occurs when an action disappears from the Stream Deck due to the user navigating to another page, profile, folder, etc. An action refers to _all_ types of actions, e.g. keys, dials, touchscreens, pedals, etc.

```
<span><span>type</span><span> WillDisappear</span><span> = {</span></span>
<span><span>    action</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"willDisappear"</span><span>;</span></span>
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
<span><span>              controller</span><span>: </span><span>"Encoder"</span><span> | </span><span>"Keypad"</span><span>;</span></span>
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

**action**: stringRequired **context**: stringRequired **device**: stringRequired **event**: "willDisappear"Required **payload**: MultiActionPayload | SingleActionPayloadRequired

## Commands[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#commands "Direct link to Commands")

Plugins can send the following commands to Stream Deck via their WebSocket connection.

### GetGlobalSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#getglobalsettings "Direct link to GetGlobalSettings")

Gets the global settings associated with the plugin. Causes `DidReceiveGlobalSettings` to be emitted.

```
<span><span>type</span><span> GetGlobalSettings</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"getGlobalSettings"</span><span>;</span></span>
<span><span>    id</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "getGlobalSettings"Required **id**: string

### GetResources[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#getresources "Direct link to GetResources")

Gets the resources (files) associated with the action; these resources are embedded into the action when it is exported, either individually, or as part of a profile.

Available from Stream Deck 7.1.

```
<span><span>type</span><span> GetResources</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"getResources"</span><span>;</span></span>
<span><span>    id</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "getResources"Required **id**: string

### GetSecrets[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#getsecrets "Direct link to GetSecrets")

Gets secrets associated with the plugin.

```
<span><span>type</span><span> GetSecrets</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"getSecrets"</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "getSecrets"Required

### GetSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#getsettings "Direct link to GetSettings")

Gets the settings associated with an instance of an action. Causes `DidReceiveSettings` to be emitted.

```
<span><span>type</span><span> GetSettings</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"getSettings"</span><span>;</span></span>
<span><span>    id</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "getSettings"Required **id**: string

### LogMessage[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#logmessage "Direct link to LogMessage")

Logs a message to the file-system.

```
<span><span>type</span><span> LogMessage</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"logMessage"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        message</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "logMessage"Required **payload**: TPayloadRequired

### OpenUrl[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#openurl "Direct link to OpenUrl")

Opens the URL in the user's default browser.

```
<span><span>type</span><span> OpenUrl</span><span> = {</span></span>
<span><span>    event</span><span>: </span><span>"openUrl"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        url</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**event**: "openUrl"Required **payload**: TPayloadRequired

### SendToPropertyInspector[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#sendtopropertyinspector "Direct link to SendToPropertyInspector")

Sends a message to the property inspector.

```
<span><span>type</span><span> SendToPropertyInspector</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"sendToPropertyInspector"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonValue</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "sendToPropertyInspector"Required **payload**: JsonValueRequired

### SetFeedback[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#setfeedback "Direct link to SetFeedback")

Set's the feedback of an existing layout associated with an action instance.

```
<span><span>type</span><span> SetFeedback</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setFeedback"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        [</span><span>string</span><span>]:</span></span>
<span><span>            | </span><span>string</span></span>
<span><span>            | </span><span>number</span></span>
<span><span>            | {</span></span>
<span><span>                  background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  bar_bg_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  bar_border_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  bar_fill_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  border_w</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                  enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>                  opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>                  range</span><span>?: {</span></span>
<span><span>                      max</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                      min</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                  };</span></span>
<span><span>                  subtype</span><span>?: </span><span>0</span><span> | </span><span>1</span><span> | </span><span>2</span><span> | </span><span>3</span><span> | </span><span>4</span><span>;</span></span>
<span><span>                  value</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                  zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              }</span></span>
<span><span>            | {</span></span>
<span><span>                  background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  bar_bg_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  bar_border_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  bar_fill_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  bar_h</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                  border_w</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                  enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>                  opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>                  range</span><span>?: {</span></span>
<span><span>                      max</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                      min</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                  };</span></span>
<span><span>                  subtype</span><span>?: </span><span>0</span><span> | </span><span>1</span><span> | </span><span>2</span><span> | </span><span>3</span><span> | </span><span>4</span><span>;</span></span>
<span><span>                  value</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                  zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              }</span></span>
<span><span>            | {</span></span>
<span><span>                  background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>                  opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>                  value</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              }</span></span>
<span><span>            | {</span></span>
<span><span>                  alignment</span><span>?: </span><span>"center"</span><span> | </span><span>"left"</span><span> | </span><span>"right"</span><span>;</span></span>
<span><span>                  background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  color</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>                  font</span><span>?: {</span></span>
<span><span>                      size</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                      weight</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                  };</span></span>
<span><span>                  opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>                  "text-overflow"</span><span>?: </span><span>"clip"</span><span> | </span><span>"ellipsis"</span><span> | </span><span>"fade"</span><span>;</span></span>
<span><span>                  value</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>                  zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setFeedback"Required **payload**: TPayloadRequired

### SetFeedbackLayout[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#setfeedbacklayout "Direct link to SetFeedbackLayout")

Sets the layout associated with an action instance.

```
<span><span>type</span><span> SetFeedbackLayout</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setFeedbackLayout"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        layout</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setFeedbackLayout"Required **payload**: TPayloadRequired

### SetGlobalSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#setglobalsettings "Direct link to SetGlobalSettings")

Sets the global settings associated with the plugin.

```
<span><span>type</span><span> SetGlobalSettings</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setGlobalSettings"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setGlobalSettings"Required **payload**: JsonObjectRequired

### SetImage[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#setimage "Direct link to SetImage")

Sets the image associated with an action instance.

```
<span><span>type</span><span> SetImage</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setImage"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        image</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>        target</span><span>?: </span><span>Target</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setImage"Required **payload**: TPayloadRequired

### SetResources[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#setresources "Direct link to SetResources")

Sets the resources (files) associated with the action; these resources are embedded into the action when it is exported, either individually, or as part of a profile.

Available from Stream Deck 7.1.

```
<span><span>type</span><span> SetResources</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setResources"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        [</span><span>key</span><span>: </span><span>string</span><span>]: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setResources"Required **payload**: TPayloadRequired

### SetSettings[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#setsettings "Direct link to SetSettings")

Sets the settings associated with an instance of an action.

```
<span><span>type</span><span> SetSettings</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setSettings"</span><span>;</span></span>
<span><span>    payload</span><span>: </span><span>JsonObject</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setSettings"Required **payload**: JsonObjectRequired

### SetState[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#setstate "Direct link to SetState")

Sets the current state of an action instance.

```
<span><span>type</span><span> SetState</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setState"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        state</span><span>: </span><span>number</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setState"Required **payload**: TPayloadRequired

### SetTitle[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#settitle "Direct link to SetTitle")

Sets the title displayed for an instance of an action.

```
<span><span>type</span><span> SetTitle</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setTitle"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        state</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>        target</span><span>?: </span><span>Target</span><span>;</span></span>
<span><span>        title</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setTitle"Required **payload**: TPayloadRequired

### SetTriggerDescription[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#settriggerdescription "Direct link to SetTriggerDescription")

Sets the trigger descriptions associated with an encoder action instance.

```
<span><span>type</span><span> SetTriggerDescription</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"setTriggerDescription"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        longTouch</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        push</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        rotate</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>        touch</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "setTriggerDescription"Required **payload**: TPayloadRequired

### ShowAlert[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#showalert "Direct link to ShowAlert")

Temporarily shows an alert (i.e. warning), in the form of an exclamation mark in a yellow triangle, on the action instance. Used to provide visual feedback when an action failed.

```
<span><span>type</span><span> ShowAlert</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"showAlert"</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "showAlert"Required

### ShowOk[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#showok "Direct link to ShowOk")

Temporarily shows an "OK" (i.e. success), in the form of a check-mark in a green circle, on the action instance. Used to provide visual feedback when an action successfully executed.

```
<span><span>type</span><span> ShowOk</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"showOk"</span><span>;</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **event**: "showOk"Required

### SwitchToProfile[](https://docs.elgato.com/streamdeck/sdk/references/websocket/plugin/#switchtoprofile "Direct link to SwitchToProfile")

Switches to the profile, as distributed by the plugin, on the specified device.

NB: Plugins may only switch to profiles distributed with the plugin, as defined within the manifest, and cannot access user-defined profiles.

```
<span><span>type</span><span> SwitchToProfile</span><span> = {</span></span>
<span><span>    context</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    device</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    event</span><span>: </span><span>"switchToProfile"</span><span>;</span></span>
<span><span>    payload</span><span>: {</span></span>
<span><span>        page</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>        profile</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>    };</span></span>
<span><span>};</span></span>
```

**context**: stringRequired **device**: stringRequired **event**: "switchToProfile"Required **payload**: TPayloadRequired