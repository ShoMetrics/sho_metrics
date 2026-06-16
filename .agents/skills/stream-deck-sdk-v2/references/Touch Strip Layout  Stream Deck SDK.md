In addition to the [built-in touch strip layouts](https://docs.elgato.com/streamdeck/sdk/guides/dials#built-in-layouts), you can also create bespoke layouts which allow you to completely customize how content is rendered on a Stream Deck + touch strip. Your bespoke layouts are represented as either a JSON file distributed with your plugin, or programmatically using an object.

Shared touch strip

The Stream Deck + touch strip is shared amongst four actions, with each action able to render one quarter of the touch strip occupying 200 × 100 px. Natively, your plugin cannot render the _entire_ touch strip, however to mimic this behavior, all four actions assigned to the touch strip would need to be from your plugin, and their quarters updated individually.

A JSON schema is available for layout JSON files, providing intellisense and validation, and is available at the following URL:

JSON schema URL

```
<span><span>https://schemas.elgato.com/streamdeck/plugins/layout.json</span></span>
```

You can reference this URL using the `$schema` property within your layout JSON file:

Layout TypeScript declaration

```
<span><span>type</span><span> Layout</span><span> = {</span></span>
<span><span>    id</span><span>: </span><span>string</span><span>;</span></span>
<span><span>    items</span><span>: (</span></span>
<span><span>        | {</span></span>
<span><span>              background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              bar_bg_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              bar_border_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              bar_fill_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              border_w</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>              key</span><span>: </span><span>string</span><span>;</span></span>
<span><span>              opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>              range</span><span>?: {</span></span>
<span><span>                  max</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                  min</span><span>: </span><span>number</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              rect</span><span>: [</span><span>x</span><span>: </span><span>number</span><span>, </span><span>y</span><span>: </span><span>number</span><span>, </span><span>width</span><span>: </span><span>number</span><span>, </span><span>height</span><span>: </span><span>number</span><span>];</span></span>
<span><span>              subtype</span><span>?: </span><span>0</span><span> | </span><span>1</span><span> | </span><span>2</span><span> | </span><span>3</span><span> | </span><span>4</span><span>;</span></span>
<span><span>              type</span><span>: </span><span>"bar"</span><span>;</span></span>
<span><span>              value</span><span>: </span><span>number</span><span>;</span></span>
<span><span>              zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>        | {</span></span>
<span><span>              background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              bar_bg_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              bar_border_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              bar_fill_c</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              bar_h</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              border_w</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>              key</span><span>: </span><span>string</span><span>;</span></span>
<span><span>              opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>              range</span><span>?: {</span></span>
<span><span>                  max</span><span>: </span><span>number</span><span>;</span></span>
<span><span>                  min</span><span>: </span><span>number</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              rect</span><span>: [</span><span>x</span><span>: </span><span>number</span><span>, </span><span>y</span><span>: </span><span>number</span><span>, </span><span>width</span><span>: </span><span>number</span><span>, </span><span>height</span><span>: </span><span>number</span><span>];</span></span>
<span><span>              subtype</span><span>?: </span><span>0</span><span> | </span><span>1</span><span> | </span><span>2</span><span> | </span><span>3</span><span> | </span><span>4</span><span>;</span></span>
<span><span>              type</span><span>: </span><span>"gbar"</span><span>;</span></span>
<span><span>              value</span><span>: </span><span>number</span><span>;</span></span>
<span><span>              zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>        | {</span></span>
<span><span>              background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>              key</span><span>: </span><span>string</span><span>;</span></span>
<span><span>              opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>              rect</span><span>: [</span><span>x</span><span>: </span><span>number</span><span>, </span><span>y</span><span>: </span><span>number</span><span>, </span><span>width</span><span>: </span><span>number</span><span>, </span><span>height</span><span>: </span><span>number</span><span>];</span></span>
<span><span>              type</span><span>: </span><span>"pixmap"</span><span>;</span></span>
<span><span>              value</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>        | {</span></span>
<span><span>              alignment</span><span>?: </span><span>"center"</span><span> | </span><span>"left"</span><span> | </span><span>"right"</span><span>;</span></span>
<span><span>              background</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              color</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              enabled</span><span>?: </span><span>boolean</span><span>;</span></span>
<span><span>              font</span><span>?: {</span></span>
<span><span>                  size</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>                  weight</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>              };</span></span>
<span><span>              key</span><span>: </span><span>string</span><span>;</span></span>
<span><span>              opacity</span><span>?: </span><span>0</span><span> | </span><span>0.1</span><span> | </span><span>0.2</span><span> | </span><span>0.3</span><span> | </span><span>0.4</span><span> | </span><span>0.5</span><span> | </span><span>0.6</span><span> | </span><span>0.7</span><span> | </span><span>0.8</span><span> | </span><span>0.9</span><span> | </span><span>1</span><span>;</span></span>
<span><span>              rect</span><span>: [</span><span>x</span><span>: </span><span>number</span><span>, </span><span>y</span><span>: </span><span>number</span><span>, </span><span>width</span><span>: </span><span>number</span><span>, </span><span>height</span><span>: </span><span>number</span><span>];</span></span>
<span><span>              "text-overflow"</span><span>?: </span><span>"clip"</span><span> | </span><span>"ellipsis"</span><span> | </span><span>"fade"</span><span>;</span></span>
<span><span>              type</span><span>: </span><span>"text"</span><span>;</span></span>
<span><span>              value</span><span>?: </span><span>string</span><span>;</span></span>
<span><span>              zOrder</span><span>?: </span><span>number</span><span>;</span></span>
<span><span>          }</span></span>
<span><span>    )[];</span></span>
<span><span>};</span></span>
```

Defines the structure of a custom layout file.

Bar layout item used to render a horizontal bar with a filler, e.g. a progress bar. The amount to fill the bar by can be specified by setting the `value`.

Bar layout item used to render a horizontal bar with an indicator represented as a triangle beneath the bar. The location of the indicator can be specified by setting the `value`.

Image layout item used to render an image sourced from either a local file located under the plugin's folder, or base64 encoded `string`. The `value` defines the image.

Defines the range of the value the bar represents, e.g. 0-20, 0-100, etc.

Text layout item used to render text within a layout. **Note**, when adding a text item to the layout's JSON definition, setting the `key` to the `"title"` keyword will enable the user to specify the font's settings via the property inspector, and will cause `setTitle` to update this item.