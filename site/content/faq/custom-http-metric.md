+++
title = "Custom HTTP metrics"
description = "How a custom HTTP metric works."
weight = 30
+++

A custom HTTP metric lets you point ShoMetrics at an HTTP endpoint that returns
JSON, pull a value out of the response, and show it on a Stream Deck key like
any other metric.

## Who this is for

Most people won't need this — the built-in metrics already cover monitoring your
own machine, from CPU, GPU, memory, disk and network to deeper hardware sensors.
Custom HTTP is really for advanced users who are comfortable with a little
technical setup. You might use it to show the weather, for example, or a reading
from your [Home Assistant](https://www.home-assistant.io/) setup.

> If what you're after is local hardware sensors through
> [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor),
> it's worth knowing that although LHM can expose its readings as a JSON server
> you could point this feature at, we recommend the
> [Windows helper](../helper/) instead — it's the path we build and tune
> specifically for reading LHM data.

## How it works, in a nutshell

You give ShoMetrics a URL (and authentication, if the endpoint needs it), it
fetches the JSON, and a [jq](https://jqlang.org/) filter turns that JSON into the
metric format ShoMetrics can display.

## Step by step

### 1. The URL

This is where the endpoint URL goes. For now, only `GET` requests are supported.

> It's best not to put any credentials directly in the URL — it isn't a safe
> place for them. If your endpoint needs authentication, the Authentication
> section below is the place for it.

### 2. What to show

In **What to show**, you can describe, in plain language, the value you'd like to
display — in other words, what you'd like turned into a metric. This text is
folded into the AI prompt (see [The AI prompt](#6-the-ai-prompt-optional) below).

There's no need to put any secret here — credentials belong in the Authentication
section, not in this text.

It's optional, and it isn't itself used to transform the data. That said, if
you're planning to use the AI prompt, the more specific you can be, the better —
ideally including a link to the endpoint's schema or API documentation.

- **Good:** "I'd like to show today's temperature for Chiyoda, Tokyo, and please
  suggest a sensible maximum value for the display. API docs:
  https://open-meteo.com/en/docs"
- **Workable:** "Show today's temperature in Tokyo."
- **Not so helpful:** "Show the weather." (No date, "weather" is generic, no
  mention of temperature versus wind speed, and no location.)

If you don't need request settings or authentication, please feel free to skip
ahead to [Fetching a sample](#5-fetching-a-sample).

### 3. Request settings (optional)

Here you can adjust a few extras, such as the timeout for each request and how
many times it should retry.

> One thing worth keeping in mind: each ShoMetrics widget polls on its own
> schedule, every few seconds. If your total request time (timeout multiplied by
> retries) is longer than that polling interval, updates can start to fall behind
> the refresh rate — so it's a good idea to keep the total comfortably under it.

### 4. Authentication (optional)

If your endpoint needs authentication, you can set it up here.

> **Where your credentials are stored.** They're stored in ShoMetrics global
> settings using Stream Deck's
> [global settings API](https://docs.elgato.com/streamdeck/sdk/guides/settings/),
> which Elgato recommends for user-provided API keys and access tokens. They
> aren't included when you export an action, and they remain local to this
> machine — so you'll set them up again on another machine.

ShoMetrics supports a few methods:

- **None** — the default, for open endpoints that don't need authentication.
- **Basic** — a username and password, sent as a standard `Authorization`
  header. This one's for endpoints behind HTTP Basic authentication, such as
  some local tools.
- **Bearer token** — a token sent as `Authorization: Bearer <token>`, common for
  modern APIs that issue an access token.
- **API key in a header** — you name the header (for example `X-API-Key`) and
  provide its value. This is for APIs that expect their key in a custom header.
- **API key in the query string** — you name the parameter (for example
  `api_key`) and provide its value. ShoMetrics adds it to the request when it
  fetches, so the token is never written into the URL field you typed.

#### Authentication is shared

A credential is a named credential, stored once in global settings; each widget
just keeps a reference to it. So a credential is shared rather than tied to a
single key:

- once you've created it, you can reuse the same credential across widgets;
- if you edit it, every widget that shares it is updated;
- if you delete it, the credential itself is removed, and any widget still using
  it will show a "missing credential" state until you pick another credential or
  switch to no authentication.

#### Removing a credential

Any Custom HTTP editor lists your saved credentials, so you can open any action
— it doesn't have to be one that currently uses the credential — and remove it
from there. It's only worth remembering that removing a credential affects every
widget that shares it.

#### Secrets are hidden once saved

After you save a secret, it's no longer shown back to you in the interface. This
is so it can't be leaked by accident — for instance, if you happen to open this
panel while streaming. If you'd like to change it, you can simply overwrite it
with a new value.

### 5. Fetching a sample

When you're ready, the **Fetch Sample** button fetches your first response. If it
doesn't work, the interface will explain what went wrong; and if the button is
disabled, the reason is shown right next to it.

If you're already comfortable with [jq](https://jqlang.org/), you can head
straight to [The jq filter](#7-the-jq-filter). Otherwise, the AI prompt is the
next step.

### 6. The AI prompt (optional)

If you'd rather not write jq yourself, ShoMetrics prepares a prompt you can copy
into your favorite AI chatbot and have it write the jq for you. The **Copy
Prompt** button is there for this.

> Please keep in mind that ShoMetrics doesn't talk to the AI for you, and it
> won't run whatever the AI replies with. Once the chatbot gives you a jq filter,
> you'll bring it back to ShoMetrics yourself and run it with **Test Transform**.
> You stay in control of what gets copied and run.

> The prompt includes your request URL, a sample of the JSON response, and your
> **What to show** text. It does **not** include the secret you set in the
> Authentication section, and we redact what we can — but it's worth a quick look
> for anything sensitive before you paste it into an external service.
> ShoMetrics can't be responsible for information you choose to share externally.

Once you've pasted the prompt, a few things might happen:

- The chatbot gives you a final jq filter — you run it with **Test Transform**,
  and you get a working result.
- It gives you a filter that fails when you run it — you can copy the failure
  debug details back to the chatbot so it can fix the filter.
- It doesn't give you a filter yet, but tells you what to do next — you can
  follow along from there.
- It needs a little more information and offers an exploratory jq filter — you
  run that, then paste the **Exploration Output** back so it can write the final
  filter.

### 7. The jq filter

As mentioned above, [jq](https://jqlang.org/) is the step that turns arbitrary
JSON from the web into the format ShoMetrics understands. Different APIs return
different JSON shapes, and jq is what reshapes any of them into a single
ShoMetrics metric.

> **Why jq, rather than custom JavaScript?** We've deliberately chosen not to let
> the transform run arbitrary code — running arbitrary code inside the plugin is
> a risk we'd rather not take on. jq is a focused query language for JSON, which
> is plenty for reshaping a response into a metric, without that exposure.
