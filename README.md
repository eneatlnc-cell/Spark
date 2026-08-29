# Spark — the loop's public front door

This repository is the **Spark Loop website**: the widest-exposure
surface of the eneatlnc-cell sovereignty circuit. One app in (Engine +
Vault), three paths forward (user / builder / capital), every claim
traceable to public code.

Live at: **https://eneatlnc-cell.github.io/Spark/**

## What lives here

| Path | What it is |
|---|---|
| `index.html` | Gateway: Engine-first hero, download panel, the big circuit loop |
| `engine.html` / `vault.html` | The shipped consumer apps — the market's first door |
| `aether.html` / `havix.html` / `spark.html` | Layer deep-dives: governance, L0 substrate, the fuel |
| `whitepaper.html` | The whitepaper, with allocation pie and unlock curves |
| `rewards.html` | Referral & incentive policy |
| `CANON.md` | **The single source of truth** for loop narrative and key numbers |
| `assets/` | Shared CSS / JS / icons; `site.js` holds the APK download config |
| `_shared/` | Fonts and chart libraries (served raw — `.nojekyll` is required) |

Deploying: GitHub Pages from `main` root. The `.nojekyll` file is
mandatory — Jekyll skips `_shared/` and breaks every chart and font.

## License

This repository is licensed under the **Apache License, Version 2.0**.

- Full license text: see [LICENSE](./LICENSE)
- Notices: see [NOTICE](./NOTICE)
- Copyright: © 2026 eneatlnc-cell Contributors

Loop license map:

- [Engine3.0](https://github.com/eneatlnc-cell/Engine3.0) — public E2EE audit edition, **AGPL-3.0-only**
- [Havix](https://github.com/eneatlnc-cell/Havix) — L0 P2P substrate, **AGPL-3.0-only**
- [Aether](https://github.com/eneatlnc-cell/Aether) — governance kernel on BSC, **Apache-2.0**
- [Spark](https://github.com/eneatlnc-cell/Spark) (this repo) — site & canon, **Apache-2.0**

Rationale: the trust substrate (protocol + network layer) carries
strong copyleft — modified nodes serving the public must publish their
changes (AGPL §13). The governance kernel and public-facing site stay
permissive for maximum adoption and cross-referencing.
