Logging is a useful way track the flow of functionality, and can assist with diagnosing bugs within your plugin. By default, the Stream Deck SDK provides support for logging between the runtime consoles, as well as writing logs to the file system.

In this guide you'll learn:

-   How to write log entries using the Stream Deck SDK.
-   Where your plugin's logs are located.
-   Using log levels and logger scopes to help identify logs.

## Writing Logs[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#writing-logs "Direct link to Writing Logs")

Logs are written using a `Logger` instance, with the root logger located on the default `streamDeck` import, for example:

Info level log

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>"Hello world"</span><span>);</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

tip

It is recommended to use `streamDeck.logger` instead of `console`. Using `streamDeck.logger` ensures your plugin's logs are written to all available targets, for example the LOG file.

## Reading Logs[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#reading-logs "Direct link to Reading Logs")

All logs written to a logger are output to targets based on the source of the log entry, and the plugin's environment, for example whether it is in production or development. The log targets are:

| Source | Environment | Targets |
| --- | --- | --- |
| Plugin | Development | 
-   [File](https://docs.elgato.com/streamdeck/sdk/guides/logging/#log-files)
-   [Console (Plugin)](https://docs.elgato.com/streamdeck/sdk/guides/logging/#console)

 |
| Property Inspector (UI) | Development | 

-   [File](https://docs.elgato.com/streamdeck/sdk/guides/logging/#log-files)
-   [Console (Plugin)](https://docs.elgato.com/streamdeck/sdk/guides/logging/#console)
-   [Console (UI)](https://docs.elgato.com/streamdeck/sdk/guides/logging/#console)

 |
| Plugin | Production | 

-   [File](https://docs.elgato.com/streamdeck/sdk/guides/logging/#log-files)

 |
| Property Inspector (UI) | Production | 

-   [File](https://docs.elgato.com/streamdeck/sdk/guides/logging/#log-files)
-   [Console (UI)](https://docs.elgato.com/streamdeck/sdk/guides/logging/#console)

 |

### Log Files[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#log-files "Direct link to Log Files")

File logging is provided as standard, allowing for writing logs to LOG files. These LOG files are found within your plugin's `logs` directory, for example:

```
<span><span>com.elgato.hello-world.sdPlugin/logs/com.elgato.hello-world.0.log</span></span>
<span><span>└─────────┬──────────┘               └─────────┬──────────┘ └──┐</span></span>
<span><span>     Plugin UUID                          Plugin UUID        Index</span></span>
```

warning

Uninstalling a plugin will also remove its associated log files. When diagnosing issues, we recommend requesting the logs prior to suggesting a re-install.

#### Format[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#format "Direct link to Format")

Logs are written in the following format:

```
<span><span>&lt;iso_date&gt; &lt;log_level&gt; [[scope]: ]&lt;message&gt;</span></span>
```

For example:

com.elgato.hello-world.sdPlugin/logs/com.elgato.hello-world.0.log

```
<span><span>2024-05-05T12:35:13.000Z</span><span> INFO</span><span>  Hello world</span></span>
```

#### File Rotation[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#file-rotation "Direct link to File Rotation")

The file target also provides automatic file rotation of your plugin's log files, this means that:

-   Your plugin's 10 most recent log files are available, with `0` being the most recent.
-   Log files never exceed 10 MiB.

File rotation occurs, i.e. a new log file is created and the oldest removed, when one of the following occurs:

-   Your plugin starts.
-   The current log file exceeds 10 MiB.

### Console[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#console "Direct link to Console")

Whilst developing your plugin, logs are also mirrored to the various consoles supported by the Stream Deck SDK. The supported consoles are:

-   The Node.js terminal when debugging your plugin.
-   The browser console when debugging your property inspectors.

Where available, the console logger maps one-to-one with the native console to provide more insightful messages and familiarity. The mapping is as follows:

Logger vs Console

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>// console.error(...)</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>error</span><span>(</span><span>"Failures or exceptions"</span><span>);</span></span>
<span></span>
<span><span>// console.warn(...)</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>warn</span><span>(</span><span>"Recoverable errors"</span><span>);</span></span>
<span></span>
<span><span>// console.log(...);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>"Hello world"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>debug</span><span>(</span><span>"Debugging information"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>trace</span><span>(</span><span>"Detailed messages"</span><span>);</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

## Log Level[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#log-level "Direct link to Log Level")

Log entries are associated with log levels to assist with indicating their severity. In the previous chapter, you created an `INFO` log entry using:

```
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>"Hello world"</span><span>);</span></span>
```

In addition to `INFO`, it is also possible to create a log with one of the following log levels:

Log levels

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>error</span><span>(</span><span>"Failures or exceptions"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>warn</span><span>(</span><span>"Recoverable errors"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>"Hello world"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>debug</span><span>(</span><span>"Debugging information"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>trace</span><span>(</span><span>"Detailed messages"</span><span>);</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

| Level | Value | Description |
| --- | --- | --- |
| Error[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#error "Direct link to Error") | `LogLevel.ERROR` | Logs that require immediate attention. For example, module failure, unexpected behavior, or data loss/corruption. |
| Warning[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#warning "Direct link to Warning") | `LogLevel.WARN` | Represents abnormal behavior, but a recoverable state. For example, a value resorting to a fallback value. |
| Information[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#information "Direct link to Information") | `LogLevel.INFO` | General information. |
| Debug[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#debug "Direct link to Debug") | `LogLevel.DEBUG` | Log entries for debugging and development. For example, variable values. |
| Trace[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#trace "Direct link to Trace") | `LogLevel.TRACE` | Detailed entries for analyzing the context and flow of execution. For example, network traffic, IPC communication. These entries may contain sensitive information. |

You can also control _lowest_ level that will be written to the logger, for example if you want to only log error and warning messages, you would do the following:

Setting the log level

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>setLevel</span><span>(</span><span>"warn"</span><span>);</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>error</span><span>(</span><span>"Failures or exceptions"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>warn</span><span>(</span><span>"Recoverable errors"</span><span>);</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>"Hello world"</span><span>); </span><span>// No output.</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>debug</span><span>(</span><span>"Debugging information"</span><span>); </span><span>// No output.</span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>trace</span><span>(</span><span>"Detailed messages"</span><span>); </span><span>// No output.</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

warning

The default log level is dependent on the mode of the plugin:

-   Development, the default log level is `DEBUG`.
-   Production, the default log level is `INFO`, with `DEBUG` being the lowest possible level.

## Creating Loggers[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#creating-loggers "Direct link to Creating Loggers")

Additional child loggers may be created from an existing logger, each of which is called a "scope." A scope can be useful to identify the source of a log message, with the scopes acting as breadcrumbs. For example:

Scoped loggers

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>const</span><span> scopedLogger</span><span> = </span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>createScope</span><span>(</span><span>"Main"</span><span>);</span></span>
<span><span>scopedLogger</span><span>.</span><span>info</span><span>(</span><span>"Hello world"</span><span>);</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

com.elgato.hello-world.sdPlugin/logs/com.elgato.hello-world.0.log

```
<span><span>2024-05-05T12:35:13.000Z</span><span> INFO</span><span>  Main: Hello world</span></span>
```

Scoped loggers can also be nested, for example:

Nested scoped loggers

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>const</span><span> scopedLogger</span><span> = </span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>createScope</span><span>(</span><span>"Main"</span><span>);</span></span>
<span><span>scopedLogger</span><span>.</span><span>info</span><span>(</span><span>"Hello world"</span><span>);</span></span>
<span></span>
<span><span>const</span><span> nestedLogger</span><span> = </span><span>scopedLogger</span><span>.</span><span>createScope</span><span>(</span><span>"Nested"</span><span>);</span></span>
<span><span>nestedLogger</span><span>.</span><span>info</span><span>(</span><span>"Test"</span><span>);</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>connect</span><span>();</span></span>
```

com.elgato.hello-world.sdPlugin/logs/com.elgato.hello-world.0.log

```
<span><span>2024-05-05T12:35:13.000Z</span><span> INFO</span><span>  Main: Hello world</span></span>
<span><span>2024-05-05T12:35:13.000Z</span><span> INFO</span><span>  Main-&gt;Nested: Test</span></span>
```

## Stream Deck Logs[](https://docs.elgato.com/streamdeck/sdk/guides/logging/#stream-deck-logs "Direct link to Stream Deck Logs")

In addition to the logs written by your plugin, the Stream Deck app also writes logs to help diagnose issues.

-   On Windows, logs are located at `%appdata%\Elgato\StreamDeck\logs\`.
-   On macOS, logs are located at `~/Library/Logs/ElgatoStreamDeck/`.

Stream Deck uses a log rotation in which each run of the app creates a new log file, with the most recent log file being `StreamDeck0.log`.