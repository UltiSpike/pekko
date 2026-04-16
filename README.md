# Pekko

<div align="center">

<img src="assets/icons/pekko.iconset/icon_256x256.png" width="128" />

**Your mechanical keyboard, on any keyboard.**

Turn your MacBook or membrane keyboard into a thocky mechanical experience.

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Apache_2.0-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/UltiSpike/pekko/releases"><img src="https://img.shields.io/badge/Download-Green?style=flat-square" alt="Download" /></a>
  <img src="https://img.shields.io/badge/macOS_11+-000?style=flat-square&logo=apple&logoColor=white" alt="macOS" />
</p>

</div>

---

Your $2000 MacBook has worse typing sound than a $60 mechanical keyboard. That's a problem.

Pekko plays real mechanical key sounds when you type—no matter what keyboard you're using. It listens to your keystrokes and responds with spatial audio, per-switch DSP tuning, and adaptive volume that keeps you in the zone.

```bash
git clone https://github.com/UltiSpike/pekko.git && cd pekko && npm i && npm run dev
```

<sub>macOS 11+ · Node 18+ · Accessibility permission required · <a href="PRIVACY.md">Reads keycodes only, never input content</a></sub>

---

## Why Pekko is different

| | Klack | Klakk | Keeby | **Pekko** |
|---|:---:|:---:|:---:|:---:|
| Per-switch DSP tuning | — | — | — | ✓ |
| Custom mode (full control) | — | — | ✓ | ✓ |
| Noise bed (focus/cozy) | — | — | — | ✓ |
| Arcade combo mode | — | — | — | ✓ |
| Adaptive volume (fatigue prevention) | — | — | — | ✓ |
| WPM tracking + visual | — | — | ✓ | ✓ |
| Open source | — | — | — | ✓ |

Other apps play different samples. Pekko shapes each switch's character through audio processing—body peak, spring notch, transient, decay—so a Cherry MX Black sounds different from a Holy Panda using the same source audio.

---

## Five modes

| Mode | Sound | Best for |
|------|-------|----------|
| **Thock** | Heavy low-end, warm decay | Deep work, flow state |
| **Deep Focus** | Brown noise bed (-38 dB) | Blocking distractions |
| **Cozy Writing** | Pink noise warmth (-40 dB) | Long sessions |
| **Classic Mech** | No processing, full fidelity | Hearing the switch as recorded |
| **Rush** | Arcade combo overlay + HUD | Gamified sprints |

Press `T` to open the tuning drawer. Create your own mode with full control over EQ, bed, jitter, and arcade settings.

---

## Controls

`←` `→` · Switch profile · `[` `]` · Cycle mode · `T` · Tune drawer · `⇧⌘K` · Mute · `/` · Help

---

## Per-switch DSP

Each profile includes curated DSP parameters—not just different samples:

- **Body Peak** (150-800Hz) — low-mid body
- **Spring Notch** (-12 to +3dB @ 2.5kHz) — suppress or emphasize spring resonance
- **Transient** (-6 to +6dB @ 5kHz) — attack sharpness
- **Decay Scale** (0.5-2.0) — sample tail length
- **Top/Down Balance** — release vs press relative gain

Flavors let you shift character: **Stock**, **Deep** (more body), **Bright** (crisper), **Smooth** (polished).

---

## 13 Switch Profiles

| Type | Switches |
|------|----------|
| **Linear** | Cherry MX Black (HQ) · Red (HQ) · NK Cream (HQ) · Gateron Red Ink · Black Ink |
| **Tactile** | Cherry MX Brown (HQ) · Topre Purple (HQ) · Holy Panda · Topre |
| **Clicky** | Cherry MX Blue (HQ) · Blue · Kailh Box Navy · Buckling Spring |

---

## Architecture

```
Main (Electron)                           Renderer (React)
┌─────────────────────────┐             ┌────────────────────────────┐
│ uiohook-napi           │             │ AudioEngine                │
│ (global key hook)      │ ──▶ MessagePort ──▶ 24-voice pool       │
│                         │             │ StereoPanner per key       │
│ IPC Handlers ◄── invoke│ ──▶ invoke ──▶ React UI                  │
│ Tray · Store (JSON)    │             │ NES.css + vibrancy         │
└─────────────────────────┘             └────────────────────────────┘
```

- 24-voice audio pool with sub-10ms latency
- 104-key stereo pan map (A sounds left, Enter sounds right)
- Fully offline — no network calls
- `contextIsolation: true`, `nodeIntegration: false`

---

## Development

| Command | |
|---------|---|
| `npm run dev` | Vite + Electron dev mode |
| `npm run dev:debug` | + DevTools |
| `npm run build` | Build |
| `npm run package` | .dmg + .zip (arm64 & x64) |

---

## FAQ

**Why does it need Accessibility permission?**
macOS requires this for global keyboard monitoring. Pekko only reads keycodes—never keystroke content.

**Does it work with Bluetooth headphones?**
Yes, but latency increases (40-200ms typical). Wired speakers recommended.

**Is it free?**
Yes. Open source under Apache 2.0. Sound packs carry their own licenses.

---

[Contributing](CONTRIBUTING.md) · [Apache 2.0](LICENSE) · [Sound Pack Licenses](NOTICE)