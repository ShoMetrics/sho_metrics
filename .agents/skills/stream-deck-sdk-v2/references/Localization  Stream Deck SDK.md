The Stream Deck SDK supports localization, enabling you to build your plugin for a wider audience.

## Supported Languages[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#supported-languages "Direct link to Supported Languages")

The following languages are supported by Stream Deck:

-   Chinese (Simplified): zh\_CN.json
-   Chinese (Traditional): zh\_TW.json<sup>1</sup>
-   German: de.json
-   English: en.json
-   French: fr.json
-   Japanese: ja.json
-   Korean: ko.json
-   Spanish: es.json

<sup>1</sup> Available from Stream Deck 6.8

Each of the supported languages' resources are stored in JSON files within the `*.sdPlugin` directory, and are named by their language code, like so:

Plugin file structure

```
<span><span>.</span></span>
<span><span>├── *.sdPlugin/</span></span>
<span><span>│   ├── bin/</span></span>
<span><span>│   ├── imgs/</span></span>
<span><span>│   ├── logs/</span></span>
<span><span>│   ├── ui/</span></span>
<span><span>│   │   └── increment-counter.html</span></span>
<span><span>|   ├── de.json</span></span>
<span><span>|   ├── en.json</span></span>
<span><span>|   ├── es.json</span></span>
<span><span>|   ├── fr.json</span></span>
<span><span>|   ├── ja.json</span></span>
<span><span>|   ├── ko.json</span></span>
<span><span>│   ├── manifest.json</span></span>
<span><span>|   ├── zh_CN.json</span></span>
<span><span>|   └── zh_TW.json</span></span>
<span><span>├── src/</span></span>
<span><span>│   ├── actions/</span></span>
<span><span>│   │   └── increment-counter.ts</span></span>
<span><span>│   └── plugin.ts</span></span>
<span><span>├── package.json</span></span>
<span><span>├── rollup.config.mjs</span></span>
<span><span>└── tsconfig.json</span></span>
```

## Localized Resources[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#localized-resources "Direct link to Localized Resources")

As part of localization, you can provide resources that:

-   Override manifest strings that are displayed throughout Stream Deck, for example the action list.
-   Custom localizations to be used within your plugin or property inspector.

Please note

Localizations are handled slightly differently in [sdpi-components](https://sdpi-components.dev/docs/helpers/localization), whereby property inspector resources are placed directly in the HTML file. This is subject to change in the future.

### Manifest Strings[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#manifest-strings "Direct link to Manifest Strings")

Within the manifest, the following strings can be localized.

#### Root[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#root "Direct link to Root")

-   [`Name`](https://docs.elgato.com/streamdeck/sdk/references/manifest#manifest-name)
-   [`Description`](https://docs.elgato.com/streamdeck/sdk/references/manifest#manifest-description)

#### `Actions`[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#actions "Direct link to actions")

-   [`Name`](https://docs.elgato.com/streamdeck/sdk/references/manifest#action-name)
-   [`Tooltip`](https://docs.elgato.com/streamdeck/sdk/references/manifest#action-tooltip)

#### `Actions[].Encoder.TriggerDescriptions`[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#actionsencodertriggerdescriptions "Direct link to actionsencodertriggerdescriptions")

-   [`LongTouch`](https://docs.elgato.com/streamdeck/sdk/references/manifest#triggerdescriptions-longtouch)
-   [`Push`](https://docs.elgato.com/streamdeck/sdk/references/manifest#triggerdescriptions-push)
-   [`Rotate`](https://docs.elgato.com/streamdeck/sdk/references/manifest#triggerdescriptions-rotate)
-   [`Touch`](https://docs.elgato.com/streamdeck/sdk/references/manifest#triggerdescriptions-touch)

#### `Actions[].States[]`[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#actionsstates "Direct link to actionsstates")

-   [`Name`](https://docs.elgato.com/streamdeck/sdk/references/manifest#state-name)

#### Example[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#example "Direct link to Example")

The following example demonstrates localizing the manifest strings, including strings associated with an action (indexed by the action's UUID), to German.

Example manifest for a volume controller plugin

```
<span><span>{</span></span>
<span><span>    // Some properties omitted for brevity...</span></span>
<span><span>    "Name"</span><span>: </span><span>"Volume Controller"</span><span>,</span></span>
<span><span>    "Description"</span><span>: </span><span>"Take control of your audio volume"</span><span>,</span></span>
<span><span>    "Actions"</span><span>: [</span></span>
<span><span>        {</span></span>
<span><span>            "UUID"</span><span>: </span><span>"com.example.volume.adjust"</span><span>,</span></span>
<span><span>            "Name"</span><span>: </span><span>"Volume control"</span><span>,</span></span>
<span><span>            "Tooltip"</span><span>: </span><span>"Control your volume"</span><span>,</span></span>
<span><span>            "States"</span><span>: [</span></span>
<span><span>                {</span></span>
<span><span>                    "Name"</span><span>: </span><span>"Unmute"</span></span>
<span><span>                },</span></span>
<span><span>                {</span></span>
<span><span>                    "Name"</span><span>: </span><span>"Mute"</span></span>
<span><span>                }</span></span>
<span><span>            ],</span></span>
<span><span>            "Encoder"</span><span>: {</span></span>
<span><span>                "TriggerDescription"</span><span>: {</span></span>
<span><span>                    "LongTouch"</span><span>: </span><span>"Mute"</span><span>,</span></span>
<span><span>                    "Push"</span><span>: </span><span>"Toggle mute"</span><span>,</span></span>
<span><span>                    "Rotate"</span><span>: </span><span>"Adjust"</span><span>,</span></span>
<span><span>                    "Touch"</span><span>: </span><span>"Stummschaltung umschalten"</span></span>
<span><span>                }</span></span>
<span><span>            }</span></span>
<span><span>        }</span></span>
<span><span>    ]</span></span>
<span><span>}</span></span>
```

de.json, containing localizations for the aforementioned manifest example

```
<span><span>{</span></span>
<span><span>    "Name"</span><span>: </span><span>"Lautstärkeregler"</span><span>,</span></span>
<span><span>    "Description"</span><span>: </span><span>"Übernehmen Sie die Kontrolle über Ihre Audiolautstärke"</span><span>,</span></span>
<span><span>    "com.example.volume.adjust"</span><span>: {</span></span>
<span><span>        "Name"</span><span>: </span><span>"Lautstärkeregelung"</span><span>,</span></span>
<span><span>        "Tooltip"</span><span>: </span><span>"Kontrollieren Sie Ihre Lautstärke"</span><span>,</span></span>
<span><span>        "States"</span><span>: [</span></span>
<span><span>            {</span></span>
<span><span>                "Name"</span><span>: </span><span>"Stummschaltung aufheben"</span></span>
<span><span>            },</span></span>
<span><span>            {</span></span>
<span><span>                "Name"</span><span>: </span><span>"Stumm"</span></span>
<span><span>            }</span></span>
<span><span>        ],</span></span>
<span><span>        "Encoder"</span><span>: {</span></span>
<span><span>            "TriggerDescription"</span><span>: {</span></span>
<span><span>                "LongTouch"</span><span>: </span><span>"Stumm"</span><span>,</span></span>
<span><span>                "Push"</span><span>: </span><span>"Stummschaltung umschalten"</span><span>,</span></span>
<span><span>                "Rotate"</span><span>: </span><span>"Anpassen"</span><span>,</span></span>
<span><span>                "Touch"</span><span>: </span><span>"Stummschaltung umschalten"</span></span>
<span><span>            }</span></span>
<span><span>        }</span></span>
<span><span>    }</span></span>
<span><span>}</span></span>
```

Default values

If no localization file is provided, Stream Deck will use the values provided in the manifest JSON file. A language JSON file will override the manifest, even if the manifest provides text in said language, for example English.

### Custom Strings[](https://docs.elgato.com/streamdeck/sdk/guides/i18n/#custom-strings "Direct link to Custom Strings")

In addition to overriding manifest strings, you can provide custom localizations by defining a `Localization` object. The example below is an updated version of the `fr.json` example that includes custom strings.

fr.json

```
<span><span>{</span></span>
<span><span>    "Name"</span><span>: </span><span>"Lautstärkeregler"</span><span>,</span></span>
<span><span>    "Description"</span><span>: </span><span>"Übernehmen Sie die Kontrolle über Ihre Audiolautstärke"</span><span>,</span></span>
<span><span>    "com.example.volume.adjust"</span><span>: {</span></span>
<span><span>        "Name"</span><span>: </span><span>"Lautstärkeregelung"</span><span>,</span></span>
<span><span>        "Tooltip"</span><span>: </span><span>"Kontrollieren Sie Ihre Lautstärke"</span><span>,</span></span>
<span><span>        "States"</span><span>: [</span></span>
<span><span>            {</span></span>
<span><span>                "Name"</span><span>: </span><span>"Stummschaltung aufheben"</span></span>
<span><span>            },</span></span>
<span><span>            {</span></span>
<span><span>                "Name"</span><span>: </span><span>"Stumm"</span></span>
<span><span>            }</span></span>
<span><span>        ],</span></span>
<span><span>        "Encoder"</span><span>: {</span></span>
<span><span>            "TriggerDescription"</span><span>: {</span></span>
<span><span>                "LongTouch"</span><span>: </span><span>"Stumm"</span><span>,</span></span>
<span><span>                "Push"</span><span>: </span><span>"Stummschaltung umschalten"</span><span>,</span></span>
<span><span>                "Rotate"</span><span>: </span><span>"Anpassen"</span><span>,</span></span>
<span><span>                "Touch"</span><span>: </span><span>"Stummschaltung umschalten"</span></span>
<span><span>            }</span></span>
<span><span>        }</span></span>
<span><span>    },</span></span>
<!-- -->
<span><span>    "Localization"</span><span>: {</span></span>
<span><span>        "More info"</span><span>: </span><span>"Weitere Informationen"</span><span>,</span></span>
<span><span>        "Save"</span><span>: </span><span>"Speichern"</span><span>,</span></span>
<span><span>        "Reset"</span><span>: </span><span>"Zurücksetzen"</span></span>
<span><span>    }</span></span>
<span><span>}</span></span>
```

Your custom strings can then be read using `streamDeck.i18n.translate` function.

Reading custom localizations

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>i18n</span><span>.</span><span>translate</span><span>(</span><span>"More info"</span><span>);</span></span>
<span><span>// Output: "More info"</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>i18n</span><span>.</span><span>translate</span><span>(</span><span>"More info"</span><span>, </span><span>"de"</span><span>);</span></span>
<span><span>// Output: "Weitere Informationen"</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>i18n</span><span>.</span><span>translate</span><span>(</span><span>"More info"</span><span>, </span><span>"es"</span><span>);</span></span>
<span><span>// Output: "More info", es.json is not defined</span></span>
```

When resolving custom localizations, the following order is applied.

![](https://docs.elgato.com/img/streamdeck/sdk/i18n-resolution.svg)