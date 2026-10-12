# FormNerd open camera

A15 Rev E is a screenless camera project. The iPhone is the viewfinder and control surface over local Wi-Fi or wired USB-C Ethernet. A physical shutter and on-camera storage must work when the phone is disconnected.

The [priced component list](../public/bygg/bom.json) and [live build page](https://formnerd.iverfinne.no/bygg) identify exact currently listed parts for a first Sony ILX-LR1 integration bench. The linked prices are a dated US catalog snapshot, not a manufactured product cost or a Norway delivered quote. This repository does not yet contain a qualified A15 enclosure, metal carrier, power PCB or physical test results.

[`phone_link`](phone_link/README.md) contains the original open mock server, API contract, SwiftUI source, synthetic image fixtures and tests. Run its Python tests with:

```text
cd open-camera
python -m unittest discover -s phone_link -p 'test_*.py' -v
```

The mock has no Sony camera connection, pairing or TLS and must be used only on a trusted development network. The SwiftUI source has not been compiled or run on iPhone in this Windows workspace. Sony's Camera Remote SDK, firmware, sensor processing and lens electronics are proprietary and are not included or licensed by this repository. To build a real camera, obtain the current Sony SDK through its own process and prove live view, RAW capture, power, optical fit and legal distribution terms on physical hardware.

The original code, protocol and synthetic fixtures under `open-camera` are licensed under [MIT](LICENSE). The public bill of materials is factual sourcing data; linked manufacturer and seller pages retain their owners' rights. Future FormNerd hardware CAD should use a separate open hardware license when controlled native design files are ready.
