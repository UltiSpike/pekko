# Pekko

<div align="center">

<img src="assets/icons/pekko.iconset/icon_256x256.png" width="128" />

**Keyboard sounds for the keyboard you already have.**

A macOS menu-bar app. Type anywhere, and Pekko plays the switch you picked.

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Apache_2.0-blue?style=flat-square" alt="License" /></a>
  <a href="https://github.com/UltiSpike/pekko/releases"><img src="https://img.shields.io/badge/Download-Green?style=flat-square" alt="Download" /></a>
  <img src="https://img.shields.io/badge/macOS_11+-000?style=flat-square&logo=apple&logoColor=white" alt="macOS" />
</p>

</div>

---

Pekko lives in the menu bar. Each keypress plays a real switch recording, placed left-to-right across the row, then voiced so a Cherry MX Black and a Holy Panda are not the same sample with a different name. Long sessions ease the volume down on their own. Five modes cover a heavy thock, a noise bed for focus or writing, the recording left alone, and an arcade sprint.

**[Download for macOS](https://github.com/UltiSpike/pekko/releases)** · macOS 11 or later

It needs Accessibility permission so it can hear keys while another app is in front. Pekko reads keycodes only — which key went down or up — never the characters you type, and it makes no network requests. [Privacy](PRIVACY.md)

To run it from source (Node 18+):

```bash
git clone https://github.com/UltiSpike/pekko.git && cd pekko && npm i && npm run dev
```

---

## What you hear

Each of the 13 profiles is a recording plus its own voicing: body, spring, attack, decay, and how loud the key-up is next to the key-down. Stock, Deep, Bright, and Smooth shift that voicing without swapping the sample. A custom mode exposes the same controls.

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