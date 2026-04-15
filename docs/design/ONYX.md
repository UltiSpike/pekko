# Pekko UI · ONYX (v2)

> Supersedes [CHASSIS.md](CHASSIS.md) (v1). v1 stays in the archive on branch `design/chassis-v1` for A/B reference.

---

## Manifesto

v1's chassis was *drawn* — flat plane, hairlines, labels painted on top. v2's chassis is **carved**. One slab of material; every control, every label, every divider is *subtracted from* it. No cards. No popovers stacked on surfaces. No nested containers. If you can't engrave it, it doesn't belong on the panel.

Reference: a single piece of bakelite, basalt, bone, or weaving — milled, debossed, oxidized. Not an app with dark mode.

---

## What changed from v1

| Axis | CHASSIS v1 | ONYX v2 |
|---|---|---|
| Surface model | Flat plane + hairline | **Engraved** (1px inner shadow + 1px outer highlight) |
| Typography | Painted labels | **Debossed** — letter interior = chassis color, edges lit |
| Finishes | 6 color palettes | **6 materials** + 4% material noise texture |
| Popovers (help / tooltip) | Glass blur + box-shadow | **Replace chassis content**, same bg, same hairlines |
| Idle state | Everything dims together → "off" | **Filament Breath** + **DSP Warmth Arc** → "alive but at rest" |
| Second data layer | LED ladder only | LED ladder **+** DSP Warmth Arc (adaptive-volume state) |
| Window open | Direct full-lit | **Warmup** (920ms ink fade → hairlines draw → LED inhale) |
| UI self-sound | Silent | 2 cues (drawer / mute), opt-in, sourced from active pack |
| Accessibility | Absent | AA baseline + `:focus-visible` + shape-encoded states + reduced-motion |

---

## Window

| State | Size | Notes |
|---|---|---|
| Closed | 360 × 480 | Popover from tray icon |
| Drawer open | 360 × 720 | Grows downward, 220ms |

`titleBarStyle: 'hiddenInset'` · `vibrancy: 'under-window'` · `roundedCorners: true` · `resizable: false`.
`blur → hide` suspended while drawer is open. `isTuning` persisted.

---

## Materials (v1 Finishes renamed & reskinned)

Each material has **chassis / ink / accent** tokens plus an **engraving recipe** (shadow + highlight pair) and a **noise texture**.

| v1 → v2 | Material | Mood | Noise grain | Reference |
|---|---|---|---|---|
| Graphite → **Basalt** | Black matte stone | fine stone | 4% stone grain | Bricasti M7, Nagra IV-S |
| Ivory → **Bone** | Warm paper / bone-white card | paper fiber | 4% paper tooth | Muji notebook, Crane stationery |
| Phosphor → **Verdigris** | Oxidized copper-green | copper pitting | 5% micro-specks | Antique brass instruments |
| Cyan → **Patina** | Weathered teal metal | metal micro-rust | 4% fine noise | OP-1, Walkman Pro |
| Ember → **Shellac** | Deep red-brown lacquer | wood grain | 5% horizontal grain | McIntosh amps, vintage radio |
| Slate → **Indigo Linen** | Indigo-dyed linen paper | cloth weave | 5% weave texture | Engineering blueprints |

**Auto** still follows system light/dark → Basalt (dark) / Bone (light).

### Token contract

Decoupled into three groups — **LED ≠ interactive ≠ text**. v2.0 collapsed all three onto `--accent` and `--ink-3`; v2.1 splits them so "how bright the LED glows" and "how loud a focus ring shouts" tune independently.

```
BASE
--chassis            background (vibrancy underlay carries through)
--chassis-tint       engraved text interior — chassis color shifted ≤5% luminance
--ink-1              primary label (solid fill OR engraved via shadow/highlight)
--ink-2              secondary label + default color for engine data viz at rest (ladder/arc)
--hairline           1px divider rgba
--noise-url          data: URI for material texture (4–5% opacity, SVG feTurbulence)

ENGRAVING  (committed per material — see §Engraving Recipe)
--engrave-shadow     shadow edge; always defined
--engrave-highlight  highlight edge; NULL on light materials (Bone, Indigo Linen)

LED / engine-driven indicators (brightest; engine data only)
--led-on             LED active color · arc leading edge · ladder live segment · peak zone
--led-dim            --led-on at 35% — idle pilot (always lit, never "off")
--led-mute           desaturated --led-on — mute state (meets AA on chassis per material)
--led-peak           warmer shift — sustained WPM > 90

INTERACTIVE  (buttons / focus / tabs — decoupled from LED)
--interactive        --led-on desaturated -10% / −5% lightness
--interactive-soft   --interactive at 12% α — active chip fill only
--focus-ring         alias = --interactive
```

**Removed from v2.0**: `--accent` (aliased `--led-on`), `--accent-soft` (aliased `--interactive-soft`), `--ink-3` (merged into `--ink-2`; arc gradient tail uses `rgba(--ink-2, 0.4)` instead), `--overlay` (redundant; popovers reference `--chassis` directly).

Net: **13 tokens × 6 materials = 78 values** (down from 96 in v2.0). Full per-material tables in the implementation (`App.css [data-finish='<material>']`).

---

## The Engraving Recipe

### Floor: 12 px minimum

Engraving reads via 1 px edge shifts. Below 12 px a 1 px edge ≈ 10% of glyph height and dissolves into noise. **Any text below 12 px is solid `--ink-1` or `--ink-2`, never engraved.** Promotes legibility, saves processing, and reserves the engraving gesture for elements that can carry it (hero, chip labels, button labels, drawer section titles).

### Per-material committed values

Light materials get **shadow-only** engraving (light hitting deboss on paper doesn't produce a highlight — it produces deeper shadow). Dark materials get the shadow + highlight pair.

| Material | `--engrave-shadow` | `--engrave-highlight` |
|---|---|---|
| **Basalt** (dark, stone) | `rgba(0, 0, 0, 0.45)` | `rgba(255, 240, 220, 0.06)` |
| **Bone** (light, paper) | `rgba(50, 40, 30, 0.28)` | `null` (shadow-only) |
| **Verdigris** (dark, copper-green) | `rgba(0, 10, 8, 0.42)` | `rgba(180, 230, 190, 0.08)` |
| **Patina** (dark, cool metal) | `rgba(0, 10, 15, 0.45)` | `rgba(200, 230, 230, 0.07)` |
| **Shellac** (dark, wood lacquer) | `rgba(15, 5, 0, 0.45)` | `rgba(255, 220, 180, 0.08)` |
| **Indigo Linen** (light, cloth) | `rgba(30, 50, 80, 0.25)` | `null` (shadow-only) |

Tune during implementation — these are commits, not final.

### Noise masking

Textured materials (Verdigris, Shellac, Indigo Linen, any material with >4% noise) **mask noise out of engraved text zones**:

```css
.engraved-label,
.engraved-hero,
.engraved-chip { position: relative; z-index: 1; }
.engraved-label::after,
.engraved-hero::after,
.engraved-chip::after {
  content: '';
  position: absolute;
  inset: -2px;
  background: var(--chassis);
  z-index: -1;
}
```

Without masking, 5 % noise competes with 1 px engraving at the same luminance delta → engraving collapses into dirt.

### Label engraving (12–13 px)

Vertical lighting — light from above:
```css
.engraved-label {
  color: var(--chassis-tint);
  text-shadow:
    0 1px 0 var(--engrave-highlight),
    0 -1px 0 var(--engrave-shadow);
}
/* Light materials where --engrave-highlight is null collapse to shadow-only */
```

### Hero engraving (28 px `SWITCH NAME`)

Diagonal lighting for dimensional feel:
```css
.engraved-hero {
  color: var(--chassis-tint);
  text-shadow:
    -1px -1px 0 var(--engrave-shadow),
     1px  1px 0 var(--engrave-highlight);
}
```

### Action vs state — two different pocket treatments

v2.0 used the same engraved-pocket treatment for `TUNE` (primary action) and preset chips (state toggle). Similarity violation — same look, different function. v2.1 **inverts the engraving on primary action**:

```css
/* State chips — pressed INTO the material (default engraved pocket) */
.engraved-chip {
  border: 1px solid var(--hairline);
  box-shadow:
    inset 0  1px 0 var(--engrave-shadow),
    inset 0 -1px 0 var(--engrave-highlight);
}

/* Primary action — raised BOSS (inverted engraving; proud of surface) */
.action-boss {
  border: 1px solid var(--hairline);
  box-shadow:
    inset 0 -1px 0 var(--engrave-shadow),    /* shadow on bottom edge */
    inset 0  1px 0 var(--engrave-highlight); /* highlight on top edge */
}
```

Applied to `.tune-button` and `.drawer-btn.primary` (Done). Every other chip stays pressed-in. The eye distinguishes "press to do" from "press to select" by which way the light falls.

### Global noise overlay

One pseudo-element on `.app::before`:
```css
.app::before {
  content: '';
  position: absolute; inset: 0;
  background-image: var(--noise-url);
  mix-blend-mode: overlay;
  opacity: 1;
  pointer-events: none;
}
```

---

## Signature layers

### ① Engraved Switch Hero
28 px / JetBrains Mono 500 / `letter-spacing: 0.05em` / UPPER / engraved recipe above.
Letter interior = chassis material showing through. Edges catch light. The hero text *is* the material.

### ② DSP Warmth Arc (new) — *demoted in v2.1*
A 120 px × 60 px SVG, 2 px stroke, semicircle (`180° → 360°`), tucked below the switch hero.
- **Primary drive (fill)**: adaptive volume decay state — fills the arc.
  - 0–5 s of typing → 0–25 % fill
  - 5 s–30 s → 25–100 % fill
  - 3 s idle → drains to 0 over 900 ms
- **Secondary drive (stroke width, v2.2)**: instantaneous WPM modulates stroke thickness 1.5 → 3 px on a 1 s smoothing window. **Prevents the "100% locked" dead state** during sustained typing — even after the arc fills, breath remains in the line weight. Slow typing = thin stroke; bursts = thicker.
- **Fill**: `stroke-dasharray` technique. Total semicircle circumference ≈ 188 px — drive via `stroke-dashoffset`.
- **Color (v2.1)**: default stroke = `--ink-2`. Leading edge transitions to `--led-on` ONLY while typing is active; drains back to `--ink-2` on idle.
- **Gradient**: `rgba(--ink-2, 0.4)` at tail → `--ink-2` at current position → `--led-on` at leading edge (only during active).
- **Peak**: if sustained WPM > 90, leading tip gets a 1 px `--led-peak` 4 px-radius glow (the *only* sanctioned glow in the app; real peak-meter behavior, not decoration).

**Why demoted**: in v2.0 the arc was stroked in `--accent` always, making it the brightest permanent element on the panel — louder than the engraved switch hero. Hierarchy inverted (data viz dominating identity). v2.1 defaults the arc to `--ink-2` (same weight as switch meta) and brightens only when it *means* something (active typing → accent). At rest, the arc is present but quiet. The switch hero reclaims dominance.

### ③ Filament Breath on Mode Chip
The mode chip's hairline border breathes in opacity: `0.22 ↔ 0.30`, 6 s cycle, `cubic-bezier(0.45, 0, 0.55, 1)`.
One pixel, one axis, one rhythm slower than conscious notice — but fast enough that the eye registers "powered." The tube-amp thermal drift.

Implemented as `::before` pseudo-element (can't animate rgba components cleanly across materials; opacity is clean).

**v2.2 paired drift on Status LED**: the idle pilot's opacity also oscillates `0.32 ↔ 0.38` on a **47 s** cycle (deliberately co-prime with 6 s so the two motions never resync). Two overlapping rhythms make long-idle states feel in-flux instead of frozen — at 60 s of inactivity the user can't predict the next visible change, panel reads "alive at rest" indefinitely.

### ④ Left Top-Plate = intentionally blank
No silkscreen serial, no model ID. Polished onyx has natural un-inked area; the **Filament Breath** + **DSP Warmth Arc** + **pilot-lit Status LED** carry the "alive" burden together. Leaving the top-left bare is a design commitment, not an oversight.

### ⑤ LED Ladder (v1-carry-over, v2.1 recolored)
24 discrete 12×12 px segments (2 px gap) — instantaneous typing intensity.
- **Default (idle / at rest)**: all segments `--ink-2` at 40% opacity. Low-contrast row of ticks, reads as "meter not firing."
- **Active**: currently-filling segments `--led-on`; trailing (previously-lit) segments `--led-dim`; unfired segments remain `--ink-2` ghosted.
- **Peak (WPM > 90)**: rightmost 3 segments shift to `--led-peak`.
- **Muted**: whole ladder `--led-mute`, 40% opacity.

**Why recolored in v2.1**: v2.0 had the ladder permanently in accent — a second always-bright horizontal bar fighting the DSP Arc for dominance. v2.1 aligns the ladder with the arc's discipline: **brightness encodes engine activity, not decoration**.

---

## Motion Choreography

All easings derive from physical systems — attack → settle, never bounce.

| Event | Duration | Curve | What moves |
|---|---|---|---|
| **Warmup** (window open from tray) | 920ms | ink `(0.22, 0.61, 0.36, 1)` · LED inhale `(0.33, 0, 0.67, 0)` up + `(0.33, 1, 0.67, 1)` down | 0–180 ms: chassis opacity 0→1 (drawer body if `isTuning=true` follows the same opacity ramp — no pop). 180–220: hairlines self-draw left-to-right. 220–920: Status LED from `--led-dim` up to `--led-on` and back. **First-launch deferral**: if Accessibility permission is missing, Warmup is suppressed until permission resolves; on first successful unlock Warmup plays exactly once. Prevents the macOS settings dialog from stealing the signature first impression. |
| **Switch change** (`←`/`→`) | 220ms | `(0.22, 1, 0.36, 1)` | old name: `blur(2px)` + opacity→0 (90 ms); new name: `y+2px` → 0 with opacity 0→1 (130 ms). Label-wheel index feel. |
| **Finish (material) swap** | 320ms | `(0.4, 0, 0.2, 1)` | chassis + LED tokens cross-dissolve. LED ladder segments update **80 ms late** (incandescent lag). **Switch hero exception**: text-shadow does NOT cross-fade smoothly across material engraving values — instead, hero opacity dips 1→0 in 100ms, finish tokens swap, opacity 0→1 in 100ms (200ms total black-out). Avoids ghost-strobe through illegible mid-states. **Clicked-chip exception**: the finish chip the user clicked snaps to its new finish state immediately (no 320ms morph) so the choice feels confirmed; surrounding chips animate. |
| **Drawer open** | 460ms | compound (see below) | See swim lane. |
| **Drawer close** | 220ms | inverse | Contents fade → window shrinks. Retraction faster than extension. |
| **Mute** (`⇧⌘K`) | 240ms | `(0.7, 0, 0.84, 0)` | ladder color ramps `--led-on → --led-mute`; fader handle dims to `--ink-3`. Tape-droop curve. |
| **Unmute** | 140ms | `(0.16, 1, 0.3, 1)` | Reverse; snappier. Power coming back is faster than going away. |
| **Shutdown** (window blur, drawer closed) | 400ms | mirror of Warmup — LED exhale `(0.33, 0, 0.67, 0)` + ink `(0.22, 0.61, 0.36, 1)` | 0–250: Status LED `--led-on → --led-dim` (exhale). 250–320: hairlines fade. 320–400: chassis opacity → 0, then hide. Pairs open/close into one felt rhythm (Peak-End). |
| **DSP Arc update** | continuous | — | stroke-dashoffset lerps toward target 400 ms per cycle; never jumps. Color also lerps (`--ink-2 ↔ --led-on` on active/idle transition). |
| **Filament Breath** | 6 s loop | `(0.45, 0, 0.55, 1)` | `.mode-chip::before` border opacity 0.22 ↔ 0.30 forever. |

### Drawer-open swim lane
```
t=0    ┌─ seam hairline brightens at y=360 to --led-on @ 40% ──┐
t=40   │  tune button fades + slides down 4px                   │
t=120  │  window.setSize(360,720) animated (220ms)              │
       │  compact row (ladder+fader) translates up (40ms lag)   │
       │  drawer body: pointer-events: none until t=460         │
       │  (slider rails render visually but click targets       │
       │   are inert so a fast user can't miss-click in flight) │
t=340  │  drawer header double-hairline draws L→R (120ms)       │
t=460  │  preset chips + sliders fade in, opacity only, 60ms stagger
       │  pointer-events restored                                │
       │  initial focus:                                         │
       │    if T was pressed (keyboard) → first preset chip      │
       │    if mouse-clicked TUNE → focus stays on TUNE button   │
       │    until user tabs (no surprise focus shift)            │
       └──────────────────────────────────────────────────────┘
```

### Reduced motion — `prefers-reduced-motion: reduce`
- Warmup → single 160 ms cross-fade.
- All transforms → none. Opacity only. ≤80 ms.
- Finish swap → instant.
- Drawer → 160 ms height change, contents pop in at end.
- Filament Breath → static at `opacity: 0.26`.
- DSP Arc → 4-step pixel readout (0 / 25 / 60 / 100 %); snaps, no lerp.
- **Blink animations removed** (`.status-led.warn` flashing is replaced with static ring; blink is seizure-adjacent).

---

## UI Sound (new, opt-in)

**Default: OFF.** A menu-bar tool shouldn't make sound of its own. Enable via tray menu `UI Sounds · On / Off`.

When enabled:

| Event | Source | Processing | Justification |
|---|---|---|---|
| Drawer **open** | random `keyup` from active sound pack | `playbackRate = 2^(-3/12)` (down 3 semitones), gain -12 dB, tail 30 ms | A physical cover sliding back. Pitched down so it sits below the typing sounds in frequency. |
| Drawer **close** | same sample, reversed via buffer trick | same | Inverse event. |
| Mute **toggle** | random `keydown` from active sound pack | 2 kHz low-pass, gain -18 dB, window 80 ms | Relay click. Low-pass removes clickiness, leaves the thud. |

**Not making sound for**: profile change, mode change, help panel open, finish swap, volume change, window open/close. Those are navigational — noise floor if given cues.

Because each material's active sound pack differs, the drawer sound is different on Cherry Black vs Topre vs Box Navy. The UI inherits the identity of the hardware currently loaded.

---

## Accessibility Baseline

### Contrast (WCAG AA = 4.5:1 for <18 px body)

Per-material token fixes landing in v2:
- **Slate → Indigo Linen `--led-mute`** `#7B8698` (2.9:1) → **`#5A6478`** (4.6:1). Warn state must be visible.
- **Phosphor → Verdigris `--ink-2`** `#6B8872` (4.5:1 borderline) → **`#7C9A84`** (5.3:1).
- **Ember → Shellac `--ink-2`** `#A08274` (5.3:1) → stays; but **`--ink-3` raised to `--ink-2` wherever used in type ≤11 px** (previously fell below AA at small sizes).
- `.help-section-title`, `.drawer-title`, `.mode-hint` → uniformly use `--ink-2`, not `--ink-3`.

### Focus behavior

```css
:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r);
}
/* On bordered chips — flip the border instead of adding outline */
.finish-btn:focus-visible,
.preset-chip:focus-visible,
.tune-button:focus-visible,
.drawer-btn:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
/* Slider thumb ring uses chassis as a moat to separate ring from track */
input[type='range']:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 2px var(--chassis), 0 0 0 3px var(--accent);
}
/* Windows high-contrast mode */
@media (forced-colors: active) {
  :focus-visible { outline: 2px solid CanvasText; }
}
```

### Status LED — shape + color (color-blind safe)

| State | Color | Shape | Animation |
|---|---|---|---|
| Idle (pilot) | `--led-dim` (led-on @ 35 %) | Solid 6 px disc | None — always lit |
| Active (typing) | `--led-on` | Solid disc | 200 ms single-shot scale pulse 1 → 1.2 (no shadow) |
| Muted | `--led-mute` | **Hollow ring** (2 px border, transparent center) | 3 s slow opacity breathe |
| Warn (perm / BT) | `--led-mute` | **`!` glyph** replaces disc | Static — no blink |

No `box-shadow: 0 0 6px` bloom. LEDs on real panels don't bloom through the chassis.

### Warn state — inline error (v2.1)

v2.0 hid the *nature* of warnings behind a hover-only tooltip (the LED just said "something's wrong"). Violates Nielsen #9 (help recognize/recover). v2.1: **the switch-desc area is replaced with an inline error panel when a warning is active**:

```
┌──────────────────────────────────────────────┐
│        CHERRY  MX  BLACK                       │  ← hero unchanged
│         ‹                           ›          │
│                                                │
│   ╭─ Accessibility permission required ─╮     │  ← inline, ink-1
│   │                                       │     │     hairline border
│   │   Pekko needs Accessibility access    │     │     11px ink-2 body
│   │   to detect keystrokes.               │     │
│   │                                       │     │
│   │              [ Grant access ]          │     │     action button
│   ╰───────────────────────────────────────╯     │
│                                                │
│   (DSP arc / ladder / fader hidden while        │
│   permission warning is up)                     │
└──────────────────────────────────────────────┘
```

Status LED still shows `!` glyph (redundant channel for color-blind / quick-glance), but the problem and its recovery action live at the centroid of the UI, not behind a 6 px dot. Bluetooth warning uses the same pattern with a "Dismiss" button instead of a recovery action.

### ARIA / keyboard parity

- HelpPanel: `role="dialog"` + `aria-modal="true"` + initial focus on first interactive + focus trap + Esc returns focus to `.help-button` + `aria-labelledby` to the `Keyboard` heading.
- Drawer tabs: `role="tablist"` on the container, `role="tab"` + `aria-controls` + `aria-selected` on each tab, `role="tabpanel"` wrapper on the body. Arrow-key nav between tabs (App's `←`/`→` listener **yields when the active element is a tab**).
- VolumeSlider: `aria-valuetext` reads "62 percent".
- LedLadder: `aria-hidden` (decorative); exposes a `role="status"` live region for peak moments.
- StatusLed: `role="button" aria-describedby` pointing at the tooltip; tooltip itself is `role="tooltip"`. "Grant access" is a real `<button>`, keyboard reachable.

### Microcopy

| v1 | v2 |
|---|---|
| `[ Tune · T ]` | `Tune` (shortcut lives in the help panel, not in the label) |
| `[ Done ]` / `[ Reset ]` inside drawer | `Done` / `Reset` (brackets removed — not CLI) |
| `Mute · ⇧⌘K` | `Muted — press ⇧⌘K to unmute` (or `Sound on — ⇧⌘K to mute`) — full human sentence |
| Tab labels `Switch` / `Mode` | **Keep `Switch` / `Mode`** (v2.0 proposed `Hardware / Style` — rejected: "Hardware" is ambiguous, could mean the user's keyboard). Disambiguate via one-line subtitle under active tab: `Switch` → `Sample + DSP`, `Mode` → `Soundscape`. |
| Slider labels `Body` / `Spring` / `Transient` / `Release` / `Decay` | same labels, but each gets `title="..."` with a one-sentence explanation for non-audio-engineer users |
| `HQ` badge | `title="High-quality sample — per-key recording"` |
| `Auto · Follow system` | `Auto` (label) + `Follows macOS appearance` (subtitle, smaller, `--ink-3`) |

---

## Wireframes

### Closed state (360 × 480)
```
┌────────────────────────────────────────────┐
│ ●●●                        HELP      ●     │  top-plate · pilot-lit LED
├────────────────────────────────────────────┤
│           ‹[   SOFT · LOFI   ]›              │  mode chip + inline keycap hints
│                                              │     (the [ and ] are the actual keys)
│        CHERRY  MX  BLACK                     │  engraved hero (28px)
│        ‹←                           →›       │  chevron + keycap glyph pair
│        ABS   HQ   ·   3 / 13                 │  meta (idle-dimmed)
│                                              │
│         ╭───────────────────╮                │
│          ─────────·········                  │  DSP Arc — ink-2 at rest
│         ╰───────────────────╯                │     (accent only when typing)
│                                              │
│  · · · · · · · · · · · · · · · · · · · ·    │  LED Ladder — ink-2 ghosted at rest
│                                              │
│  VOLUME ├───────●─────────────┤   62         │  fader (discrete fill)
│  ─────────────────────────────────────────   │  ← hairline rule @ 50% (connects)
│              ◆═ TUNE ═◆                      │  engraved BOSS (raised, not pressed)
└────────────────────────────────────────────┘
```

Note the **recognition hints** on chevrons: `‹[` / `]›` for mode chip and `‹←` / `→›` for switch hero. The `[ ` `]` and `←` `→` silkscreen characters are visibly engraved INTO the chevron glyph's area — the chevron becomes a labeled button, not a bare decoration. Font: 9 px, same engraving recipe.

### Drawer open (360 × 720)
```
┌────────────────────────────────────────────┐
│ ●●●                        HELP      ●     │
├────────────────────────────────────────────┤
│            ┌─ SOFT · LOFI ─┐                 │  ← compact upper region
│        CHERRY  MX  BLACK                     │
│         ABS   HQ   ·   3 / 13                │
│          ╭──────╮   VOLUME  ──●─────  62    │  arc + fader share one row
│           ▓▓▓███                             │  (arc compressed)
│          ╰──────╯                             │
│  ▁▂▃▄▅▆▇  (ladder on its own line)          │
├═══ TUNE ═══════════════ HARDWARE │ STYLE ══┤  drawer header (double rule)
│                                              │
│   [ Original ] [ Warm ] [ Crisp ] [ Deep ]  │  preset chips
│                                              │
│   BODY          ●────────    + 2.5  dB       │  sliders (engraved labels)
│   SPRING        ────●───    − 3.0  dB        │
│   TRANSIENT     ─●──────    + 0.5  dB        │
│   RELEASE       ────────●    + 0.0  dB       │
│   DECAY         ──●─────      1.0  ×         │
│                                              │
│         Reset                    Done        │  footer
└────────────────────────────────────────────┘
```

Notes:
- Help panel (via `HELP` button or `/` key) **replaces** the top half of the chassis content — not a floating overlay. Same bg, same hairlines. Chassis "flips to service mode."
- When drawer is open, the compact row pairs the DSP Arc and Volume fader side-by-side (LED Ladder drops to its own line above), using the horizontal space freed by removing the TUNE button.

---

## Interaction Contract

| Event | Behavior |
|---|---|
| `←` / `→` | Cycle switch — active in closed and drawer states |
| `[` / `]` | Cycle mode |
| `T` | Toggle drawer |
| `/` or `⌘?` | Toggle help panel (both bound — `/` web-native, `⌘?` macOS-native) |
| `Esc` | Close help → close drawer → close window (in that order) |
| `⇧⌘K` | Mute toggle |
| `⌥⌘K` | Toggle window visibility |
| Drawer open + tab has focus | Arrow keys navigate between `Hardware` / `Style` tabs, NOT switches (App listener yields) |
| Help panel open | All single-key app shortcuts suspended except `/` and `Esc` |
| Focus loss on window (blur) | Hide — **unless drawer is open** |
| `prefers-reduced-motion` | Motion section in §Motion applies |
| **Stale `isTuning` guard (v2.2)** | On window-create, if last close timestamp > 1 hour ago, force `isTuning=false` regardless of stored value. Avoids the "drawer reopens days later because I last closed with it open" surprise. Timestamp written to settings on every blur/quit. |
| **First-launch sequence (v2.2)** | If Accessibility permission is missing on first window-create: (1) suppress Warmup; (2) show window in a dimmed pre-Warmup state with the inline permission warn panel already populated; (3) on permission grant, play Warmup once + transient `Initializing…` 400 ms label in the switch-desc area to bridge the polling lag; (4) subscribe to `app.on('did-become-active')` to re-poll permission immediately rather than waiting for the 2 s interval. |

---

## Spacing rhythm (committed in v2.1)

Closed state vertical beat — uses only the scale `--s-1..7` (4/8/12/16/24/32/48). Total must sum to 480.

| Row | Height | Cumulative |
|---|---|---|
| top-plate | 32 | 32 |
| gap `--s-4` | 16 | 48 |
| mode chip block | 24 | 72 |
| gap `--s-5` | 24 | 96 |
| switch hero block (hero 32 + nav 22 + meta 14 + desc 32 + internal gaps 20) | 120 | 216 |
| gap `--s-5` | 24 | 240 |
| DSP arc | 60 | 300 |
| gap `--s-4` | 16 | 316 |
| LED ladder | 20 | 336 |
| gap `--s-3` | 12 | 348 |
| fader | 28 | 376 |
| gap `--s-4` | 16 | 392 |
| hairline rule (50% opacity — connects TUNE to fader block) | 1 | 393 |
| gap `--s-3` | 12 | 405 |
| TUNE action button | 40 | 445 |
| bottom padding `--s-5` | 24 | 469 |
| slack for vibrancy edge | ~11 | 480 |

No more orphan gaps; every beat is `--s-3`, `--s-4`, or `--s-5`. Gap-between-groups (s-5, 24) > gap-within-group (s-3, 12).

**Horizontal**: window padding `0 --s-6 0` (32 px left/right) throughout. Silkscreen keycap hints on chevrons sit inside the horizontal rhythm, not outside it.

---

## Finish picker — grouped (v2.1)

v2.0 showed the 7 finish choices as `Auto` + 2×3 grid — Hick's Law violation (7 undifferentiated choices for a purely aesthetic decision).

v2.1 groups:

```
┌──────────────────────────────────────┐
│  FINISH                              │
│                                       │
│  ╭─ Auto · Follows system ──────╮    │
│  ╰────────────────────────────────╯    │
│                                       │
│  DARK                                 │  ← group header, 9 px ink-2 caps
│  ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ Basalt │ │Verdigr.│ │ Patina │    │
│  └────────┘ └────────┘ └────────┘    │
│  ┌────────┐                          │
│  │Shellac │                          │
│  └────────┘                          │
│                                       │
│  LIGHT                                │
│  ┌────────┐ ┌────────┐               │
│  │  Bone  │ │ Indigo │               │
│  └────────┘ └────────┘               │
└──────────────────────────────────────┘
```

Group headers reduce the scan to "pick a row, pick a chip" — 2-step, 3–4 item decisions each. `Verdigr.` may truncate or wrap to second line; use `aria-label="Verdigris"` + `title` tooltip on hover.

---

## Out of scope for v2

- Custom material textures — lock to 6 for now
- Preset save / share (still a future Pro feature)
- Onboarding first-launch sequence (Warmup is close enough)
- A settings page — the help panel covers finish + sound; tray covers everything else
- Sound pack preview in the UI (needs audio engine work)

---

## Implementation order (when coding resumes)

1. Token refactor: rename `[data-finish='graphite']` → `[data-finish='basalt']` etc; add `--chassis-tint`, `--engrave-shadow`, `--engrave-highlight`, `--noise-url` per material
2. Engraving recipe → apply to `.switch-name`, `.mode-chip`, `.tune-button`, `.fader-label`, `.drawer-title`, `.slider-label`, `.finish-btn`
3. Fix contrast tokens (Slate led-mute, Verdigris ink-2, ink-3-at-small-sizes → ink-2)
4. Replace Help popover + Status tooltip: drop backdrop-filter / box-shadow, use `--overlay` = `--chassis`
5. Replace `?` button with `HELP` engraved key
6. DSP Warmth Arc component (SVG + useAudioEngine extension to expose adaptive volume state)
7. Filament Breath on mode chip pseudo-element
8. Warmup sequence on window open (listen to main-process 'ready' ipc if needed)
9. Status LED shape-encoding + pilot-lit idle
10. `:focus-visible` global + per-component overrides
11. ARIA / dialog / tab semantics
12. `prefers-reduced-motion` sweep
13. UI sound module (opt-in) + tray toggle + storage

That's the v2 scope in order — each step is independently shippable.

---

## Revision log

### v2.2 — after `storyboard` skill 6-frame time-axis review

Time-axis fixes that the static spec missed:

- **Frame 1 — first-launch race**: Warmup deferred until Accessibility permission resolves. macOS settings dialog no longer steals the signature first impression. On grant, Warmup plays exactly once + transient `Initializing…` bridge label covers the 0–2 s permission-polling lag. Re-poll on `app.did-become-active` instead of waiting for the 2 s interval.
- **Frame 2 — DSP Arc dead-end at 100 %**: secondary engine signal added (instantaneous WPM modulates stroke width 1.5–3 px on a 1 s smoothing window). Arc keeps "breathing" even after fill saturates.
- **Frame 3 — click-target-in-flight**: drawer body has `pointer-events: none` from t=0 to t=460 during the open animation. Slider rails render visually but click targets are inert until contents settle. Initial focus committed: keyboard route → first preset chip; mouse route → focus stays on TUNE button until user tabs.
- **Frame 4 — engraved hero strobes during finish swap**: hero opacity dips 1→0→1 (200 ms total black-out) around the 320 ms cross-dissolve so text-shadow values don't ghost. Clicked finish chip snaps to its new state immediately; surrounding chips animate.
- **Frame 5 — long-idle freeze**: paired second drift on Status LED idle pilot at a 47 s cycle (co-prime with the 6 s Filament Breath). Two unsynced motions = unpredictable combined rhythm = panel never reads as static.
- **Frame 6 — drawer state pop + stale persistence**: on Warmup-with-`isTuning=true`, drawer body opacity follows chassis ramp (no pop). New stale-state guard: if window was last closed > 1 hour ago, force `isTuning=false` on next open regardless of stored value.

### v2.1 — after `design-critique` + `refactoring-ui` skill audits

Structural fixes:
- **Hierarchy inversion fixed**: DSP Arc and LED Ladder now default to `--ink-2` at rest; transition to `--led-on` only during active engine state. Reclaimed dominance for the engraved switch hero.
- **Token inventory rationalized**: split `--accent` into `--led-on` / `--interactive` / `--focus-ring` (decoupled LED brightness from button state). Killed `--overlay` (redundant with `--chassis`), `--ink-3` (merged into `--ink-2`), `--accent-soft` (renamed `--interactive-soft`). 96 → 78 values per material set.
- **Engraving committed**: per-material `--engrave-shadow` / `--engrave-highlight` values specified (not deferred to "may need tuning"). Light materials go shadow-only. 12 px minimum enforced for engraved text. Noise masking added under engraved zones to prevent texture interference.
- **Action vs state differentiated**: `TUNE` button now uses **inverse engraving (raised boss)** while preset / finish / bed chips stay pressed-in. Removes the similarity violation.
- **Spacing rhythm committed**: closed-state beat pinned to `--s-3/4/5` only; sums to 480 with no orphan gaps.

Usability fixes:
- **Recognition hints on chevrons**: `‹[` `]›` on mode chip, `‹←` `→›` on switch hero. 9 px engraved keycap glyphs inline with the chevron glyph. Replaces v1's silkscreen strip (rejected as ugly) with an in-button label that reads as part of the control.
- **Warn state surfaces inline**: `needsPermission` / `bluetoothWarning` replaces the switch-desc area with an inline error panel + recovery button. Error identification no longer hidden behind hover.
- **Microcopy**: kept `Switch` / `Mode` tab labels (rejected v2.0's `Hardware / Style` rename — "hardware" is ambiguous). Added subtitles under active tab.
- **Shortcut parity**: `⌘?` now bound alongside `/` for help panel (macOS convention + web convention).
- **Finish picker grouped**: 7 choices organized as `Auto` + `Dark (4)` + `Light (2)` rows. Hick's load cut by ~2/3.

Motion:
- **Shutdown sequence added**: mirrors Warmup (400 ms LED exhale → hairlines fade → chassis hide). Pairs open/close into one felt rhythm (Peak-End).

### v2.0 — initial ONYX direction
Pivoted from v1's "drawn chassis" to "carved chassis." Introduced 6 Materials (from 6 Finishes), DSP Warmth Arc, Filament Breath, Warmup, opt-in UI sound, accessibility baseline.
