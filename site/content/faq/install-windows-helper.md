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
3. If you want sensors that need driver access, install
   [PawnIO](https://pawnio.eu/) yourself from pawnio.eu. The helper does not
   install PawnIO for you. Skip this step if you do not want deeper sensors.
4. Restart Stream Deck if a ShoMetrics key does not pick up helper data right
   away.

After installation, open the ShoMetrics control panel to confirm the helper
service is running and, if you installed it, that the PawnIO driver is
detected.

## If the helper does not work

Open the ShoMetrics control panel first. It reports whether the helper service
is running, the IPC connection state, and the PawnIO driver status — most
issues are visible there.

If the panel shows the helper running but a specific metric is still empty,
your machine may not expose that sensor. The helper can only show what your
hardware, drivers, and LibreHardwareMonitor can read.
