Embedding resources, such audio or configuration files, into instances of actions actions makes them more portable, allowing you and others to easily share fully-working profiles that depend on your plugin.

## Overview[](https://docs.elgato.com/streamdeck/sdk/guides/resources/#overview "Direct link to Overview")

Resources can be embedded into instances of actions, making them self-contained and more portable. When an action with embedded resources is exported, the resources are compressed along with the necessary metadata into the `.streamDeckProfile` or `.streamDeckAction` file, making it easy to share profiles on Marketplace that depend on your plugin.

Examples of types of actions where this can be useful include:

-   Audio players and soundboards
-   App scripts, such as with Photoshop Play action
-   External configuration files

note

Available from Stream Deck 7.1 or higher.

## Embedding Resources[](https://docs.elgato.com/streamdeck/sdk/guides/resources/#embedding-resources "Direct link to Embedding Resources")

Much like [settings](https://docs.elgato.com/streamdeck/sdk/guides/settings), resources are associated with an instance of an action, and are mapped using a similar interface:

-   [`action.setResources`](https://docs.elgato.com/streamdeck/sdk/guides/actions#setresources) - Sets resources associated with an instance of an action.
-   [`action.getResources`](https://docs.elgato.com/streamdeck/sdk/guides/actions#getresources) - Gets resources associated with an instance of an action.
-   [`SingletonAction.onDidReceiveResources`](https://docs.elgato.com/streamdeck/sdk/guides/actions#ondidreceiveresources) - Occurs when resources are updated within the property inspector.

tip

Resources use Stream Deck's new message identifiers, meaning `onDidReceiveResources` is **only** called when the resources were updated within the property inspector. This makes it easier to distinguish between when resources were updated versus requested.

Unlike settings, the payload is not arbitrary and must be a map of key/file-path to allow Stream Deck to update file paths when importing an action.

The following example demonstrates embedding a resource into an instance of an action:

Embedding resources

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>type</span><span> DidReceiveSettingsEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.audio.play"</span><span> })</span></span>
<span><span>class</span><span> PlayAudio</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the settings are updated.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> async</span><span> onDidReceiveSettings</span><span>(</span><span>ev</span><span>: </span><span>DidReceiveSettingsEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<!-- -->
<span><span>await</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>setResources</span><span>({</span></span>
<span><span>audioFile:</span><span> ev</span><span>.</span><span>payload</span><span>.</span><span>settings</span><span>.</span><span>userSelectedFile</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>userSelectedFile</span><span>: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
```

With the resource now embedded into the action, the file be compressed alongside the action's metadata when the action or parent profile is exported.

## Accessing Resources[](https://docs.elgato.com/streamdeck/sdk/guides/resources/#accessing-resources "Direct link to Accessing Resources")

Accessing embedded resource file paths can be achieved using either:

-   [`action.getResources`](https://docs.elgato.com/streamdeck/sdk/guides/actions#getresources)
-   [`SingletonAction.onDidReceiveResources`](https://docs.elgato.com/streamdeck/sdk/guides/actions#ondidreceiveresources)

Continuing from the above `PlayAction` example, the following demonstrates playing the embedded audio file when the action's key down occurs.

Accessing resources

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>type</span><span> DidReceiveSettingsEvent</span><span>, </span><span>type</span><span> KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>import</span><span> { </span><span>audioService</span><span> } </span><span>from</span><span> "./audio-service"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.audio.play"</span><span> })</span></span>
<span><span>class</span><span> PlayAudio</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the settings are updated.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> async</span><span> onDidReceiveSettings</span><span>(</span><span>ev</span><span>: </span><span>DidReceiveSettingsEvent</span><span>&lt;</span><span>Settings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>await</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>setResources</span><span>({</span></span>
<span><span>audioFile:</span><span> ev</span><span>.</span><span>payload</span><span>.</span><span>settings</span><span>.</span><span>userSelectedFile</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the key is pressed down.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> async</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<!-- -->
<span><span>const</span><span> filePath</span><span> = </span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>resources</span><span>.</span><span>audioFile</span><span>;</span></span>
<span><span>if</span><span> (</span><span>filePath</span><span>) {</span></span>
<span><span>await</span><span> audioService</span><span>.</span><span>play</span><span>(</span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>resources</span><span>.</span><span>audioFile</span><span>);</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>type</span><span> Settings</span><span> = {</span></span>
<span><span>userSelectedFile</span><span>: </span><span>string</span><span>;</span></span>
<span><span>};</span></span>
```

## File Paths[](https://docs.elgato.com/streamdeck/sdk/guides/resources/#file-paths "Direct link to File Paths")

When setting resources, the payload must be a map of file paths identifiable by a key, for example:

Original action resources

```
<span><span>{</span></span>
<span><span>    fileOne</span><span>: </span><span>"C:</span><span>\\</span><span>audio</span><span>\\</span><span>track.mp3"</span><span>,</span></span>
<span><span>    fileTwo</span><span>: </span><span>"C:</span><span>\\</span><span>config.json"</span></span>
<span><span>}</span></span>
```

Using this map structure ensures Stream Deck can mutate the file paths when an action or profile is imported. For example, if the above action were to be exported and imported into another Stream Deck, the file paths may look as follows:

Imported action resources

```
<span><span>{</span></span>
<span><span>    fileOne</span><span>: </span><span>"C:</span><span>\\</span><span>...</span><span>\\</span><span>7ae61d68-6882-41dd-8e90-3c54114fa2cf</span><span>\\</span><span>track.mp3"</span><span>,</span></span>
<span><span>    fileTwo</span><span>: </span><span>"C:</span><span>\\</span><span>...</span><span>\\</span><span>7ae61d68-6882-41dd-8e90-3c54114fa2cf</span><span>\\</span><span>config.json"</span></span>
<span><span>}</span></span>
```

tip

The file name of an embedded resource is unchanged when exporting / importing an action.