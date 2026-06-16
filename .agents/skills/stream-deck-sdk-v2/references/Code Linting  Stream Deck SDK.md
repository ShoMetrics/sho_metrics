Linting your code greatly improves consistency and readability. This leads to improved maintainability, and often reduces bugs caused to coding quirks. Whilst completely optional, it is encouraged to lint your code; to assist with this, Elgato provides pre-defined configurations that we use for our projects.

## Quick Start[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#quick-start "Direct link to Quick Start")

Install the ESLint and Prettier configurations.

Terminal

```
<span><span>npm</span><span> install</span><span> @elgato/eslint-config</span><span> @elgato/prettier-config</span><span> --save-dev</span></span>
```

Update your `package.json` file to include a `lint` script, and configure Prettier.

package.json

```
<span><span>{</span></span>
<span><span>"scripts"</span><span>: {</span></span>
<span><span>"lint"</span><span>: </span><span>"eslint --max-warnings 0"</span></span>
<span><span>},</span></span>
<span><span>"prettier"</span><span>: </span><span>"@elgato/prettier-config"</span></span>
<span><span>}</span></span>
```

At the root of your project, download the [`.editorconfig`](https://raw.githubusercontent.com/elgatosf/prettier-config/main/.editorconfig) file to configure your IDE, and create a `eslint.config.js` file to configure ESLint.

eslint.config.js

```
<span><span>import</span><span> { </span><span>config</span><span> } </span><span>from</span><span> "@elgato/eslint-config"</span><span>;</span></span>
<span></span>
<span><span>export</span><span> default</span><span> config</span><span>.</span><span>recommended</span><span>;</span></span>
```

## ESLint[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#eslint "Direct link to ESLint")

[ESLint](https://eslint.org/) is a popular static code analysis tool for JavaScript and Typescript projects, allowing you to quickly identify and resolve problems. The ESLing configuration used within Elgato's project is available publicly, and can optionally be added to your projects.

### Installation[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#eslint-installation "Direct link to Installation")

Install `@elgato/eslint-config` as a `devDependency`.

Terminal

```
<span><span>npm</span><span> install</span><span> @elgato/eslint-config</span><span> --save-dev</span></span>
```

Create an `eslint.config.js` file at the root of your project.

eslint.config.js

```
<span><span>import</span><span> { </span><span>config</span><span> } </span><span>from</span><span> "@elgato/eslint-config"</span><span>;</span></span>
<span></span>
<span><span>export</span><span> default</span><span> config</span><span>.</span><span>recommended</span><span>;</span></span>
```

There are two configurations available:

-   Recommended — `config.recommended`
-   Strict — `config.strict` (stricter type enforcing)

### Usage[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#eslint-usage "Direct link to Usage")

The [ESLint CLI](https://eslint.org/docs/latest/use/command-line-interface) provides an array of useful commands. These can optionally be added to your `package.json` `scripts` object to further streamline checking and formatting, for example.

-   NPM Script
-   Terminal

package.json

```
<span><span>{</span></span>
<span><span>"scripts"</span><span>: {</span></span>
<span><span>"lint"</span><span>: </span><span>"eslint --max-warnings 0"</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

### Configuration[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#eslint-configuration "Direct link to Configuration")

#### Extends[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#eslint-configuration-extends "Direct link to Extends")

-   JSDoc recommended
-   ESLint recommended
-   TypeScript ESLint recommended

#### Rules[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#eslint-rules "Direct link to Rules")

| Rule | Recommended | Strict | Notes |
| --- | --- | --- | --- |
| Indent: Tabs | ⚠️ Warn | ⚠️ Warn |  |
| JSDoc: Check tag names | ⚠️ Warn | ⚠️ Warn | Additional tags: `csspart`, `cssproperty`, `jest-environment`, `slot` |
| JSDoc: No undefined types | ⚠️ Warn | ⚠️ Warn |  |
| JSDoc: Require JSDoc | ⚠️ Warn | ⚠️ Warn |  |
| JSDoc: Require Returns | ⚠️ Warn | ⚠️ Warn | Disabled for getters. |
| TypeScript: Explicit function return types | ✅ Off | ⚠️ Warn | Disabled for JavaScript, tests, and mock files. |
| TypeScript: Explicit member accessibility | ⚠️ Warn | ⚠️ Warn | No `public` required `constructor`. |
| TypeScript: Member ordering | ⚠️ Warn | ⚠️ Warn | Grouped by type and then access, and ordered alphabetically. |
| TypeScript: Sort type constituents | ⚠️ Warn | ⚠️ Warn |  |

Member Ordering

Ignored Files

### Overrides[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#prettier-overrides "Direct link to Overrides")

Configuration settings can be overridden using the `defineConfig` helper function from ESLint, extending `@elgato/eslint-config`, and then defining your preferred settings.

eslint.config.js

```
<span><span>import</span><span> { </span><span>config</span><span> } </span><span>from</span><span> "@elgato/eslint-config"</span><span>;</span></span>
<span><span>import</span><span> { </span><span>defineConfig</span><span> } </span><span>from</span><span> "eslint/config"</span><span>;</span></span>
<span></span>
<span><span>export</span><span> default</span><span> defineConfig</span><span>([</span></span>
<span><span>{</span></span>
<span><span>extends:</span><span> [</span><span>config</span><span>.</span><span>recommended</span><span>],</span></span>
<span></span>
<span><span>// Anything from here will override @elgato/eslint-config</span></span>
<span><span>rules:</span><span> {</span></span>
<span><span>"no-unused-vars"</span><span>:</span><span> "warn"</span><span>,</span></span>
<span><span>},</span></span>
<span><span>},</span></span>
<span><span>]);</span></span>
```

[Learn more](https://eslint.org/docs/latest/extend/shareable-configs#overriding-settings-from-shareable-configs) about overriding settings.

## Prettier[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#prettier "Direct link to Prettier")

[Prettier](https://prettier.io/) is a configurable "opinionated code formatter" that makes formatting code effortless. The Prettier configuration used within Elgato's projects is available publicly, and can optionally be added to your projects to improve readability and code consistency.

### Installation[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#prettier-installation "Direct link to Installation")

Install `@elgato/prettier-config` as a `devDependency`.

Terminal

```
<span><span>npm</span><span> install</span><span> @elgato/prettier-config</span><span> --save-dev</span></span>
```

Configure Prettier within your `package.json` to use the configuration.

package.json

```
<span><span>"prettier"</span><span>: </span><span>"@elgato/prettier-config"</span></span>
```

Add the accompanying `.editorconfig` file to the root of your project. [Download the `.editorconfig` file](https://raw.githubusercontent.com/elgatosf/prettier-config/main/.editorconfig).

### Usage[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#prettier-usage "Direct link to Usage")

The [Prettier CLI](https://prettier.io/docs/en/cli) provides an array of useful commands. These can optionally be added to your `package.json` `scripts` object to further streamline checking and formatting, for example.

#### Check Files[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#check-files "Direct link to Check Files")

-   NPM Script
-   Terminal

package.json

```
<span><span>{</span></span>
<span><span>"scripts"</span><span>: {</span></span>
<span><span>"lint"</span><span>: </span><span>"prettier . --check"</span><span>,</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

#### Format Files[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#format-files "Direct link to Format Files")

-   NPM Script
-   Terminal

package.json

```
<span><span>{</span></span>
<span><span>"scripts"</span><span>: {</span></span>
<span><span>"lint:fix"</span><span>: </span><span>"prettier . --write"</span><span>,</span></span>
<span><span>}</span></span>
<span><span>}</span></span>
```

Format on save

Prettier provides a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) to further streamline formatting your files. Once installed and configured, you can configure VS Code to format files when they're saved by setting `editor.formatOnSave` to `true` in your VS Code preferences.

### Configuration[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#prettier-configuration "Direct link to Configuration")

| Option | Value |
| --- | --- |
| [`endOfLine`](https://prettier.io/docs/en/options#end-of-line) | `lf` |
| [`printWidth`](https://prettier.io/docs/en/options#print-width) | 120 |
| [`singleQuote`](https://prettier.io/docs/en/options#quotes) | ❌ Prefer double |
| [`semi`](https://prettier.io/docs/en/options#semicolons) | ✅ Prefer semicolons |
| [`tabWidth`](https://prettier.io/docs/en/options#tab-width) | 4 spaces (2 spaces for `.yaml`, `.yml`) |
| [`useTabs`](https://prettier.io/docs/en/options#tabs) | ✅ Except `.json`, `.jsonc`, `.md`, `.yaml`, `.yml` |
| [`trailingComma`](https://prettier.io/docs/en/options#trailing-commas) | All, except `.jsonc` |
| [`multilineArraysWrapThreshold`](https://github.com/electrovir/prettier-plugin-multiline-arrays?tab=readme-ov-file#options) (multiline-arrays) | \-1 (manual) |
| [`importOrder`](https://github.com/trivago/prettier-plugin-sort-imports?tab=readme-ov-file#importorder) (sort-imports) | Third-party modules first |
| [`importOrderSeparation`](https://github.com/trivago/prettier-plugin-sort-imports?tab=readme-ov-file#importorderseparation) (sort-imports) | ✅ |
| [`importOrderSortSpecifiers`](https://github.com/trivago/prettier-plugin-sort-imports?tab=readme-ov-file#importordersortspecifiers) (sort-imports) | ✅ |
| [`importOrderCaseInsensitive`](https://github.com/trivago/prettier-plugin-sort-imports?tab=readme-ov-file#importordercaseinsensitive) (sort-imports) | ✅ |
| [`importOrderParserPlugins`](https://github.com/trivago/prettier-plugin-sort-imports?tab=readme-ov-file#importorderparserplugins) (sort-imports) | TypeScript |

### Overrides[](https://docs.elgato.com/streamdeck/sdk/style-guide/linting/#prettier-overrides "Direct link to Overrides")

Overriding configuration can be achieved by removing the `prettier` entry from your `package.json`, and instead using a [.prettierrc.js](https://prettier.io/docs/en/configuration) file. For example, to prefer spaces over tabs:

.prettierrc.js

```
<span><span>module</span><span>.</span><span>exports</span><span> = {</span></span>
<span><span>...</span><span>require</span><span>(</span><span>"@elgato/prettier-config"</span><span>),</span></span>
<span><span>tabWidth:</span><span> 2</span><span>,</span></span>
<span><span>useTabs:</span><span> false</span><span>,</span></span>
<span><span>};</span></span>
```