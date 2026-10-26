# Device Battery Monitor

List battery levels of 2.4 GHz wireless keyboards and mice by querying their USB receivers over vendor HID protocols — no pairing, no firmware flashing, no configuration changes. Also lists other connected HID devices for reference.

## How it works

Many 2.4 GHz wireless peripherals report battery level through their USB receiver: the receiver exposes a vendor-defined HID interface, and a short Feature Report exchange returns a status report containing the battery percentage. This extension speaks that protocol on macOS via a small native IOKit helper.

The extension only sends status queries. It never modifies DPI, polling rate, pairing, or firmware.

## Supported devices

| Device                          | VID:PID     | Status                                                     |
| ------------------------------- | ----------- | ---------------------------------------------------------- |
| Keychron Ultra-Link 8K receiver | `3434:D028` | Verified on macOS (2026-10-26)                             |
| Keychron M5 (wired mode)        | `3434:D048` | Protocol documented by HaloBattery, not yet tested locally |

Matching is exact by VID/PID + HID usage page/usage. "Works with brand X" does **not** mean every device from that brand is supported, and the same device may expose different USB IDs in wired vs wireless mode. Battery values are point-in-time readings taken when you refresh — not a continuous stream. Charging state is not parsed.

## Usage

Open **View Devices Battery** in Raycast:

- **Battery** — devices with a known protocol, showing the last-read percentage (low battery first, stale readings flagged after 5 minutes)
- **Query Failures** — supported devices whose query failed, with the structured error (including IOKit return codes)
- **Other HID Devices** — remaining USB / Bluetooth HID interfaces (deduplicated per physical device)

Actions: refresh, copy battery level, copy the raw reply bytes (for protocol debugging), toggle a detail pane with full protocol metadata, open the protocol source.

## Adding a device

Protocol knowledge is data-driven. Add one record to `src/constants/devices.ts`:

```ts
{
  id: "my-device",
  name: "My Receiver",
  vendorId: 0x1234,
  productId: 0x5678,
  usagePage: 0xffc0,        // vendor-defined interface
  usage: 0x0001,
  request: "b306" + "00".repeat(62),  // feature report to send
  replyPrefix: "b406",      // expected input report header
  batteryOffset: 20,        // battery byte offset in the reply
  reportEncoding: "auto",   // use "raw" once the encoding is confirmed
  source: "https://…",
}
```

Then run `npm run smoke` to verify against real hardware before opening Raycast.

## Architecture

```
src/
  constants/devices.ts     # protocol registry (add devices here)
  service/batteryService.ts# Effect pipeline: match → query (retry/timeout) → parse
  utils/native.ts          # Effect-wrapped hid-query bridge
  utils/hex.ts             # hex parsing / dump formatting
  utils/batteryView.ts     # radash-powered list data preparation
  types/                   # tool output shapes + tagged errors
native/hid-query.c         # generic IOKit HID feature-report tool (list / query)
scripts/build-native.js    # compiles hid-query into assets/ (universal binary)
scripts/smoke-query.ts     # headless protocol smoke test (npm run smoke)
```

- **Native helper** (`hid-query`): enumerates HID interfaces via IORegistry and performs a single Feature Report → Input Report exchange per query. It contains no device-specific protocol knowledge. Enumeration avoids opening system-protected devices (which fails with `kIOReturnNotPrivileged`); only the target interface is opened, non-exclusively.
- **effect** models the pipeline: tagged errors (`Data.TaggedError`), `Effect.timeout` + `Effect.retry` (3 attempts, 100 ms apart — matching HaloBattery), `Effect.either` per device so one failure never blocks the rest.
- **radash** powers list preparation: `tryit` for tool output parsing, `fork` for partitioning, `group`/`mapEntries` for per-device deduplication, `sort`/`alphabetical` for ordering.

## Troubleshooting

- **`open-failed` with `0xE00002C5` / `0xE00002E2`** — the HID interface could not be opened (permission or sandbox restriction). Run the query manually in a terminal to check: `./assets/hid-query list --json`.
- **`no-device`** — the receiver was unplugged between enumeration and query, or the interface does not match the registry entry.
- **`timeout`** — the receiver did not answer within the wait window. Wake the mouse/keyboard and refresh.
- **Rebuilding the helper** — `npm run build-native` (requires Xcode Command Line Tools). The build is incremental and produces a universal arm64 + x86_64 binary in `assets/hid-query`.

## References

- [HaloBattery](https://github.com/HeyOkay/HaloBattery) — multi-brand battery tool; the Keychron implementation and [protocol documentation](https://github.com/HeyOkay/HaloBattery/blob/main/docs/protocols.md) used here
- [keychron-battery-dkms](https://github.com/csutcliff/keychron-battery-dkms) — Linux driver with the original Keychron protocol
- [BatteryMonitor](https://github.com/JKWTCN/BatteryMonitor), [2.4G-battery-viewer](https://github.com/yszyszysz233/2.4G-battery-viewer), [Jingzao-JZM5-Battery](https://github.com/LANMIN-X/Jingzao-JZM5-Battery), [Solaar](https://github.com/pwr-Solaar/Solaar) — related projects by platform
