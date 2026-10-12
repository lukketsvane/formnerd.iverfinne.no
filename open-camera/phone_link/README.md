# FormNerd phone link prototype

This folder holds a Python mock camera, an OpenAPI contract, eight synthetic JPEG viewfinder frames, tests and SwiftUI source for the proposed A15 screenless phone link. The mock captures synthetic RAW16 data. It has no Sony SDK, real sensor, DNG writer, hardware shutter input, pairing or TLS. Only use it on a trusted development network.

## Run the mock

From `open-camera` with Python 3.11 or newer:

```text
python phone_link/mock_camera.py --storage phone_link/mock_storage
python -m unittest discover -s phone_link -p "test_*.py" -v
```

The server binds to `127.0.0.1:8765` by default. To connect from an iPhone on a trusted LAN, start it with `--bind 0.0.0.0` and enter `http://<computer-LAN-IP>:8765` in the app. Stop it after testing. Never expose this mock to the internet or an untrusted network.

The API offers identity, capabilities, state, settings, preview frames, shutter, media list and file download. [`openapi.json`](openapi.json) is the protocol record. Captures are synthetic 256 × 170 little-endian RAW16 files; the JPEG sequence is a motion test fixture. The SwiftUI client polls preview frames, reads control ranges from `/v1/capabilities` and checks downloaded file hashes. The file format is not photographic DNG and the displayed preview is not evidence of an image sensor.

## Build the iPhone source

[`ios_source/README.md`](ios_source/README.md) gives the Xcode steps. A Mac with Xcode and a physical USB-C iPhone are needed to compile and test it. This Windows workspace has only validated the Python mock/contract tests and parsed `Info.plist`; no iPhone build or wired/wireless performance claim has been verified.

For the proposed real camera, the Sony ILX-LR1 must connect to a Linux bridge through Sony's licensed Camera Remote SDK. The iPhone client would talk to an A15-authored IP service on that bridge. Sony firmware and SDK binaries are separate proprietary components and are not included. [Sony's SDK page](https://support.d-imaging.sony.co.jp/app/sdk/en/index.html) lists ILX-LR1 and Linux ARMv8 support, but per-camera live-view behaviour, RAW transfer, link latency and concurrent capture still need a physical bench test.

The first wired path uses a USB-C Ethernet adapter at the phone and a direct Ethernet cable to the Linux bridge. The wireless path uses the bridge's local Wi-Fi access point. A direct one-cable USB-C camera-to-iPhone link remains unproven. A later product needs authenticated pairing, HTTPS, link recovery, measured latency, hardware-triggered storage and a qualified portable power system.
