<div align="center">

<img src="assets/icons/pekko.iconset/icon_256x256.png" width="128" />

# Pekko

**A typing soundscape, tuned to your mode.**

Flow-state audio for macOS · Made for deep work · Open source · Fully offline

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Apache_2.0-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/UltiSpike/pekko/releases"><img src="https://img.shields.io/badge/v0.1.0-green?style=flat-square" alt="Version" /></a>
  <img src="https://img.shields.io/badge/macOS_11+-000?style=flat-square&logo=apple&logoColor=white" alt="macOS" />
</p>

**[中文](README_CN.md)**

</div>

&nbsp;

<!-- TODO: 30s screen recording — launch → type → switch profile → switch theme -->
<!-- <p align="center"><img src="assets/preview.gif" width="640" /></p> -->

```bash
git clone https://github.com/UltiSpike/pekko.git && cd pekko && npm i && npm run dev
```

`‹` `›` next mode · `←` `→` switch profiles · `Q` `E` switch themes · `⇧⌘K` global toggle

<sub>macOS 11+ / Node 18+ / Accessibility permission required on first launch — reads keycodes only, never input content (<a href="PRIVACY.md">privacy statement</a>)</sub>

&nbsp;

---

&nbsp;

## Four modes

| Mode | Bed | Character |
|------|-----|-----------|
| **Thock** · default | — | Heavy low-end, warm decay, satisfying weight on every keystroke |
| Deep Focus | brown, -38 dB | Muted keys behind a warm bed — disappear into the work |
| Cozy Writing | pink, -40 dB | Softer keys with pink warmth — long sessions |
| Classic Mech | — | Full mechanical fidelity, every switch as recorded |

&nbsp;

---

&nbsp;

## Acoustic engine

Per-mode morph: low-shelf weight, wet mix, air LPF, per-key jitter. Constant across modes: 24-voice pool, 104-key stereo pan map, sub-10 ms end-to-end latency.

<details>
<summary>Signal chain & parameters</summary>

&nbsp;

```
                       ┌──── dry (82-88%) ────┐
  master gain ─────────┤                      ├── lowShelf ── midScoop ── highShelf ── airLPF ── compressor ──▶ out
                       └── 12 ms delay ── deskLPF ── wet (12-18%) ──┘

  bed (brown | pink) ────────────────────────────────────────────────────────────────────▶ out  (bypasses compressor)
```

| Node | Default (Classic) | Mode range |
|------|-------------------|------------|
| Low shelf @ 180 Hz | +2.5 dB | +2.5 to +6 dB |
| Wet mix | 12% | 12–18% |
| Air LPF | 13 kHz, Q 0.5 | 6.5–13 kHz |
| High shelf @ 9 kHz | +0.5 dB | -1 to +0.5 dB |
| Pitch jitter (±) | 2.5% | 0.3–2.5% |
| Bed | — | brown / pink / none, -38 to -40 dB |
| Mid scoop | -3 dB @ 3.8 kHz, Q 1.5 | fixed |
| Compressor | -18 dB, 2.5:1, 35 ms attack | fixed |
| Schedule offset | 2 ms | fixed |

</details>

&nbsp;

---

&nbsp;

## Thirteen switches, six themes

| Type | Switches |
|------|----------|
| **Linear** | Cherry MX Black (HQ) · Red (HQ) · NK Cream (HQ) · Gateron Red Ink · Black Ink |
| **Tactile** | Cherry MX Brown (HQ) · Topre Purple (HQ) · Holy Panda · Topre |
| **Clicky** | Cherry MX Blue (HQ) · Blue · Kailh Box Navy · Buckling Spring |

<sub>*(HQ)* = per-key high-quality recording (sprite or multi-file). Others use 5-variant kbsim packs.</sub>

Catppuccin · Tokyo Night · Rosé Pine · Nord · Dracula · Gruvbox

&nbsp;

---

&nbsp;

## Open it up

**Modes** — Each preset is a `Mode` object: `bed`, `bedGainDb`, and a `ModeStyle` bundle (jitter, EQ shape, wet mix). Add or tweak in [`src/shared/modes.ts`](src/shared/modes.ts).

**Switch recordings** — Drop audio files and a `config.json` into `assets/sounds-hq/<id>/`, register in `profiles/index.json`, run. Supports sprite, multi, and kbsim formats.

**Engine parameters** — EQ points, compression ratio, reflection delay — all in [`AudioEngine.ts`](src/renderer/audio/AudioEngine.ts).

**Visual themes** — CSS variables + `data-theme`. A new colorscheme is one set of values.

[SOUNDS.md](SOUNDS.md) · [DESIGN.md](DESIGN.md)

&nbsp;

---

&nbsp;

<details>
<summary>Architecture</summary>

&nbsp;

```
  Main (Electron)                            Renderer (React)
 ┌────────────────────────┐              ┌───────────────────────────┐
 │  uiohook-napi ──────── MessagePort ──▶  AudioEngine              │
 │  (global key hook)      │              │  (24-voice pool,          │
 │                         │              │   StereoPanner per voice) │
 │  IPC Handlers ◄─────── invoke ───────▶  React UI                 │
 │  Tray · Store (JSON)    │              │  (NES.css + vibrancy)     │
 └────────────────────────┘              └───────────────────────────┘
```

```
src/
├── main/
│   ├── index.ts             # Lifecycle, global shortcuts
│   ├── keyboard.ts          # uiohook → MessagePort
│   ├── ipc-handlers.ts      # Sound pack loading (allowlist + path-safe)
│   ├── preload.ts           # contextBridge (7 methods)
│   ├── store.ts             # JSON persistence
│   └── tray.ts              # Tray menu
├── renderer/
│   ├── audio/AudioEngine.ts # Psychoacoustic engine
│   ├── components/          # UI components
│   └── hooks/               # useAudioEngine, useProfiles
└── shared/
    ├── types.ts
    ├── modes.ts             # 4 Mode presets (bed + StyleLevel bundles)
    └── key-positions.ts     # 104-key stereo pan map
```

</details>

<details>
<summary>Security</summary>

&nbsp;

Fully offline — no `fetch`, `http`, or outbound calls anywhere in the codebase.

`contextIsolation: true` · `nodeIntegration: false` · `contextBridge` exposes 7 read-only methods · Profile IDs validated against allowlist + path-traversal regex.

</details>

<details>
<summary>Development</summary>

&nbsp;

| Command | |
|---------|---|
| `npm run dev` | Vite + Electron dev mode |
| `npm run dev:debug` | + DevTools |
| `npm run build` | Build |
| `npm run package` | .dmg + .zip (arm64 & x64) |

</details>

&nbsp;

---

&nbsp;

[Contributing](CONTRIBUTING.md) · [Mechvibes](https://mechvibes.com) · [uiohook-napi](https://github.com/nickolay/uiohook-napi) · [NES.css](https://nostalgic-css.github.io/NES.css/)

[Apache 2.0](LICENSE) — sound packs carry their own licenses ([NOTICE](NOTICE))
