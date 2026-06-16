Dial actions are a combination of two parts of Stream Deck, the dial itself and a portion of the touch strip.

## What is an Encoder?[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#what-is-an-encoder "Direct link to What is an Encoder?")

The dial and portion of the touch strip that make up a dial action are collectively known as an "Encoder". Combined, they allow for your plugin to receive dial and touch events, as well as provide feedback on the touch strip in the form of layouts.

![Screenshot of Stream Deck software highlighting an action slot](https://docs.elgato.com/img/streamdeck/sdk/dials.png)

## Layouts[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#layouts "Direct link to Layouts")

Layouts are used to draw information about your actions on the touch display. Stream deck has a few [built-in layouts](https://docs.elgato.com/streamdeck/sdk/guides/dials/#built-in-layouts), but you can also build your own [custom layouts](https://docs.elgato.com/streamdeck/sdk/guides/dials/#custom-layouts) using JSON files included in your plugin folder. Layouts are composed of [layout items](https://docs.elgato.com/streamdeck/sdk/references/touch-strip-layout#definitions) that can be updated programmatically.

### Built-in Layouts[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#built-in-layouts "Direct link to Built-in Layouts")

There are several built-in layouts available when rendering information on the Stream Deck + touch strip.

-   Icon ($X1)
-   Canvas ($A0)
-   Value ($A1)
-   Indicator ($B1)
-   Gradient indicator ($B2)
-   Double indicator ($C1)

![Preview of the built-in layout $X1. There is a title placeholder, and an icon placeholder](https://docs.elgato.com/img/streamdeck/sdk/layout-x1.png)

JSON file for pre-defined layout "$X1"

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/layout.json"</span><span>,</span></span>
<span><span>    "id"</span><span>: </span><span>"$X1"</span><span>,</span></span>
<span><span>    "items"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "key"</span><span>: </span><span>"title"</span><span>,</span></span>
<span><span>            "type"</span><span>: </span><span>"text"</span><span>,</span></span>
<span><span>            "rect"</span><span>: [</span><span>16</span><span>, </span><span>10</span><span>, </span><span>136</span><span>, </span><span>24</span><span>],</span></span>
<span><span>            "font"</span><span>: { </span><span>"size"</span><span>: </span><span>16</span><span>, </span><span>"weight"</span><span>: </span><span>600</span><span> },</span></span>
<span><span>            "alignment"</span><span>: </span><span>"left"</span></span>
<span><span>        },</span></span>
<span><span>        {</span></span>
<span><span>            "key"</span><span>: </span><span>"icon"</span><span>,</span></span>
<span><span>            "type"</span><span>: </span><span>"pixmap"</span><span>,</span></span>
<span><span>            "rect"</span><span>: [</span><span>76</span><span>, </span><span>40</span><span>, </span><span>48</span><span>, </span><span>48</span><span>]</span></span>
<span><span>        }</span></span>
<span><span>    ]</span></span>
<span><span>}</span></span>
```

#### Manifest[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#manifest "Direct link to Manifest")

Built-in layouts can be used as an action's default layout by setting the [`Actions[].Encoder.layout`](https://docs.elgato.com/streamdeck/sdk/references/manifest#encoder-layout) property within the manifest. For example:

Manifest JSON file, with an action referencing a built-in layout

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/manifest.json"</span><span>,</span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Icon"</span><span>: </span><span>"action-icon"</span><span>,</span></span>
<span><span>            "Name"</span><span>: </span><span>"Action One"</span><span>,</span></span>
<span><span>            "Controllers"</span><span>: [</span><span>"Encoder"</span><span>],</span></span>
<!-- -->
<span><span>            "Encoder"</span><span>: {</span></span>
<span><span>                "layout"</span><span>: </span><span>"$B1"</span></span>
<span><span>            },</span></span>
<span><span>            "States"</span><span>: [</span></span>
<span><span>                {</span></span>
<span><span>                    "Image"</span><span>: </span><span>"state-image"</span></span>
<span><span>                }</span></span>
<span><span>            ],</span></span>
<span><span>            "UUID"</span><span>: </span><span>"come.elgato.test.one"</span></span>
<span><span>        }</span></span>
<span><span>    ],</span></span>
<span><span>    "Author"</span><span>: </span><span>"Elgato"</span><span>,</span></span>
<span><span>    "Software"</span><span>: {</span></span>
<span><span>        "MinimumVersion"</span><span>: </span><span>"6.6"</span></span>
<span><span>    }</span></span>
<span><span>    // ...</span></span>
<span><span>}</span></span>
```

#### Programmatically[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#programmatically "Direct link to Programmatically")

Built-in layouts can also be assigned to an instance of an action programmatically using the [`setFeedbackLayout`](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setfeedbacklayout) function, for example:

Action class updating its layout to a built-in layout

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>SingletonAction</span><span>, </span><span>WillAppearEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.test.one"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the action will appear.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onWillAppear</span><span>(</span><span>ev</span><span>: </span><span>WillAppearEvent</span><span>): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>if</span><span> (</span><span>ev</span><span>.</span><span>action</span><span>.</span><span>isDial</span><span>()) {</span></span>
<span><span>return</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>setFeedbackLayout</span><span>(</span><span>"$B1"</span><span>); </span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

### Custom Layouts[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#custom-layouts "Direct link to Custom Layouts")

Custom layouts are composed of [layout items](https://docs.elgato.com/streamdeck/sdk/references/touch-strip-layout) provided in a JSON file located in the `*.sdPlugin` folder.

warning

Layouts have a canvas size of 200 × 100 px. If items fall outside of these bounds, Stream Deck will not render the layout.

#### Manifest[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#manifest-1 "Direct link to Manifest")

Custom layouts can be used as an action's default layout by setting the [`Actions[].Encoder.layout`](https://docs.elgato.com/streamdeck/sdk/references/manifest#encoder-layout) property within the manifest. For example:

Manifest JSON file, with an action referencing a custom layout file

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/manifest.json"</span><span>,</span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Icon"</span><span>: </span><span>"action-icon"</span><span>,</span></span>
<span><span>            "Name"</span><span>: </span><span>"Action One"</span><span>,</span></span>
<span><span>            "Controllers"</span><span>: [</span><span>"Encoder"</span><span>],</span></span>
<!-- -->
<span><span>            "Encoder"</span><span>: {</span></span>
<span><span>                "layout"</span><span>: </span><span>"custom-layout.json"</span></span>
<span><span>            },</span></span>
<span><span>            "States"</span><span>: [</span></span>
<span><span>                {</span></span>
<span><span>                    "Image"</span><span>: </span><span>"state-image"</span></span>
<span><span>                }</span></span>
<span><span>            ],</span></span>
<span><span>            "UUID"</span><span>: </span><span>"come.elgato.test.one"</span></span>
<span><span>        }</span></span>
<span><span>    ],</span></span>
<span><span>    "Author"</span><span>: </span><span>"Elgato"</span><span>,</span></span>
<span><span>    "Software"</span><span>: {</span></span>
<span><span>        "MinimumVersion"</span><span>: </span><span>"6.6"</span></span>
<span><span>    }</span></span>
<span><span>    // ...</span></span>
<span><span>}</span></span>
```

#### Programmatically[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#programmatically-1 "Direct link to Programmatically")

Custom layouts can also be assigned to an instance of an action programmatically using the [`setFeedbackLayout`](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setfeedbacklayout) function, for example:

Action class updating its layout to a custom layout file

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>SingletonAction</span><span>, </span><span>WillAppearEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.test.one"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span> {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the action will appear.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onWillAppear</span><span>(</span><span>ev</span><span>: </span><span>WillAppearEvent</span><span>): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; {</span></span>
<span><span>if</span><span> (</span><span>ev</span><span>.</span><span>action</span><span>.</span><span>isDial</span><span>()) {</span></span>
<span><span>return</span><span> ev</span><span>.</span><span>action</span><span>.</span><span>setFeedbackLayout</span><span>(</span><span>"custom-layout.json"</span><span>); </span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

#### Debugging[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#debugging "Direct link to Debugging")

You can debug your custom layouts using the CLI tool's [`validate`](https://docs.elgato.com/streamdeck/cli/commands/validate) command.

For example, here is a layout in which the item would render outside the canvas.

Invalid custom layout

```
<span><span>{</span></span>
<span><span>    "$schema"</span><span>: </span><span>"https://schemas.elgato.com/streamdeck/plugins/layout.json"</span><span>,</span></span>
<span><span>    "id"</span><span>: </span><span>"hello-world"</span><span>,</span></span>
<span><span>    "items"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "key"</span><span>: </span><span>"title"</span><span>,</span></span>
<span><span>            "type"</span><span>: </span><span>"text"</span><span>,</span></span>
<!-- -->
<span><span>            "rect"</span><span>: [</span><span>100</span><span>, </span><span>0</span><span>, </span><span>136</span><span>, </span><span>50</span><span>], </span><span>// x (100) + width (136) exceeds 200</span></span>
<span><span>            "font"</span><span>: { </span><span>"size"</span><span>: </span><span>32</span><span>, </span><span>"weight"</span><span>: </span><span>600</span><span> },</span></span>
<span><span>            "alignment"</span><span>: </span><span>"left"</span></span>
<span><span>        }</span></span>
<span><span>    ]</span></span>
<span><span>}</span></span>
```

The CLI tool would provide the following output:

Layout validation output

```
<span><span>8:13</span><span>  error</span><span>    items[0].rect[0]</span><span> must</span><span> not</span><span> be</span><span> outside</span><span> of</span><span> the</span><span> canvas</span></span>
<span><span>8:13</span><span>  error</span><span>    └</span><span> Width</span><span> and</span><span> height,</span><span> relative</span><span> to</span><span> the</span><span> x</span><span> and</span><span> y,</span><span> must</span><span> be</span><span> within</span><span> the</span><span> 200x100</span><span> px</span><span> canvas</span></span>
```

warning

If a layout item is anticipated to render outside of the given bounds, Stream Deck will not render the layout and instead provide details in [Stream Deck app logs](https://docs.elgato.com/streamdeck/sdk/guides/logging#stream-deck-logs).

## Updating Layouts[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#updating-layouts "Direct link to Updating Layouts")

You can update the values in a layout programmatically using the [`setFeedback`](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setfeedback) function, by referencing layout items by their `key`. You can directly update the value of the item or set specific properties of the item. Properties not included in the payload will remain unchanged.

Action class updating a $B1 layout via value

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>DialUpEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.layout-image-test.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>CounterSettings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user releases a dial.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onDialUp</span><span>(</span><span>ev</span><span>: </span><span>DialUpEvent</span><span>&lt;</span><span>CounterSettings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; | </span><span>void</span><span> {</span></span>
<!-- -->
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setFeedback</span><span>({</span></span>
<span><span>title:</span><span> "Half way there"</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Settings for </span><span>{</span><span>@link</span><span> IncrementCounter</span><span>}</span><span>.</span></span>
<span><span> */</span></span>
<span><span>type</span><span> CounterSettings</span><span> = {</span></span>
<span><span>count</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>incrementBy</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
```

Action class updating a $B1 layout via properties

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>DialUpEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.layout-image-test.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>CounterSettings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user releases a dial.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onDialUp</span><span>(</span><span>ev</span><span>: </span><span>DialUpEvent</span><span>&lt;</span><span>CounterSettings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; | </span><span>void</span><span> {</span></span>
<!-- -->
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setFeedback</span><span>({</span></span>
<span><span>indicator:</span><span> {</span></span>
<span><span>value:</span><span> 50</span><span>,</span></span>
<span><span>},</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Settings for </span><span>{</span><span>@link</span><span> IncrementCounter</span><span>}</span><span>.</span></span>
<span><span> */</span></span>
<span><span>type</span><span> CounterSettings</span><span> = {</span></span>
<span><span>count</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>incrementBy</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
```

![Stream Deck + touch display with updated layout values.](https://docs.elgato.com/img/streamdeck/sdk/touch-strip.png)

## Reserved Layout Item Keys[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#reserved-layout-item-keys "Direct link to Reserved Layout Item Keys")

Layouts utilize the `key` value of an item to identify said item, however there are a few reserved keys that can be overridden by the user.

-   `title` - As with [key actions](https://docs.elgato.com/streamdeck/sdk/guides/keys#display-precedence), users can set a custom title for dial/touch strip actions, which will take precedence over the plugin provided title.
-   `icon` - As with [key actions](https://docs.elgato.com/streamdeck/sdk/guides/keys#display-precedence), users can set a custom icon for dial/touch strip actions, which will take precedence over the plugin provided icon.

## Trigger Descriptions[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#trigger-descriptions "Direct link to Trigger Descriptions")

Trigger descriptions can help the user to understand what the encoder does in a particular dial action. This can be set in the manifest file using the [`Actions[].Encoder.TriggerDescriptions`](https://docs.elgato.com/streamdeck/sdk/references/manifest#triggerdescriptions) property.

![Screenshot of Stream Deck software highlighting trigger descriptions](https://docs.elgato.com/img/streamdeck/sdk/trigger-descriptions.png)

Manifest JSON file, with an action referencing a trigger description

```
<span><span>{</span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "Icon"</span><span>: </span><span>"action-icon"</span><span>,</span></span>
<span><span>            "Name"</span><span>: </span><span>"Trigger Description Example"</span><span>,</span></span>
<span><span>            "Controllers"</span><span>: [</span><span>"Encoder"</span><span>],</span></span>
<span><span>            "Encoder"</span><span>: {</span></span>
<span><span>                "layout"</span><span>: </span><span>"$A1"</span><span>,</span></span>
<!-- -->
<span><span>                "TriggerDescription"</span><span>: {</span></span>
<span><span>                    "Push"</span><span>: </span><span>"Play / Pause"</span><span>,</span></span>
<span><span>                    "Rotate"</span><span>: </span><span>"Adjust Volume"</span><span>,</span></span>
<span><span>                    "Touch"</span><span>: </span><span>"Play / Pause"</span><span>,</span></span>
<span><span>                    "LongTouch"</span><span>: </span><span>"Skip Track"</span></span>
<span><span>                }</span></span>
<span><span>            }</span></span>
<span><span>        }</span></span>
<span><span>    ]</span></span>
<span><span>    // ...</span></span>
<span><span>}</span></span>
```

### Update Trigger Descriptions[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#update-trigger-descriptions "Direct link to Update Trigger Descriptions")

You can programmatically update the trigger descriptions using the [`setTriggerDescription`](https://docs.elgato.com/streamdeck/sdk/guides/dials/#settriggerdescription) function.

Action class updating its trigger description

```
<span><span>import</span><span> { </span><span>action</span><span>, </span><span>DialUpEvent</span><span>, </span><span>SingletonAction</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>@</span><span>action</span><span>({ </span><span>UUID:</span><span> "com.elgato.trigger-description-example.increment"</span><span> })</span></span>
<span><span>export</span><span> class</span><span> IncrementCounter</span><span> extends</span><span> SingletonAction</span><span>&lt;</span><span>CounterSettings</span><span>&gt; {</span></span>
<span><span>/**</span></span>
<span><span> * Occurs when the user releases a dial.</span></span>
<span><span> */</span></span>
<span><span>override</span><span> onDialUp</span><span>(</span><span>ev</span><span>: </span><span>DialUpEvent</span><span>&lt;</span><span>CounterSettings</span><span>&gt;): </span><span>Promise</span><span>&lt;</span><span>void</span><span>&gt; | </span><span>void</span><span> {</span></span>
<!-- -->
<span><span>ev</span><span>.</span><span>action</span><span>.</span><span>setTriggerDescription</span><span>({</span></span>
<span><span>push:</span><span> "Increment counter"</span><span>,</span></span>
<span><span>rotate:</span><span> "Adjust increment"</span><span>,</span></span>
<span><span>touch:</span><span> "Increment counter"</span><span>,</span></span>
<span><span>longTouch:</span><span> "Reset counter"</span><span>,</span></span>
<span><span>});</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
<span></span>
<span><span>/**</span></span>
<span><span> * Settings for </span><span>{</span><span>@link</span><span> IncrementCounter</span><span>}</span><span>.</span></span>
<span><span> */</span></span>
<span><span>type</span><span> CounterSettings</span><span> = {</span></span>
<span><span>count</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>incrementBy</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>};</span></span>
```

## Events[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#events "Direct link to Events")

In addition to the [action events](https://docs.elgato.com/streamdeck/sdk/guides/actions#events) found on both keys and dials, dials also receive the following events in the form of overridable methods on the `SingletonAction` class.

### onDialDown[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#ondialdown "Direct link to onDialDown")

### onDialRotate[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#ondialrotate "Direct link to onDialRotate")

### onDialUp[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#ondialup "Direct link to onDialUp")

### onTouchTap[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#ontouchtap "Direct link to onTouchTap")

## Commands[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#commands "Direct link to Commands")

The following commands are available to dial actions.

tip

Some events are applicable to both dials and keys, such as [`onWillAppear`](https://docs.elgato.com/streamdeck/sdk/guides/actions#onwillappear). To invoke a dial-only command within these event handlers, you need to first assert the action is a dial using [`Action.isDial()`](https://docs.elgato.com/streamdeck/sdk/guides/actions#isdial).

### getResources[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#getresources "Direct link to getResources")

### getSettings[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#getsettings "Direct link to getSettings")

### setFeedback[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setfeedback "Direct link to setFeedback")

### setFeedbackLayout[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setfeedbacklayout "Direct link to setFeedbackLayout")

### setImage[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setimage "Direct link to setImage")

### setResources[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setresources "Direct link to setResources")

### setSettings[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#setsettings "Direct link to setSettings")

### setTitle[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#settitle "Direct link to setTitle")

### setTriggerDescription[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#settriggerdescription "Direct link to setTriggerDescription")

### showAlert[](https://docs.elgato.com/streamdeck/sdk/guides/dials/#showalert "Direct link to showAlert")