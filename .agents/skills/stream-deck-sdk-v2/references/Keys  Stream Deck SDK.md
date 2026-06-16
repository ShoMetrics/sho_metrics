One of the two primary types of actions available to Stream Deck plugins; keys are found on all Stream Deck devices, and allow users to activate your plugin's functionality.

## What Are Keys[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#what-are-keys "Direct link to What Are Keys")

Keys are your plugin's actions located on a Stream Deck canvas, for example on Stream Deck XL, Stream Deck Pedal, etc. They provide visual information to users in the form of a [title](https://docs.elgato.com/streamdeck/sdk/guides/keys/#titles) and [image](https://docs.elgato.com/streamdeck/sdk/guides/keys/#images), and can be activated by a user interacting with a physical Stream Deck device.

![Screenshot of Stream Deck software highlighting an action key](https://docs.elgato.com/img/streamdeck/sdk/keys.png)

## States[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#states "Direct link to States")

The state of a key action, configured within the [manifest](https://docs.elgato.com/streamdeck/sdk/references/manifest#action-states), determines an action's behavior and defaults, for example the image shown on the canvas. All key actions must have at least one state, however they can have multiple states.

### Multi-State Keys[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#multi-state-keys "Direct link to Multi-State Keys")

In cases where your key action represents toggle functionality, for example on/off or mute/un-mute, you can choose to configure two states within the manifest.

When supporting two states, the state is toggled when the user presses the key, with the new state index available via the payload information.

Additionally, for action keys that support two states, users have the option of configuring will have the option to configure the icon for each state within Stream Deck:

![Screenshot of Stream Deck software highlighting an actions's states](https://docs.elgato.com/img/streamdeck/sdk/states.png)

Maximum number of states

Stream Deck supports up to two states; although adding more states is possible within the manifest, its functionality is not fully supported.

### States In Multi-Actions[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#states-in-multi-actions "Direct link to States In Multi-Actions")

When your action has multiple states, it's important to assign a [`Name`](https://docs.elgato.com/streamdeck/sdk/references/manifest#state-name) to each state, within the manifest. Doing so allows users to specify their desired state when using your action in a multi-action.

The following image shows the Discord "Mute" action which has two states, "Mute" and "Unmute".

![](https://docs.elgato.com/img/streamdeck/sdk/multi-action.png)

The desired state can then be accessed, as the index (for example 0 or 1), within your plugin in the following way:

Accessing the user desired state

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example Discord Mute action.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.discord.mute"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> Mute</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>) {</span></span>
<span><span>if</span><span> (</span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>isInMultiAction</span><span>) {</span></span>
<span><span>// We can access the user's desired state via...</span></span>
<span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>userDesiredState</span><span>; </span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

## Titles[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#titles "Direct link to Titles")

All actions have a title; in the case of a key action, the title is rendered either at the top, middle, or bottom of the key, on-top of the image. Your plugin can define a [default title](https://docs.elgato.com/streamdeck/sdk/references/manifest#state-title) within the manifest, and update it using the [`setTitle`](https://docs.elgato.com/streamdeck/sdk/guides/keys/#settitle) command[†](https://docs.elgato.com/streamdeck/sdk/guides/keys/#display-precedence).

### Setting Titles[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#setting-titles "Direct link to Setting Titles")

The follow example demonstrates updating the title an action on key down.

Setting action title

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example action that updates the title.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>) {</span></span>
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setTitle</span><span>(</span><span>"Hello world!"</span><span>); </span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

You can also update the title on a more granular level using options.

Setting action title for specified state

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span>, </span><span>Target</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example action that updates the title.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>) {</span></span>
<!-- -->
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setTitle</span><span>(</span><span>"Hello world!"</span><span>, {</span></span>
<span><span>state:</span><span> 0</span><span>,</span></span>
<span><span>target:</span><span> Target</span><span>.</span><span>Hardware</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

### User Changes[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#user-changes "Direct link to User Changes")

Your plugin can monitor for changes the user makes to the title using the [`onTitleParameterDidChange`](https://docs.elgato.com/streamdeck/sdk/guides/actions#ontitleparametersdidchange) event.

## Images[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#images "Direct link to Images")

Your plugin can update an action key's image[†](https://docs.elgato.com/streamdeck/sdk/guides/keys/#display-precedence) using the [`setImage`](https://docs.elgato.com/streamdeck/sdk/guides/keys/#setimage) command. The `setImage` function accepts a path to an image file or an [image data URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs) with base64 encoded data. Stream Deck supports multiple image formats:

-   SVG - `image/svg+xml` (recommended).
-   JPG/JPEG - `image/jpeg`
-   PNG - `image/png`
-   WEBP - `image/webp`

Animated image formats

The `setImage` function does not support animated image formats, such as GIF.

### From SVG[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#from-svg "Direct link to From SVG")

The image of a key action be be updated using an encoded SVG string, and is useful if your plugin needs to customize the image before rendering.

Setting action image using a dynamic SVG

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example action that updates the key action image from an SVG on key press.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>&lt;</span><span>CounterSettings</span><span>&gt;) {</span></span>
<span><span>const</span><span> { </span><span>count</span><span> } = </span><span>ev</span><span>.</span><span>payload</span><span>.</span><span>settings</span><span>;</span></span>
<span><span>const</span><span> isRed</span><span> = </span><span>count</span><span> % </span><span>2</span><span> === </span><span>0</span><span>;</span></span>
<span><span>const</span><span> svg</span><span> = </span><span>`&lt;svg width="100" height="100"&gt;</span></span>
<span><span>&lt;circle fill="</span><span>${</span><span>isRed</span><span> ?</span><span> "red"</span><span> :</span><span> "blue"</span><span>}</span><span>" r="45" cx="50" cy="50" &gt;&lt;/circle&gt;</span></span>
<span><span>&lt;/svg&gt;`</span><span>;</span></span>
<span></span>
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setImage</span><span>(</span><span>`data:image/svg+xml,</span><span>${</span><span>encodeURIComponent</span><span>(</span><span>svg</span><span>)</span><span>}</span><span>`</span><span>); </span></span>
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setSettings</span><span>({ </span><span>count:</span><span> count</span><span> + </span><span>1</span><span> });</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>type</span><span> CounterSettings</span><span> = {</span></span>
<span><span>count</span><span>: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
```

### From Data URL[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#from-data-url "Direct link to From Data URL")

The image of a key action can be updated using an [image data URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs) with a multitude of [MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#image_types) and base64 encoded data.

Setting action image using image data URL

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example action that updates the key action image from a data URL on key press.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>) {</span></span>
<!-- -->
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setImage</span><span>(</span></span>
<span><span>// base64 data URL</span></span>
<span><span>"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAIAAADajyQQAAAFF2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNS41LjAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICAgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIgogICAgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlmLzEuMC8iCiAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyIKICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgeG1wOkNyZWF0ZURhdGU9IjIwMjQtMDgtMTNUMTU6MDA6MTUtMDQwMCIKICAgeG1wOk1vZGlmeURhdGU9IjIwMjQtMDgtMTNUMTU6MDE6NTMtMDQ6MDAiCiAgIHhtcDpNZXRhZGF0YURhdGU9IjIwMjQtMDgtMTNUMTU6MDE6NTMtMDQ6MDAiCiAgIHBob3Rvc2hvcDpEYXRlQ3JlYXRlZD0iMjAyNC0wOC0xM1QxNTowMDoxNS0wNDAwIgogICBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIgogICBwaG90b3Nob3A6SUNDUHJvZmlsZT0ic1JHQiBJRUM2MTk2Ni0yLjEiCiAgIGV4aWY6UGl4ZWxYRGltZW5zaW9uPSI3MiIKICAgZXhpZjpQaXhlbFlEaW1lbnNpb249IjcyIgogICBleGlmOkNvbG9yU3BhY2U9IjEiCiAgIHRpZmY6SW1hZ2VXaWR0aD0iNzIiCiAgIHRpZmY6SW1hZ2VMZW5ndGg9IjcyIgogICB0aWZmOlJlc29sdXRpb25Vbml0PSIyIgogICB0aWZmOlhSZXNvbHV0aW9uPSIzMDAvMSIKICAgdGlmZjpZUmVzb2x1dGlvbj0iMzAwLzEiPgogICA8eG1wTU06SGlzdG9yeT4KICAgIDxyZGY6U2VxPgogICAgIDxyZGY6bGkKICAgICAgc3RFdnQ6YWN0aW9uPSJwcm9kdWNlZCIKICAgICAgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWZmaW5pdHkgRGVzaWduZXIgMiAyLjUuMyIKICAgICAgc3RFdnQ6d2hlbj0iMjAyNC0wOC0xM1QxNTowMTo1My0wNDowMCIvPgogICAgPC9yZGY6U2VxPgogICA8L3htcE1NOkhpc3Rvcnk+CiAgPC9yZGY6RGVzY3JpcHRpb24+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+xLBe4AAAAYFpQ0NQc1JHQiBJRUM2MTk2Ni0yLjEAACiRdZHLS0JBFIc/tUhKK6pFixYS1sqiB0htgpSwQELMIKuN3nwEPi73KiFtg7ZCQdSm16L+gtoGrYOgKIJo7bqoTcXt3AyMyBnOOd/8Zs5h5gxYIxklqzcMQTZX0MIBn2shuuhqqmDHSYdYa0zR1clQKEjd8XaHxYw3A2at+uf+HS0rCV0Bi114QlG1gvC0cHCtoJq8LdylpGMrwqfCHk0uKHxr6vEqV0xOVfnDZC0S9oO1XdiV+sXxX6yktaywvBx3NlNUfu5jvsSRyM3PSewV60EnTAAfLmaYwo+XYcbFexlghEFZUSd/6Dt/lrzkKuJVSmiskiJNAY+oRamekJgUPSEzQ8ns/9++6snRkWp1hw8anwzjpQ+atuCzbBjvh4bxeQS2R7jI1fLzBzD2Knq5prn3oW0Dzi5rWnwHzjeh+0GNabFvySZmTSbh+QScUei8hualas9+9jm+h8i6fNUV7O5Bv5xvW/4CDa5nvRjbKwoAAAAJcEhZcwAALiMAAC4jAXilP3YAAABvSURBVGiB7c8BDcAgAMAwwBzK0M1VPM+eVsE279njj9bXAW8xVmOsxliNsRpjNcZqjNUYqzFWY6zGWI2xGmM1xmqM1RirMVZjrMZYjbEaYzXGaozVGKsxVmOsxliNsRpjNcZqjNUYqzFWY6zGWM0D2SQCW/zbGkwAAAAASUVORK5CYII="</span><span>,</span></span>
<span><span>);</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

### From File[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#from-file "Direct link to From File")

You can update the image of a key action directly from a file located on disk.

Setting action image using image path

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example action that updates the key action image from a file.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>) {</span></span>
<!-- -->
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setImage</span><span>(</span><span>"imgs/actions/counter/key.png"</span><span>); </span><span>// image path</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

### Options[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#options "Direct link to Options")

You can also provide optional `ImageOptions` to specify a `Target` (hardware, software, or both) and a state (0 or 1), when updating images of an action key.

Setting action image with specified target options

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>KeyDownEvent</span><span>, </span><span>SingletonAction</span><span>, </span><span>Target</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Example action that updates the key action image with additional options.</span></span>
<span><span> */</span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.hello-world.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user presses the key action.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onKeyDown</span><span>(</span><span>ev</span><span>: </span><span>KeyDownEvent</span><span>) {</span></span>
<!-- -->
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setImage</span><span>(</span><span>"imgs/actions/counter/key.png"</span><span>, {</span></span>
<span><span>target:</span><span> Target</span><span>.</span><span>HardwareAndSoftware</span><span>,</span></span>
<span><span>state:</span><span> 1</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

## Display Precedence[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#display-precedence "Direct link to Display Precedence")

When rendering an action key's title and image, a specific order precedence is followed, thus determining what is rendered on the key.

The following list defines the precedence, with the first item being the highest priority, and last being the lowest priority:

1.  User defined titles and/or images.
2.  Titles and/or images set at runtime using `setTitle`/`setImage`.
3.  Default titles and/or images defined within the manifest.

## Temporary Feedback[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#temporary-feedback "Direct link to Temporary Feedback")

There may be times when you want to show user temporary feedback on a key, for example when an action succeeds or fails. To achieve this, you can use the [`showOk`](https://docs.elgato.com/streamdeck/sdk/guides/keys/#showok) and [`showAlert`](https://docs.elgato.com/streamdeck/sdk/guides/keys/#showalert) functions on the `action`.

![Screenshot of Stream Deck software showing action feedback](https://docs.elgato.com/img/streamdeck/sdk/feedback.png)

tip

It is best practice to accompany `showAlert` with a [log entry](https://docs.elgato.com/streamdeck/sdk/guides/logging) to help diagnose what caused the warning.

## Events[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#events "Direct link to Events")

In addition to the [action events](https://docs.elgato.com/streamdeck/sdk/guides/actions#events) found on both keys and dials, keys also receive the following events in the form of overridable methods on the `SingletonAction` class.

### onKeyDown[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#onkeydown "Direct link to onKeyDown")

### onKeyUp[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#onkeyup "Direct link to onKeyUp")

## Commands[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#commands "Direct link to Commands")

The following commands are available to key actions.

tip

Some events are applicable to both dials and keys, such as [`onWillAppear`](https://docs.elgato.com/streamdeck/sdk/guides/actions#onwillappear). To invoke a key-only command within these event handlers, you need to first assert the action is a key using [`Action.isKey()`](https://docs.elgato.com/streamdeck/sdk/guides/actions#iskey).

### getResources[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#getresources "Direct link to getResources")

### getSettings[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#getsettings "Direct link to getSettings")

### setImage[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#setimage "Direct link to setImage")

### setResources[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#setresources "Direct link to setResources")

### setSettings[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#setsettings "Direct link to setSettings")

### setState[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#setstate "Direct link to setState")

### setTitle[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#settitle "Direct link to setTitle")

### showAlert[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#showalert "Direct link to showAlert")

### showOk[](https://docs.elgato.com/streamdeck/sdk/guides/keys/#showok "Direct link to showOk")