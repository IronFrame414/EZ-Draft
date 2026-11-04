---
title: Verify three repos at pinned commits (license, commit date, Bluetooth protocol facts)
scope: https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>, https://api.github.com/repos/<owner>/<repo>/commits/<sha>, https://api.github.com/repos/<owner>/<repo>/git/trees/<sha>?recursive=1 for the three repos above only
ticket: EZD-1401
---

Method: WebFetch (a summarising fetch). Quotes below are as returned by that fetch; re-check exact bytes against the raw URL before copying code.

## (A) PointerEvent/bosch-plr-demo @ 8fb074b225dfa856c2721724b2862398a7bb9bf8

- LICENSE: "MIT License", "Copyright (c) 2024 Tobbe". https://raw.githubusercontent.com/PointerEvent/bosch-plr-demo/8fb074b225dfa856c2721724b2862398a7bb9bf8/LICENSE
- Commit date: author and committer 2024-10-03T10:10:51Z; message "Merge pull request #1 from Spomky-Labs/features/better-data-support". https://api.github.com/repos/PointerEvent/bosch-plr-demo/commits/8fb074b225dfa856c2721724b2862398a7bb9bf8
- app/index.html: exists. https://raw.githubusercontent.com/PointerEvent/bosch-plr-demo/8fb074b225dfa856c2721724b2862398a7bb9bf8/app/index.html
  - Service UUID: `const glmServiceUuid = "00005301-0000-0041-5253-534f46540000";`
  - Characteristic UUID: `const characteristicUuid = "00004301-0000-0041-5253-534f46540000";`
  - No start command literal in the page. Sent on connect: AutoSyncEnable `[0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a]`. Measure: `[0xc0, 0x40, 0x01, 0x00, 0xfa]`. Also laser on `[0xc0, 0x41, 0x00, 0x96]`, beep on `[0xc0, 0x45, 0x00, 0xd0]`, beep off `[0xc0, 0x46, 0x00, 0x58]`.
  - parseExchangeDataContainer works on the indication hex string (offsets are hex-string offsets): mode = chars 0-1; requestCommand = chars 2-3; dataLength = hex chars 4-5 (byte 2); data from byte 3 via extractData(message, 3, dataLength); checksum = last byte, extracted and logged only.
  - extractData (start = 3; returns empty object with error if length < 16): byte+0 DevModeRef (getUint8); +1 DevStatus (getUint8); +2 UniqueID getUint16 (big-endian, no flag); +4..+7 result = getFloat32(0, true), little-endian; +8..+11 component1 float32 LE; +12..+15 component2 float32 LE.
  - Distance: the float32 LE `result`, no scale factor, no unit conversion, no unit named in the page. Displayed as `data.result.toFixed(3)`. If dataLength is 0, data is `{}` and toFixed throws.
  - Checksum: NOT verified. Code comment reads "TODO: verification of the checksum (CRC8)". No CRC computed.
- docs/ contents (file names only): MT_connectivity_protocol_1_2_9.pdf, MT_connectivity_protocol_LRF_command_set_2_5_0.pdf. https://api.github.com/repos/PointerEvent/bosch-plr-demo/git/trees/8fb074b225dfa856c2721724b2862398a7bb9bf8?recursive=1

## (B) lz1asl/CaveSurvey @ 43f6ef352d8de4b6f3a9ddf29ba3536a464b9be0

- LICENSE.txt (no LICENSE or LICENSE.md at root): "The MIT License (MIT)", "Copyright (c) 2013 Cave Survey Project". https://raw.githubusercontent.com/lz1asl/CaveSurvey/43f6ef352d8de4b6f3a9ddf29ba3536a464b9be0/LICENSE.txt
- Commit date: author 2026-10-02 06:31:13 UTC; committer 2026-10-02 06:45:19 UTC; message "Fixes #189 - removed google play proprietary dependency info". https://api.github.com/repos/lz1asl/CaveSurvey/commits/43f6ef352d8de4b6f3a9ddf29ba3536a464b9be0
- src/main/java/com/astoev/cave/survey/service/bluetooth/device/ble/LeicaDistoBluetoothLEDevice.java: exists (blob size 5505 in tree). https://raw.githubusercontent.com/lz1asl/CaveSurvey/43f6ef352d8de4b6f3a9ddf29ba3536a464b9be0/src/main/java/com/astoev/cave/survey/service/bluetooth/device/ble/LeicaDistoBluetoothLEDevice.java
  - Service: `private static final UUID SERVICE_UUID = UUID.fromString("3ab10100-f831-4395-b29d-570977d5bf94");`
  - Distance characteristic: `public static final UUID CHARACTERISTIC_DISTANCE_UUID = UUID.fromString("3ab10101-f831-4395-b29d-570977d5bf94");`
  - Also: distance unit 3ab10102-..., angle 3ab10103-..., angle unit 3ab10104-... (same suffix).
  - Name match: `return deviceNameStartsWith(aName, "DISTO ");`
  - Decoding: `asFloat(aCharacteristic, ByteOrder.LITTLE_ENDIAN)` into a Float; tagged `Constants.MeasureUnits.meters`; no scale factor. Byte offsets not in this file (handled in AbstractBluetoothLEDevice, not fetched). Distance-unit characteristic read as UINT16 and must be 0-3 or throws "Please use meters".
  - Result: float32 little-endian, metres.
- Tree note: the listing was truncated after 100000 characters; not all files were checked. The Bosch-related part is said to use a private library (per handoff, not verified here).

## (C) seichter/d2relay @ d0f5d22399a4ace4be8bebca1cab24a11c7094ab

- license.md (no LICENSE file at root): the page does not name the license; the text matches standard MIT wording. "Copyright (c) 2021 Hartmut Seichter". https://raw.githubusercontent.com/seichter/d2relay/d0f5d22399a4ace4be8bebca1cab24a11c7094ab/license.md
- Commit date: author and committer 2025-01-17T07:31:52Z; message "update readme". https://api.github.com/repos/seichter/d2relay/commits/d0f5d22399a4ace4be8bebca1cab24a11c7094ab
- app/__main__.py: exists. https://raw.githubusercontent.com/seichter/d2relay/d0f5d22399a4ace4be8bebca1cab24a11c7094ab/app/__main__.py
  - No service UUID hard-coded (services printed only in debug mode).
  - Measurement characteristic: `"3ab10101-f831-4395-b29d-570977d5bf94"` (same as B). Also power state `"00002a1a-0000-1000-8000-00805f9b34fb"` and battery `"00002a19-0000-1000-8000-00805f9b34fb"`.
  - Subscribe: `await client.start_notify(characteristic, reporter.report_measurement)`.
  - Decoding: `print(f"measurement: {struct.unpack('f', data)[0]}")`. Native byte order (no prefix), 4 bytes, no offsets, no scale, no unit. On a Linux/x86 host this is little-endian; the code does not state it.
- Tree: app/__main__.py is the only file with that basename. https://api.github.com/repos/seichter/d2relay/git/trees/d0f5d22399a4ace4be8bebca1cab24a11c7094ab?recursive=1

## Cross-check of (B) against (C)

Both use characteristic UUID 3ab10101-f831-4395-b29d-570977d5bf94 for distance. Both decode a 4-byte float. (B) pins little-endian; (C) uses native order with no prefix. Units: (B) says metres in code; (C) names none.
