# Design Decisions

This document explains the key engineering decisions behind Pekko.

## Audio Engine

### Psychoacoustic EQ Chain

Raw keyboard samples played back digitally sound thin and harsh. Pekko applies a 5-stage audio processing chain modeled after how a mechanical keyboard sounds in a real room:

```
master gain
  ├─ dry (88%) ──→ lowShelf(180Hz +2.5dB)
  └─ desk delay ─→ deskLPF(3.5kHz) ─→ wet (12%) ↗
                       ↓
                  midScoop(3.8kHz -3dB)
                       ↓
                  highShelf(9kHz +0.5dB)
                       ↓
                  airLPF(13kHz rolloff)
                       ↓
                  compressor(threshold -18dB, ratio 2.5:1, attack 35ms)
                       ↓
                  destination
```

| Stage | Purpose |
|-------|---------|
| **Low shelf** (+2.5dB @ 180Hz) | Adds warm "thock" body without mud |
| **Mid scoop** (-3dB @ 3.8kHz, Q=1.5) | Tames 3.5-5kHz ear canal resonance — reduces harshness on sustained typing |
| **High shelf** (+0.5dB @ 9kHz) | Subtle air/presence |
| **Air LPF** (13kHz, Q=0.5) | Rolls off digital harshness above human sensitivity range |
| **Desk reflection** (12ms delay + 3.5kHz LPF, 12% wet) | Simulates sound bouncing off a desk surface — wood/plastic absorbs highs |
| **Compressor** (35ms attack, 2.5:1) | Preserves transient click, controls dynamic range for headphone use |

### Spatial Panning

Each physical key on a 104-key QWERTY layout is mapped to a stereo pan value from -1.0 (far left) to +1.0 (far right). This creates spatial width — pressing `Q` sounds from the left, `P` from the right. Defined in `src/shared/key-positions.ts`.

### Voice Pool

A pre-allocated pool of 24 voices avoids `AudioBufferSourceNode` creation overhead on every keypress. Each voice has its own `GainNode` + `StereoPannerNode`. When all voices are busy, the oldest is stolen with an 8ms fade-out to prevent clicks.

### Typing Intensity Model

Key velocity is estimated from inter-key intervals:

| Interval | Intensity | Rationale |
|----------|-----------|-----------|
| > 2000ms | 0.80 (warm start) | Fresh keystroke after a pause — not a hammer blow |
| < 80ms | 0.35-0.50 (light) | Very fast typing = light touch |
| 80-150ms | 0.50-0.80 (normal) | Typical typing speed |
| > 150ms | 0.70-1.00 (heavy) | Slow/deliberate = more force |

Keydown intensity is stored per-keycode and correlated to keyup volume (lighter press → quieter release).

### Adaptive Volume

Sustained typing triggers a volume decay curve to prevent listening fatigue:

- **0-5s**: Full volume (novelty phase)
- **5-30s**: Gentle decay to 75%
- **30s+**: Stable at 65% (flow state)
- **3s pause**: Reset to 100%

### Ambient Room Tone

A looping brown noise generator (bandpass-filtered at 800Hz) fades in at -35dB while typing and fades out 2 seconds after the last keypress. This fills the "silence between keys" and adds room character.

## Electron Security Model

Pekko follows Electron security best practices:

1. **Context Isolation** — renderer runs in an isolated JS context, no access to Node.js
2. **Disabled Node Integration** — `nodeIntegration: false`
3. **Minimal preload surface** — `contextBridge` exposes exactly 7 methods, all via `ipcRenderer.invoke` (async, no direct access to main process objects)
4. **No remote module** — not loaded
5. **Profile ID validation** — IPC handlers validate `profileId` against a whitelist from `profiles/index.json` and reject path traversal patterns (`../`, `/`, `\`)

### Why Accessibility Permission?

`uiohook-napi` uses macOS's IOKit HID API to detect global keyboard events. This requires Accessibility permission. Pekko only reads keycodes and key-up/key-down state — it **cannot** and **does not** read typed text, passwords, or clipboard content.

## IPC Communication

Keyboard events use `MessagePort` (not `ipcRenderer.send`) for minimum latency. The main process creates a `MessageChannel`, sends one port to the renderer via `postMessage`, and writes `[keycode, flag]` tuples (2 numbers) on every key event. This avoids Electron IPC serialization overhead.

## Sound Pack Formats

### Sprite (Mechvibes `single`)

One large `.ogg` file containing all key sounds concatenated. `config.json` maps each keycode to `[offset_ms, duration_ms]` within the sprite. Efficient for loading (one decode), and the standard Mechvibes community format.

### Multi (Mechvibes `multi`)

Individual audio files per key (e.g., `q.wav`, `space.wav`). More flexible, larger disk footprint. Used by NK Cream pack.

### Kbsim (Legacy)

`press/` and `release/` subdirectories with per-key MP3s named by key function (`GENERIC_R0.mp3`, `SPACE.mp3`, `ENTER.mp3`). Row-based generic sounds with special-key overrides.

## UI Design

Pekko uses [NES.css](https://nostalgic-css.github.io/NES.css/) for a retro pixel-art aesthetic. The window uses macOS vibrancy (`under-window`) with a hidden title bar for a clean, native feel. The window hides on blur (acts as a popover from the tray icon).

Six color themes are supported via CSS custom properties on `[data-theme]`, switchable with `Q`/`E` keys.
