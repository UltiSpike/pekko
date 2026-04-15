# Pekko · Mode Chip → Silkscreen Kicker

**Date:** 2026-04-15
**Status:** design approved — ready for plan
**Predecessor:** [docs/design/CHASSIS.md](../../design/CHASSIS.md) (v2.5)
**Scope class:** A · 外科（单组件调性微调，不动信息架构）

## 1. Motivation

The home-page `mode-block` currently reads as a second focal widget competing with the switch hero, producing a "scattered on a table" impression where attention has no single anchor.

Inventory of what gives it focal weight today:

| Decoration | Attention cost |
|---|---|
| `1px --hairline` border + 6px radius | Pill/container shape = "widget" |
| `inset box-shadow` engrave | Physical pocket, asks to be pressed |
| Filament Breath (6s, 0.55 ↔ 1.0 ring opacity) | Continuous motion — strongest attention sink on the page |
| `‹ ›` `mode-nav` buttons flanking | Interactive chrome, duplicates switch nav below |
| 11px 700 tracking +180 `--ink-1` | Heading-weight typography |

All five say "I am an interactive control that demands attention." But mode is a ~1×/day setting (user is category B · occasional switcher), not a hot control. Treating it as hot is the clash.

DSP Warmth Arc is the aesthetic anchor of the lower half — the product's only curve. When the upper half also carries a breathing, bordered, centered element, the two compete and the arc loses.

## 2. Principle

**Demote mode from widget to silkscreen.** Remove the five decorations above. Keep mode visible and changeable, but as an ambient typographic label sitting on the chassis surface — the same way `· IN 48k ·` sits on a Nagra recorder: legible, peripheral, not clickable-looking unless you are already reaching for it.

## 3. Non-Goals

NOT touched by this change:

- Switch hero (28 px, tracking +60), `switch-nav-row`, `switch-meta`, `switch-desc` — all unchanged
- LED intensity ladder, DSP Warmth Arc, volume fader
- `HelpPanel` (Keyboard / Typing / Finish / Readout sections all stay as-is)
- Tray menu (no new submenu yet; revisit after shipping and observing use)
- `[` / `]` keyboard binding semantics; tray right-click behavior
- Mode data shape (`MODES` array, `buildCustomMode`, `DEFAULT_MODE_ID`)
- All six finish tokens and per-finish color blocks
- `warn-panel` inline warning path (replaces `switch-desc` when permission denied — unchanged)

The `switch-desc` row is intentionally left in place. It is a secondary concern; this spec validates that demoting the mode chip alone is enough to remove the "scattered" feeling. Revisit desc only after observing the live result.

## 4. In-Scope Changes

### 4.1 DOM structure

Before (App.tsx 354–359):
```tsx
<div className="mode-block">
  <button className="mode-nav" onClick={() => cycleMode(-1)} aria-label="Previous mode">‹</button>
  <div className="mode-chip">{activeMode.name}</div>
  <button className="mode-nav" onClick={() => cycleMode(1)} aria-label="Next mode">›</button>
</div>
```

After:
```tsx
<div
  className={`mode-kicker${metaVisible ? ' revealed' : ''}`}
  role="button"
  tabIndex={0}
  aria-label={`Mode · ${activeMode.name} · click to cycle`}
  onClick={() => cycleMode(1)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleMode(1) }
  }}
>
  <span className="mode-kicker-arrow prev" aria-hidden>‹</span>
  <span className="mode-kicker-dot"   aria-hidden>·</span>
  <span className="mode-kicker-name">{activeMode.name}</span>
  <span className="mode-kicker-dot"   aria-hidden>·</span>
  <span className="mode-kicker-arrow next" aria-hidden>›</span>
</div>
```

The outer element is a single button-role hit region. Inner spans are `pointer-events: none`. Cycling forward only from the mouse path; keyboard retains `[` (backward) and `]` (forward).

### 4.2 Typography and tokens

| Property | Before `.mode-chip` | After `.mode-kicker-name` |
|---|---|---|
| `font-size` | 11 px | 10 px |
| `font-weight` | 700 | 500 |
| `letter-spacing` | 0.18 em (+180) | 0.36 em (+360) |
| `color` | `--ink-1` | `--ink-3` |
| `text-transform` | uppercase | uppercase |
| border | 1 px `--hairline` | — (removed) |
| border-radius | 6 px | — |
| `box-shadow` inset | engrave pair | — (removed) |
| `padding` | `6px var(--s-3)` | `0` |
| `min-width` | 104 px | — (content-width) |

`.mode-kicker-dot`: same 10 px caps 500, `--ink-3`, tracking 0.24 em. Reads as ornament, not a letter in the name.

`.mode-kicker-arrow`: 10 px `--ink-3`, `opacity: 0` by default, `transition: opacity 150ms ease`.

Default state of `.mode-kicker` container: `opacity: 0.55`.

### 4.3 Interaction

| Trigger | Behavior |
|---|---|
| `[` | Cycle mode backward. Call `flashMeta()` → `.mode-kicker` and `.switch-meta` both reveal to full opacity for 1.5 s. |
| `]` | Cycle forward; same reveal. |
| Hover over `.mode-kicker` | Within 150 ms: `.mode-kicker-arrow` opacity → 1; `.mode-kicker-name` color → `--ink-2`; container opacity → 1. |
| Click on `.mode-kicker` | Cycle forward (same effect as `]`). |
| `Enter` / `Space` while focused | Cycle forward. |
| Focus via keyboard Tab | Visible focus ring = hover state (arrows revealed, name lifted). |

### 4.4 Reveal rhythm — shared ambient pattern

The existing `metaVisible` state (App.tsx 48–58) already drives `.switch-meta` fade-in on `←` / `→`. Extend it to also drive kicker reveal on `[` / `]`.

Unified rule after this change:

> Any ambient-state keypress (← → [ ]) reveals **all** ambient text to full opacity for 1.5 s, then fades back.

"Ambient text" = `.switch-meta` + `.mode-kicker`. Both now share the `metaVisible` flag via a `.revealed` class.

Implementation: in `cycleMode`, call `flashMeta()` after `handleModeChange(...)` — mirroring `cycleProfile` at App.tsx 261–265. No new state, no new timer.

### 4.5 CSS removals

Delete outright from App.css:

- `.mode-chip` rule (lines ~690–707): border, radius, padding, min-width, inset shadow, color
- `.mode-chip::before` rule (lines ~712–721): Filament Breath overlay ring
- `@keyframes filament-breath` (lines ~722–725)
- `.mode-nav` rule and `:hover` variant (lines ~682–688)

Replace with `.mode-kicker*` rules per 4.2.

Keep `.mode-block` selector name only if we want zero churn on the `-webkit-app-region` line (App.css 667); otherwise rename to `.mode-kicker` in that list too. **Decision: rename** — remove the deceptive "block" noun.

### 4.6 Spacing

- `.mode-kicker` `padding-top: var(--s-4)` (16 px, same as before) — window top-plate gap preserved.
- `.switch-block` `padding-top: var(--s-5)` (20 px) → `var(--s-2)` (8 px). Visual attachment: kicker reads as overline to the hero, not as its own row.

Net vertical reclaim: ~24 px, absorbed by increased breathing above the arc (no window height change — the chassis-v3 auto-resize spec will re-measure).

### 4.7 Tray icon — static ring + per-keystroke pulse (universal)

**Philosophy update (revised after §4.7 first iteration):**

> The tray has two roles — **presence** (resting) and **rhythm** (typing). Presence = static; rhythm = per-keystroke, not timer-based. Timer-based pulses at 2–4 Hz always lag fast typing; the only rhythm that scales with the typist is the one driven directly by keydown events.

**Two frames · Single Amber Disc, Size Pulse:**

One element. One shape. Amber filled disc. The whole disc grows outward on keydown and shrinks back at idle. No concentric rings, no center dots, no composite layers.

Geometry (specified at 2x / 36 × 36 canvas; `sharp` downscales to 18 × 18 for 1x):

| Frame | Shape | Radius @ 2x | Diameter @ 2x |
|---|---|---|---|
| Idle (`tray-icon.png`) | `#FFB347` filled disc, α 1.0 | 6 | 12 px (33 % of canvas) |
| On (`tray-icon-on.png`) | `#FFB347` filled disc, α 1.0 | 11 | 22 px (61 % of canvas) |

Both centered (cx=18, cy=18). On each fresh keydown, `setTrayTransient(onImg, 80)` swaps to the on frame; after 80 ms revert to idle.

**Why single-disc size pulse is correct:**

- Prior iterations layered composites (ring + dot; core + halo ring). Both read as instrumentation — a coordinate marker or a gauge — not as a lamp. The "闪烁光芒" / "microscopic-glow breathing" feel requires ONE thing that is itself glowing and pulsing, not two things where one is "the shape" and one is "the decoration".
- With a single disc, size change IS the event. Expanding outward = light emitting outward. Shrinking back = returning to rest.
- The disc is always filled — the amber is always present; only its extent varies. That preserves menu-bar presence (never hollow, never blanks out) while making each keystroke a visible burst.

At 10 Hz typing the disc oscillates between r=6 and r=11 ~10× per second — reads as the lamp literally flickering with the typist's rhythm.

**Color, not template.** Amber `#FFB347` (Pekko's `--led-on` default). `setTemplateImage()` NOT called — macOS renders with colors intact in both light and dark menu bars.

All four assets (`tray-icon.png`, `tray-icon@2x.png`, `tray-icon-on.png`, `tray-icon-on@2x.png`) generated from paired SVG sources via `sharp` during design pass.

**Trigger:**

Every fresh keydown (i.e. `activeKeys.add(kc)` path, not OS auto-repeat) in `main/keyboard.ts` invokes `pulseTrayOnce()` from `tray.ts`. Auto-repeat events deliberately do **not** pulse, matching the audio engine's "physically realistic: one press = one event" default.

**Shared transient driver:**

`tray.ts` exposes `setTrayTransient(img, ms)` — sets `img`, clears any prior revert timer, schedules revert to idle after `ms`. Used by both `pulseTrayOnce()` (80 ms, `tray-icon-on.png`) and Rush-mode PERFECT flash (200 ms, `rush-perfect.png`). **Latest caller wins** — a keystroke arriving during a PERFECT flash preempts the flash. Intentional: keep up with typing > linger on celebration.

**Mode coverage — universal, not rush-only:**

Per-keystroke pulse fires in every mode (Deep Focus, Cozy Writing, Thock, Classic Mech, Custom, Rush). The old rush-specific stage pulse (engaged / stacking / flow / zone base↔bright alternation at 2–4 Hz) is **removed** — subsumed by the universal keystroke-driven behavior. Rush-mode's unique tray contribution is reduced to the 200 ms PERFECT flash.

**Deprecations in `tray.ts`:**

- `pulseTimer`, `pulseAlt`, `perfectTimer`, `rushBaseImg`, `rushBrightImg` variables — removed
- `applyBaseStage()` — merged into simplified `updateArcadeHud()`
- `loadRushIcons()` — only loads `rushPerfectImg` now

**Orphaned assets (not deleted, cleanup pending):**

- `assets/icons/tray-rush/rush-base.*` (png, @2x, svg)
- `assets/icons/tray-rush/rush-bright.*` (png, @2x, svg)

These remain on disk but are no longer referenced by code. Separate cleanup ticket.

**Rationale — why per-keystroke beats timer pulse:**

- Timer pulse (2 Hz flow / 4 Hz zone) lags typing at 120 WPM (~8–10 Hz). User's felt rhythm desyncs from visual.
- Per-keystroke pulse has by-construction zero lag — the visual IS the event.
- 80 ms flash is long enough to register as "flashed on" between keys at up to ~12 Hz (≈ 720 WPM burst). Past that, the ring just stays "on" continuously, which is the right visual truth.
- Rush PERFECT flash (200 ms) is longer and more visually distinct, but will be cut short by subsequent keystrokes — that's the cost of keystroke primacy, deemed acceptable.

## 5. Acceptance

- Menu-bar tray icon renders as a thin ring (not a bird mark), static, correctly tinted by macOS in both light and dark menu-bar appearances.
- On home page, the mode area renders as `‹` (hidden) ` · THOCK ·` `›` (hidden), single-line, 10 px caps, `--ink-3`, container opacity 0.55. No border, no engrave, no breath animation.
- Pressing `[` or `]` cycles mode; during a 1.5 s window, both `.mode-kicker` and `.switch-meta` are at full opacity. After 1.5 s, both fade back.
- Hovering `.mode-kicker` reveals `‹ ›` within 150 ms and lifts name to `--ink-2`. Clicking anywhere on the kicker cycles forward.
- `Tab` focusable; `Enter` / `Space` cycles forward; visible focus state matches hover.
- The old `.mode-chip` border, `inset box-shadow`, `::before` breath ring, `@keyframes filament-breath`, and `.mode-nav` buttons are absent from the rendered DOM and from App.css.
- DspWarmthArc, LED ladder, volume fader, switch hero, switch meta, switch desc, top plate, and all finish tokens are bit-identical in rendered output vs. v2.5.
- Warn-panel path (permission denied) unaffected — `switch-desc` still swaps to `.warn-panel` as before.

## 6. Future (not in this change)

Evaluate after shipping. Candidate next passes:

- Merge kicker into meta line: `THOCK · ABS · HQ · 3/13` as one row; delete kicker DOM entirely. Cuts another ~20 px vertical.
- Delete `switch-desc` as a peer simplification once users confirm they don't read it.
- Add `Mode` submenu to tray menu and `Mode` section (radio row list — scales with N) to HelpPanel for discovery parity with Finish.

These are deferred so the current change can be evaluated on its own merit.
