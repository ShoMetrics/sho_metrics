+++
title = "About the Windows helper"
description = "When the optional Windows helper is needed and what its driver does."
weight = 10
aliases = ["/faq/why-helper/"]
+++

The helper is optional. Most users should start with just the Stream Deck
plugin and decide later. macOS users do not need the helper at all — it is
Windows-only.

Without the helper, the plugin can already show CPU, memory, disk and network
usage, and on NVIDIA cards: GPU usage, temperature, power, and voltage. That
covers most Stream Deck keys people set up first.

## Install the helper if you want

Depending on your hardware, the helper can also expose:

- CPU package temperature and power
- motherboard sensors, fan speed, voltage readings
- detailed GPU sensors, especially on non-NVIDIA cards
- other low-level data exposed by
  [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)

The exact list depends on your machine — different CPUs, GPUs, motherboards,
and sensor chips expose different data, and not every machine reports every
sensor. You can install the helper later; you do not need to decide during
your first setup.

## Why a driver is involved

Windows does not expose these deeper sensors through standard user-mode APIs.
Reading them requires a kernel driver. Many Windows system tools use drivers for
similar reasons, including antivirus tools, game anti-cheat systems, RGB and
fan-control utilities, and hardware-monitoring apps.

Installing any driver is still something to do deliberately. The rest of this
page explains what gets installed and what each part does.

## What gets installed

The helper sensor stack has two pieces:

- the ShoMetrics Windows helper, a local Windows service that runs in the background
- the third-party [PawnIO](https://pawnio.eu/) driver, used by
  [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
  inside the helper for low-level sensor access

ShoMetrics does not require you to install LibreHardwareMonitor separately —
the helper uses the library directly.

**If you do not already have PawnIO installed, the helper installer installs it
for you** — you will be asked to accept PawnIO's own agreement during that step.

If PawnIO is already installed, the helper installer leaves it as is and does not
reinstall it. To reinstall or update PawnIO, you can do that yourself from
[pawnio.eu](https://pawnio.eu/).

You can also choose not to install PawnIO. The helper still runs, but most of the
sensors it can provide will be unavailable without the driver.

This step is install-only: removing ShoMetrics later does not remove PawnIO —
you need to uninstall PawnIO yourself (see [What PawnIO is](#what-pawnio-is) below).

## What PawnIO is

[PawnIO](https://pawnio.eu/) is a small, signed Windows driver that hardware
tools use to read sensors Windows otherwise keeps locked away. The part that
matters for trust: it only lets a fixed set of **signed modules it trusts** reach
your hardware — never arbitrary apps or arbitrary code.

PawnIO is third-party software, and removing ShoMetrics does not remove it —
**if you would like PawnIO gone, you will need to uninstall it yourself** from
Windows Settings → Installed apps. ShoMetrics deliberately leaves it in place
because other popular tools use PawnIO too (for example OpenRGB and some Lian Li
case-lighting sync apps), and silently pulling a shared driver could break them
in surprising ways. If you are not sure whether anything else relies on it, a
safe check is to uninstall PawnIO and watch for anything breaking — if nothing
does, you are all set.

Some strict anti-cheat systems, such as FACEIT, have previously misreported
PawnIO. According to the PawnIO author, the
[PawnIO.Setup issue](https://github.com/namazso/PawnIO.Setup/issues/1#issuecomment-3893913885)
should be fixed as of 2.1.0. We recommend installing PawnIO only from the
official site, and using version 2.1.0 or newer.

### If you have read complaints about LHM's old WinRing0 driver

Older LibreHardwareMonitor versions shipped a driver called `WinRing0` that
had known security concerns (CVE-2020-14979) and is what some users have
flagged on reviews of other LHM-based tools. ShoMetrics has never used
WinRing0 — the helper has been built on PawnIO from the first release.

## If you do not want the driver

You can simply skip PawnIO. The Stream Deck plugin still works without the
helper, and the helper still runs without PawnIO — but most of the sensors the
helper can provide need driver access, so those will be unavailable.

## Before installing

- download the helper from the official ShoMetrics
  [download page](../../download/) or release, and download PawnIO only from
  [pawnio.eu](https://pawnio.eu/)
- be ready to approve administrator prompts for both installers
- note that uninstalling ShoMetrics does not automatically uninstall PawnIO

Ready to install? See
[How do I install the Windows helper?](../install-windows-helper/).
