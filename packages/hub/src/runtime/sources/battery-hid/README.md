# Vendor HID Battery Sources

This directory contains direct HID battery readers for vendor-specific receivers
and peripherals. Treat every new HID route as hardware-facing protocol work, not
as a local ShoMetrics convention.

The `vendor-hid-battery-*` files in this directory own the runtime source
client, route registry, and HID operation coordination for those vendor readers.

## Adding Devices To An Existing Vendor

- A new VID/PID/interface/usage route must have a credible source:
  - a referenced open-source implementation, or
  - hardware tested on a real device.
- Record enough source context in code comments or nearby documentation for a
  later reviewer to answer why the route is believed to be safe and what device
  was validated.
- Do not infer model names or receiver behavior from a vendor list alone. A
  route may be added from real hardware evidence, but the evidence should be
  stated.

## Adding A New Vendor

Do not hand-write a new vendor HID protocol from guesswork. A new vendor reader
must be based on one of these sources:

- a credible Node.js implementation that can be used without requiring users to
  install an extra third-party executable; or
- a license-compatible, byte-for-byte protocol port from another language.

If a source project requires an external helper executable, do not wire that
helper into ShoMetrics as the first implementation. The current boundary is the
Hub plugin using bundled Node dependencies. Expanding ShoMetrics helper support
for another vendor is a separate architecture decision, not a battery-HID route
addition.

When porting from another language, keep protocol facts traceable: report
layout, feature IDs, command bytes, payload offsets, enum decoding, and timeout
semantics should all point back to the source implementation.
