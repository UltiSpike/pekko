<div align="center">

<img src="assets/icons/pekko.iconset/icon_256x256.png" width="128" />

# Pekko

**The texture of typing.**

Keyboard sound engine for macOS · Open source · Fully offline

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

The crisp click of a Cherry Blue. The muted bottom-out of a Topre. The sharp snap of a Holy Panda on the way back up.

Thirteen switch recordings, spatially positioned across a 104-key stereo field by an acoustic engine. Every sound, exactly where it belongs.

&nbsp;

```bash
git clone https://github.com/UltiSpike/pekko.git && cd pekko && npm i && npm run dev
```

`←` `→` switch profiles · `Q` `E` switch themes · `⇧⌘K` global toggle

<sub>macOS 11+ / Node 18+ / Accessibility permission required on first launch — reads keycodes only, never input content (<a href="PRIVACY.md">privacy statement</a>)</sub>

&nbsp;

---

&nbsp;

## Acoustic engine

Every keypress passes through a room-acoustic processing chain. Low-shelf EQ restores the physical weight of each switch's thock. Mid-frequency correction removes the harshness that recordings pick up. A 12-millisecond delay layer models sound reflecting off the desk surface. All 104 keys are mapped to their physical position in the stereo field — A sits left, L sits right, spacebar dead center.

During sustained typing, volume decays gently to a steady state and resets after a pause. Inter-key timing drives velocity — fast bursts register as light taps, slow deliberate strokes as heavier strikes. An ambient layer of brown noise at barely perceptible levels fills in the room. Twenty-four voices pre-allocated, zero GC on keypress. End-to-end latency under 10 milliseconds.

<details>
<summary>Signal chain & parameters</summary>

&nbsp;

```
                       ┌──── dry (88%) ────┐
  master gain ─────────┤                   ├── lowShelf ── midScoop ── highShelf ── airLPF ── compressor ──▶ out
                       └── 12ms delay ── deskLPF ── wet (12%) ──┘
```

| Node | Parameters |
|------|------------|
| Low shelf | +2.5 dB @ 180 Hz |
| Mid scoop | -3 dB @ 3.8 kHz, Q 1.5 |
| High shelf | +0.5 dB @ 9 kHz |
| Air LPF | 13 kHz, Q 0.5 |
| Desk reflection | 12ms delay → 3.5 kHz LPF, 12% wet |
| Compressor | -18 dB threshold, 2.5:1, 35ms attack |
| Ambient layer | Brown noise, 800 Hz bandpass, -35 dB |

</details>

&nbsp;

---

&nbsp;

## Thirteen switches, six themes

Cherry MX Black · Blue · Brown · Red · NK Cream · Topre Purple · Holy Panda · Buckling Spring · Box Navy · Gateron Red Ink · Blue Alps · Turquoise · Alpaca

Catppuccin · Tokyo Night · Rosé Pine · Nord · Dracula · Gruvbox

The tonal character of each switch comes from the recording itself. Spatial depth, body, and dynamic response — from the engine.

&nbsp;

---

&nbsp;

## Open it up

Every layer of Pekko is accessible.

**Switch recordings** — Drop audio files and a `config.json` into `assets/sounds-hq/<id>/`, register in `profiles/index.json`, run. Supports sprite, multi, and kbsim formats.

**Engine parameters** — EQ points, compression ratio, reflection delay, ambient level — all in [`AudioEngine.ts`](src/renderer/audio/AudioEngine.ts).

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
