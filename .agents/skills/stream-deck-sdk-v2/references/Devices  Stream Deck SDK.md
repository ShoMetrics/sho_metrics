The Stream Deck SDK provides a list of available Stream Deck devices.

Array of available devices

```
<span><span>import</span><span> streamDeck</span><span> from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>devices</span><span>.</span><span>forEach</span><span>((</span><span>device</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>const</span><span> { </span><span>id</span><span>, </span><span>isConnected</span><span>, </span><span>name</span><span>, </span><span>size</span><span>, </span><span>type</span><span> } = </span><span>device</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>name</span><span>); </span><span>// Stream Deck Neo, Stream Deck +</span></span>
<span><span>});</span></span>
```

## Device Types[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#device-types "Direct link to Device Types")

Within the Stream Deck SDK, devices are referenced against an enumeration of known devices; these devices, and their associated values, are as follows:

| Device Type | Device(s) |
| --- | --- |
| 0 | [Stream Deck](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck), [Stream Deck Scissor Keys](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-scissor-keys) |
| 1 | [Stream Deck Mini](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-mini) |
| 2 | [Stream Deck XL](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-xl) |
| 3 | [Stream Deck Mobile](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-mobile) |
| 4 | [Corsair GKeys](https://docs.elgato.com/streamdeck/sdk/guides/devices/#corsair-g-keys) |
| 5 | [Stream Deck Pedal](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-pedal) |
| 6 | [Corsair Voyager](https://docs.elgato.com/streamdeck/sdk/guides/devices/#corsair-voyager) |
| 7 | [Stream Deck +](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-plus) |
| 8 | [SCUF Controller](https://docs.elgato.com/streamdeck/sdk/guides/devices/#scuf-controller) |
| 9 | [Stream Deck Neo](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-neo) |
| 10 | [Stream Deck Studio](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-studio) |
| 11 | [Virtual Stream Deck](https://www.elgato.com/s/virtual-stream-deck) |
| 12 | [Galleon 100 SD](https://docs.elgato.com/streamdeck/sdk/guides/devices/#galleon-100-sd) |
| 13 | [Stream Deck + XL](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-plus-xl) |

## Connecting[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#connecting "Direct link to Connecting")

Your plugin can monitor when a Stream Deck device is connected using the `onDeviceDidConnect` event.

Device connected callback

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>DeviceDidConnectEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>devices</span><span>.</span><span>onDeviceDidConnect</span><span>((</span><span>ev</span><span>: </span><span>DeviceDidConnectEvent</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>const</span><span> { </span><span>id</span><span>, </span><span>isConnected</span><span>, </span><span>name</span><span>, </span><span>size</span><span>, </span><span>type</span><span> } = </span><span>ev</span><span>.</span><span>device</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>name</span><span>);</span></span>
<span><span>});</span></span>
```

## Changing[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#changing "Direct link to Changing")

Your plugin can monitor when a Stream Deck device changes, for example its name or size, using the `onDeviceDidChange` event.

Device change callback

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>type</span><span> DeviceDidChangeEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>devices</span><span>.</span><span>onDeviceDidChange</span><span>((</span><span>ev</span><span>: </span><span>DeviceDidChangeEvent</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>const</span><span> { </span><span>id</span><span>, </span><span>isConnected</span><span>, </span><span>name</span><span>, </span><span>size</span><span>, </span><span>type</span><span> } = </span><span>ev</span><span>.</span><span>device</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>name</span><span>);</span></span>
<span><span>});</span></span>
```

Availability

Monitoring device changes is available from Stream Deck 7.0

## Disconnecting[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#disconnecting "Direct link to Disconnecting")

Your plugin can monitor when a Stream Deck device disconnects using the `onDeviceDidDisconnect` event.

Device disconnected callback

```
<span><span>import</span><span> streamDeck</span><span>, { </span><span>DeviceDidDisconnectEvent</span><span> } </span><span>from</span><span> "@elgato/streamdeck"</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>devices</span><span>.</span><span>onDeviceDidDisconnect</span><span>((</span><span>ev</span><span>: </span><span>DeviceDidDisconnectEvent</span><span>) </span><span>=&gt;</span><span> {</span></span>
<span><span>const</span><span> { </span><span>id</span><span>, </span><span>isConnected</span><span>, </span><span>name</span><span>, </span><span>size</span><span>, </span><span>type</span><span> } = </span><span>ev</span><span>.</span><span>device</span><span>;</span></span>
<span></span>
<span><span>streamDeck</span><span>.</span><span>logger</span><span>.</span><span>info</span><span>(</span><span>name</span><span>);</span></span>
<span><span>});</span></span>
```

Disconnected Device Visibility

While you can use these events to optimize resource utilization, the keys/encoders can still be visible in the Stream Deck app while the hardware is disconnected.

## Hardware[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#hardware "Direct link to Hardware")

Stream Deck hardware comes in many form factors.

### Stream Deck Neo[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-neo "Direct link to Stream Deck Neo")

Great workflows made easy. Meet Stream Deck Neo, an eight-key controller that makes everyday tasks fast and fun. So you can focus on bigger things.

-   8 customizable LCD keys.
-   2 capacitive touch buttons for paging.

![Stream Deck Neo](https://docs.elgato.com/img/devices/stream-deck-neo.png)

### Stream Deck[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck "Direct link to Stream Deck")

Stream Deck features 15 customizable LCD keys to control apps and platforms. Hit the store for app plugins, icons, tracks plus effects, and keep your setup fresh with interchangeable faceplates.

-   15 customizable LCD keys.

![Stream Deck](https://docs.elgato.com/img/devices/stream-deck.png)

### Stream Deck Scissor Keys[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-scissor-keys "Direct link to Stream Deck Scissor Keys")

Same Stream Deck power, now with a sharper snap. Smooth, fast, and precise, each key press enables you to control apps, platforms, and devices like never before.

-   15 customizable LCD keys.

![Stream Deck Scissor Keys](https://docs.elgato.com/img/devices/stream-deck-scissor-keys.png)

### Stream Deck +[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-plus "Direct link to Stream Deck +")

Iconic Stream Deck tech with customizable LCD keys, dials, and touch strip. Stream Deck + is your audio mixer, studio controller, production console – anything you want it to be.

-   8 customizable LCD keys.
-   4 dials with rotation and press, with touch strip.

![Stream Deck +](https://docs.elgato.com/img/devices/stream-deck-plus.png)

### Stream Deck + XL[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-plus-xl "Direct link to Stream Deck + XL")

With dozens of customizable controls and endless integrations, Stream Deck + XL puts entire productions and systems under your command—all from one intuitive interface.

-   36 customizable LCD keys.
-   6 dials with rotation and press, with touch strip.

![Stream Deck + XL](https://docs.elgato.com/img/devices/stream-deck-plus-xl.png)

### Stream Deck XL[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-xl "Direct link to Stream Deck XL")

Boasting 32 customizable LCD keys poised to launch unlimited actions with a tap, Stream Deck XL takes production control to a whole new level.

-   32 customizable LCD keys.

![Stream Deck XL](https://docs.elgato.com/img/devices/stream-deck-xl.png)

### Stream Deck Mini[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-mini "Direct link to Stream Deck Mini")

With Stream Deck Mini, take full control of your content and focus on what matters most: your audience.

-   6 customizable LCD keys.

![Stream Deck Mini](https://docs.elgato.com/img/devices/stream-deck-mini.png)

### Stream Deck Pedal[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-pedal "Direct link to Stream Deck Pedal")

Sturdy, customizable and discreet, Stream Deck Pedal gives you instant hands-free control of your apps and tools.

-   3 customizable pedals.

![Stream Deck Pedal](https://docs.elgato.com/img/devices/stream-deck-pedal.png)

### Stream Deck Studio[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-studio "Direct link to Stream Deck Studio")

Iconic Elgato hardware powered by custom Bitfocus software. Meet Stream Deck Studio, a hyper-customizable control surface for pro broadcast systems. Built to simplify complex workflows.

-   32 customizable LCD keys.
-   2 dials with rotation and press.

![Stream Deck Studio](https://docs.elgato.com/img/devices/stream-deck-studio.png)

### Stream Deck Mobile[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#stream-deck-mobile "Direct link to Stream Deck Mobile")

Stream Deck Mobile brings professional stream control, powerful integrations, and the iconic Stream Deck workflow to your iPhone or Android phone.

-   Up to 64 customizable LCD keys.

![Stream Deck Mobile](https://docs.elgato.com/img/devices/stream-deck-mobile.png)

### Corsair Galleon 100 SD[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#galleon-100-sd "Direct link to Corsair Galleon 100 SD")

The first high-performance gaming keyboard with a built-in Stream Deck is here. Galleon 100 SD combines Corsair and Elgato engineering for deep control and insight at your fingertips.

-   2 dials with rotation and press.
-   LCD screen
-   12 customizable LCD keys.

![Galleon 100 SD](https://docs.elgato.com/img/devices/galleon-100-sd.png)

### Corsair G-Keys[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#corsair-g-keys "Direct link to Corsair G-Keys")

-   6 customizable macro keys.

![Corsair Keyboard](https://docs.elgato.com/img/devices/corsair-g-keys.png)

### Corsair Voyager[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#corsair-voyager "Direct link to Corsair Voyager")

The Corsair Voyager combines cutting-edge gaming performance with the best of Corsair, powered by the latest AMD Ryzen™ processors and AMD Radeon™ graphics.

-   Up to 10 customizable capacitive keys

![Corsair Voyager Laptop](https://docs.elgato.com/img/devices/voyager-laptop.png)

### SCUF Controller[](https://docs.elgato.com/streamdeck/sdk/guides/devices/#scuf-controller "Direct link to SCUF Controller")

Designed specifically for PC gaming, Envision has more inputs than your standard controller allowing you endless customization and the performance you need.

-   5 customizable macro buttons.

![Scuf Controller](https://docs.elgato.com/img/devices/scuf-game-controller.png)