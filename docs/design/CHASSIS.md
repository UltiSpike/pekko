# Pekko UI · CHASSIS

## Design Statement

The window is **one precision instrument panel**. No cards, no nested surfaces, no glass stacks. Every element is silkscreened onto the same matte chassis. Visual language follows the audio engine's ethos: restrained, obsessive, engineer's romance.

References: Bricasti M7 · Nagra IV-S · Teenage Engineering OP-1 · Dieter Rams T1000.

## Window

| State | Size | Notes |
|---|---|---|
| Closed | 360 × 480 | Default; popover from tray icon |
| Drawer open | 360 × 720 | Grows downward when TUNE is active |

- `titleBarStyle: 'hiddenInset'`, `vibrancy: 'under-window'`, `roundedCorners: true`
- Dock icon hidden (menu bar companion)
- `blur → hide` is **suspended** while the drawer is open

## Finishes

Six committed chassis/LED/accent pairings. Each is an identity, not a color swatch. User picks one (tray menu → Finish), or leaves on **Auto** to follow system light/dark.

| Finish | Mood | Chassis | LED / Accent | Reference |
|---|---|---|---|---|
| **Graphite** | Studio console · default dark | warm black | amber `#FFB347` | Nagra · Bricasti |
| **Ivory** | Paper notebook · default light | cream | oxblood `#A82E21` | Muji · Midori |
| **Phosphor** | CRT night vision | deep carbon | phosphor green `#4EBE6B` | Tektronix scope |
| **Cyan** | Tape chrome · pro audio | cool near-black | teal `#5FB8A8` | OP-1 · Walkman Pro |
| **Ember** | Tube amp · warm night | deep brown-black | orange-red `#E04B2C` | McIntosh · vintage radio |
| **Slate** | Blueprint · cool light | indigo paper | deep blue `#3B4A6B` | Engineering drafts |

**Auto** follows `prefers-color-scheme`: dark → Graphite, light → Ivory. Pinning any finish overrides system.

Two entry points:
- Tray menu → `Finish` submenu
- Main window → `?` button (top-right) → help panel shows keyboard shortcuts and finish picker

The current finish also appears in the Status LED tooltip on hover.

### Token example · Graphite (default dark)
```
--chassis       rgba(20, 19, 15, 0.80)
--ink-1         #EAE3D2   --ink-2   #9A9187   --ink-3  #5E584F
--hairline      rgba(255, 255, 255, 0.10)
--led-on        #FFB347
--led-dim       rgba(255, 179, 71, 0.14)
--led-mute      #7A3529
--led-peak      #FF8547
--accent        #FFB347
```

See `src/renderer/App.css` `[data-finish='*']` blocks for full token tables.

## Typography

Family: `JetBrains Mono` → fallback `SF Mono, Menlo, monospace`. One family, no display fonts.

| Use | Size | Weight | Tracking | Case |
|---|---|---|---|---|
| switch hero | 28 | 500 | +60 | UPPER |
| mode chip | 11 | 700 | +200 | UPPER |
| DSP param name | 11 | 600 | +120 | UPPER |
| DSP value readout | 13 | 500 tabular | 0 | — |
| meta line | 11 | 400 | +80 | UPPER |
| desc | 12 | 400 | 0 | sentence |
| button | 12 | 600 | +180 | UPPER |
| volume label | 11 | 600 | +180 | UPPER |

All numbers: `font-variant-numeric: tabular-nums`.

## Spacing · Radius · Depth

- Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48`
- Window padding: `24 vertical / 32 horizontal`
- Radius: **one token — 6px**
- Depth: **one hairline divider, zero shadows, zero gradients.** Drawer header uses a double hairline (tape seam).

## Layout · Closed State

```
┌────────────────────────────────────────────┐
│ ●●●                                   ·    │  top plate · status LED
├────────────────────────────────────────────┤
│             ┌─ SOFT · LOFI ─┐               │  mode chip
│         CHERRY  MX  BLACK                    │  switch hero
│         ‹                           ›        │
│         ABS   HQ   ·   3 / 13                │  meta (idle-dimmed)
│         mellow tactile · low-end body        │  desc
│  ───────────────────────────────────────     │
│  ▁▂▃▄▅▆▇▇▆▅▄▃▂▁▁▁▁▁▁▁▁▁▁                   │  LED intensity ladder
│  VOLUME  ├───────●─────────────┤    62       │
│  ───────────────────────────────────────     │
│              [  TUNE  ·  T  ]                │
└────────────────────────────────────────────┘
```

## Layout · Drawer Open (360 × 720)

```
┌────────────────────────────────────────────┐
│ ●●●                                   ·    │
├────────────────────────────────────────────┤
│         CHERRY  MX  BLACK                    │  ← anchor preserved
│         ABS   HQ   ·   3 / 13                │
│  ▁▂▃▄▅▆▇  VOLUME ──●─────── 62              │  compacted row
├═══ TUNE ═══════════════ SWITCH │ MODE ═════┤  drawer header (double rule)
│                                              │
│  [ ORIGINAL ] [ WARM ] [ CRISP ] [ DEEP ]   │  preset chips (SWITCH)
│                                              │
│  BODY          ●────────    + 2.5  dB        │
│  SPRING        ────●───    − 3.0  dB        │
│  TRANSIENT     ─●──────    + 0.5  dB        │
│  TOP / DOWN    ────────●    + 0.0  dB        │
│  DECAY         ──●─────      1.0  ×          │
│                                              │
│  [ RESET ]                       [ DONE ]    │
└────────────────────────────────────────────┘
```

## Components

### 1 · Status LED
Replaces `MUTE` badge, `⇧⌘K` hint, permission banner, and bluetooth warning.

| Condition | Color | Motion |
|---|---|---|
| Typing active | `--led-on` | 200ms pulse on keypress |
| Idle | `--led-dim` | steady |
| Muted (`⇧⌘K`) | `--led-mute` | slow 3s breathing |
| Permission / BT warning | `--led-mute` | 1Hz blink, hover shows tooltip |

6px dot, top-right of top-plate. Click expands tooltip with detail / action.

### 2 · Mode Chip
11px caps, 8px padding, 1px hairline, 6px radius, centered top. Flanked by `‹ ›` (10px, `--ink-3`). No description, no subtitle. **Mode is a label, not a card.**

### 3 · Switch Hero
28px caps + tracking +60, `--ink-1`. Navigation `‹ ›` on a separate row (18px). Meta line (`ABS  HQ  ·  3/13`) is **dimmed to 0.5 opacity** by default — fades to full on `← →` keyboard nav (1.5s) or hover.

### 4 · LED Intensity Ladder
- 24 segments, `12px × 12px`, 2px gap
- Drive: `level = min(24, round(wpm / 5))`
- On: `--led-on` · Off: `--led-dim`
- Tail: segments fade off right-to-left 200ms after last keypress
- **Muted**: entire ladder to `--led-mute` (panel power-off)
- **Peak (WPM > 90)**: rightmost 3 segments shift to `#FF8547` (warm amber = VU peak)

### 5 · Volume Fader
- 2px track, 10px round handle, accent fill
- 7 tick marks (25/50/75 longer)
- Label `VOLUME` left · value right (tabular, no `%`)

### 6 · TUNE Action Button
Not an icon button. A named function key: `[ TUNE · T ]` (brackets are silkscreen decoration). 36px tall, 60% width, centered. Hover: border → `--accent`. Active (drawer open): label becomes `[ DONE ]`, border fill `--accent @ 20%`.

### 7 · Tune Drawer
- Grows window height from 480 → 720 (smooth 220ms cubic-bezier 0.32, 0.72, 0.24, 1)
- Header: `─── TUNE ─── SWITCH │ MODE ───` (double hairline)
- Tabs: **SWITCH** (per-switch DSP) | **MODE** (soundscape style, custom mode only)
- Top of SWITCH body: preset chips (was outer-layer Flavor cards — now inlined here)
- Footer: `[ RESET ]` · `[ DONE ]`

## Interaction Contract

| Event | Behavior |
|---|---|
| `←` / `→` | Cycle switch — **active in both closed and drawer states** |
| `[` / `]` | Cycle mode |
| `‹` / `›` (on-screen) | Cycle mode (same as `[` `]`) / switch tab (drawer) |
| `T` | Toggle drawer |
| `/` | Toggle help panel (keyboard cheatsheet + finish picker) |
| `Esc` | Close help panel → close drawer → close window (in that order) |
| `⇧⌘K` | Mute toggle — reflected in Status LED |
| `⌥⌘K` | Toggle window visibility |
| `Q` / `E` | **Removed** (finish is picked from tray menu) |
| `blur` | Hide window, **unless drawer is open** |
| meta line | Fades in on nav / hover, back to 0.5 opacity after 1.5s |
| permission / BT warnings | Surface through Status LED only — no banners |

Drawer state (`isTuning`) persists to `settings.json`. Reopen restores drawer if it was open.

## Signature Details (optional, high taste payoff)

1. **Switch-name micro-pulse** — on each keydown, switch hero does `scale(1.008)` for 40ms. Visualizes the tactile moment.
2. **Drawer open sound** — 30ms shutter click sampled from an existing keyup in the current sound pack. The drawer is a physical cover being slid open.
3. **Mute breathing** — Status LED slow-breathes when muted (server-rack standby vibe).
4. **VU peak** — WPM > 90 warms the rightmost 3 ladder segments.

## Out of Scope (next passes)

- Drawer animation easing refinement
- MODE tab custom-mode parameter layout
- Preset save / share
- First-launch permission onboarding
- Tray menu rework to match (drop theme submenu, update labels)
