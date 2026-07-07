+++
title = "How do I install the Windows helper?"
description = "Install the optional Windows helper for deeper ShoMetrics hardware sensors."
weight = 20
+++

Install the helper only if you want deeper hardware sensors. If you are not
sure, install the Stream Deck plugin first and come back later. Before
continuing, read [About the Windows helper](../helper/) for what gets
installed and what the PawnIO driver does.

## Install steps

1. Install ShoMetrics in the Stream Deck app.
2. Download the Windows helper installer from the
   [download page](../../download/), run it, and approve the Windows
   administrator prompt.
3. The helper installer installs [PawnIO](https://pawnio.eu/) for you. If PawnIO is already
   installed, the installer leaves your existing copy as is rather than
   upgrading it. You can update PawnIO yourself from the official site whenever
   you like.
4. Restart Stream Deck if a ShoMetrics key does not pick up helper data right
   away.

After installation, open the ShoMetrics control panel to confirm the helper
service is running and, if you installed it, that the PawnIO driver is
detected.

## If the helper does not work

Open the ShoMetrics control panel first. It reports whether the helper service
is running, the helper connection state, and the PawnIO driver status — most
issues are visible there.

If the panel shows the helper running but a specific metric is still empty,
your machine may not expose that sensor. The helper can only show what your
hardware, drivers, and LibreHardwareMonitor can read.

When reporting helper issues, include the helper version, plugin version,
source protocol version, and any gRPC status shown by the control panel or
Stream Deck logs. The helper and plugin can be different versions if only one
of them was updated.
