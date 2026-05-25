+++
title = "About the Windows helper"
description = "When the optional Windows helper is needed and what its driver does."
weight = 10
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

- the ShoMetrics Windows helper, a user-mode local service
- the third-party [PawnIO](https://pawnio.eu/) driver, used by
  [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
  inside the helper for low-level sensor access

ShoMetrics does not require you to install LibreHardwareMonitor separately —
the helper uses the library directly.

**PawnIO is installed by you, not by the helper.** You download and install
PawnIO yourself from [pawnio.eu](https://pawnio.eu/); the helper does not
install or bundle it. This is by design of PawnIO's authors — PawnIO is meant
to be installed explicitly by the user, not silently by other apps.

If you do not install PawnIO, the helper still runs, but sensors that need
driver access will be unavailable.

## What PawnIO is

[PawnIO](https://pawnio.eu/) is a signed Windows kernel driver used by
hardware tooling to reach sensors that standard user-mode APIs cannot. Rather
than exposing raw I/O to user-mode callers, it runs small signed bytecode
modules that each perform one task — read this sensor, query that chip — which
keeps the attack surface narrower than older "give-me-MSR-access" drivers.

PawnIO is third-party software. If you later remove ShoMetrics and no other
app on your PC uses PawnIO, you can uninstall it from Windows Settings →
Installed apps.

Some strict anti-cheat systems, such as FACEIT, have previously misreported
PawnIO. According to the PawnIO author, the
[PawnIO.Setup issue](https://github.com/namazso/PawnIO.Setup/issues/1#issuecomment-3893913885)
should be fixed as of 2.1.0. Install PawnIO only from the official site, and
use PawnIO 2.1.0 or newer.

### If you have read complaints about LHM's old WinRing0 driver

Older LibreHardwareMonitor versions shipped a driver called `WinRing0` that
had known security concerns (CVE-2020-14979) and is what some users have
flagged on reviews of other LHM-based tools. ShoMetrics has never used
WinRing0 — the helper has been built on PawnIO from the first release.

## If you do not want the driver

Do not install PawnIO. The Stream Deck plugin still works without the helper,
and the helper still works without PawnIO — you just will not see sensors
that need driver access.

## Before installing

- download the helper from the official ShoMetrics
  [download page](../../download/) or release, and download PawnIO only from
  [pawnio.eu](https://pawnio.eu/)
- be ready to approve administrator prompts for both installers
- note that uninstalling ShoMetrics does not automatically uninstall PawnIO

Ready to install? See
[How do I install the Windows helper?](../install-windows-helper/).
