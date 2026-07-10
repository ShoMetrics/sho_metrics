+++
title = "I see a \"ShoMetrics plugin engine is not responding\" message. What does it mean?"
description = "Fix the ShoMetrics \"plugin engine is not responding\" message on Stream Deck: why the plugin may not start and how to recover."
weight = 60
+++

## What this message means

ShoMetrics is a Node.js based Stream Deck plugin, like many others in the
Marketplace. The first time you install a plugin of this kind, the Stream Deck
app downloads a small Node.js runtime in the background and shares it across all
Node.js plugins. This is a normal part of how Stream Deck runs these plugins.

You see the "plugin engine is not responding" message when the Property
Inspector does not receive a response from the ShoMetrics plugin during startup.
An unavailable shared Node.js runtime is a common cause, but a plugin startup
failure can produce the same message.

A few things worth knowing:

- This runtime is **not** the ShoMetrics Windows helper, and it is not something
  ShoMetrics downloads. The Stream Deck app downloads it, for plugins in general.
- Because the Stream Deck app fetches it over the internet, your computer needs
  to be online the first time you install any Node.js plugin.

_Searching in another language? This page covers: 中文 "ShoMetrics 插件引擎暂时没有响应 / 没有数据显示"，日本語「ShoMetrics プラグインエンジンが応答していません / センサーが表示されない」._

The rest of this page walks through fixing it.

## What should I do?

First, make sure your computer has a stable internet connection. Then try these
steps in order.

1. Uninstall the ShoMetrics plugin from the Stream Deck app. See
   [Elgato's guide to uninstalling plugins](https://help.elgato.com/hc/en-us/articles/11434818801293-Elgato-Stream-Deck-How-to-Uninstall-Stream-Deck-Plugins).

   On Windows, if you already installed the ShoMetrics helper, you do **not**
   need to uninstall the helper. Only the plugin in the Stream Deck app.

2. Fully quit the Stream Deck app. If you are not sure it is fully closed,
   restart your computer, or close it from the system tray and open it again.

3. Reinstall ShoMetrics from the
   [Elgato Marketplace](https://marketplace.elgato.com/product/sho-metrics-69957750-4b71-489f-a329-358d27ae67e6).
   After installing, do not immediately quit or restart the Stream Deck app.
   Give it time: the Stream Deck app downloads the runtime on its own. Most
   computers finish within a few seconds, but we suggest waiting one to three
   minutes to be sure it has completed.

4. Open the Stream Deck app again. ShoMetrics should now work. If it still does
   not, please [open a GitHub issue](https://github.com/ShoMetrics/sho_metrics/issues)
   or [join the Discord](https://discord.gg/tRSRAeHU35) to report it. If you are
   comfortable with a terminal, the Advanced section below collects useful
   details to include.

## Advanced

This section is for users who are comfortable checking files and running a
terminal command. If it does not make sense to you, that is completely fine, you
can skip it. But if you are reporting a problem, including the report below is a
big help.

### Background

Because ShoMetrics is a Node.js based plugin, it needs a Node.js runtime, and
the Stream Deck app installs one automatically the first time such a plugin is
added. That step is usually quick, a few seconds, but occasionally the Stream
Deck app cannot complete it. This is a common cause of the message.

### Check whether the runtime is present

Look for a `24.x.y` runtime folder with a Node binary inside:

- Windows: `%APPDATA%\Elgato\StreamDeck\NodeJS`
- macOS: `~/Library/Application Support/com.elgato.StreamDeck/NodeJS`

When it is present, you should see something like:

- Windows: `%APPDATA%\Elgato\StreamDeck\NodeJS\24.13.1\node.exe`, about 85 MB
- macOS: `~/Library/Application Support/com.elgato.StreamDeck/NodeJS/24.13.1/node`, about 120 MB

A `20.x.y` folder on its own is not enough: ShoMetrics needs a `24.x.y` runtime.
If there is no `24.x.y` folder, or the Node binary is missing, the download did
not complete.

### Collect a report

Run the one-line command for your system. It writes a report to a temporary
file and opens it, so you can attach the contents to your issue. It only reads
files, it does not change anything.

Windows (Windows PowerShell or Terminal, not Command Prompt):

```powershell
$out = "$env:TEMP\sho-metrics-nodejs-diag.txt"; $nodeDir = "$env:APPDATA\Elgato\StreamDeck\NodeJS"; $logDir = "$env:APPDATA\Elgato\StreamDeck\logs"; "=== NodeJS runtimes ===" | Set-Content $out; if (Test-Path $nodeDir) { Get-ChildItem $nodeDir -Recurse -Filter node.exe | ForEach-Object { "{0}  {1:N1} MB" -f $_.FullName, ($_.Length / 1MB) } | Add-Content $out; "--- folder entries ---" | Add-Content $out; Get-ChildItem $nodeDir | Select-Object -ExpandProperty Name | Add-Content $out } else { "NodeJS folder not found: $nodeDir" | Add-Content $out }; "" | Add-Content $out; "=== manifest.json ===" | Add-Content $out; if (Test-Path "$nodeDir\manifest.json") { Get-Content "$nodeDir\manifest.json" | Add-Content $out } else { "manifest.json not found" | Add-Content $out }; "" | Add-Content $out; "=== Stream Deck log matches ===" | Add-Content $out; Select-String -Path "$logDir\*.log" -Pattern 'node|environment is not yet ready|runtime|failed|error|sho-metrics' | ForEach-Object { "{0}:{1}: {2}" -f $_.Filename, $_.LineNumber, $_.Line.Trim() } | Add-Content $out; ii $out
```

macOS (Terminal):

```bash
out="${TMPDIR:-/tmp}/sho-metrics-nodejs-diag.txt"; nodeDir="$HOME/Library/Application Support/com.elgato.StreamDeck/NodeJS"; logDir="$HOME/Library/Logs/ElgatoStreamDeck"; { echo "=== NodeJS runtimes ==="; if [ -d "$nodeDir" ]; then find "$nodeDir" -type f -name node -exec ls -lh {} \;; echo "--- folder entries ---"; ls "$nodeDir"; else echo "NodeJS folder not found: $nodeDir"; fi; echo; echo "=== manifest.json ==="; if [ -f "$nodeDir/manifest.json" ]; then cat "$nodeDir/manifest.json"; else echo "manifest.json not found"; fi; echo; echo "=== Stream Deck log matches ==="; if [ -d "$logDir" ]; then grep -aiE 'node|environment is not yet ready|runtime|failed|error|sho-metrics' "$logDir"/*.log 2>/dev/null; else echo "log folder not found: $logDir"; fi; } > "$out"; open "$out"
```

### If the runtime download keeps failing

- Confirm your computer is online and can reach the internet reliably.
- Check that a firewall is not blocking the Stream Deck app from connecting.
- Check your antivirus logs for anything that blocked the Stream Deck app while
  it was downloading the Node.js runtime. Look for activity by the Stream Deck
  app itself, not by ShoMetrics, since the Stream Deck app is what downloads the
  runtime.
