# Pekko · Chassis v3 Design

**Date:** 2026-04-15
**Status:** design approved — ready for plan
**Predecessor:** [docs/design/CHASSIS.md](../../design/CHASSIS.md) (v2.5)
**Scope class:** B · 外科 + 调性（不动信息架构）

## 1. Motivation

v2 shipped a polished instrument-panel aesthetic but four usability defects surfaced in day-to-day use:

| Defect | Root cause |
|---|---|
| `/` help panel gets cut off at the bottom | `HelpPanel` content exceeds the hardcoded 480 px window height |
| Scrolling is painful | macOS vibrancy window hides scrollbars by default; no visual scroll hint |
| `/` shortcut is nearly invisible | `.slash-notch` is a 10×1 px hairline tilted 22.5° in the top-right corner |
| Window height feels hand-tuned | `main/index.ts` hardcodes `WINDOW_HEIGHT_CLOSED = 480` and `WINDOW_HEIGHT_OPEN = 720` |

Three of the four trace back to a single root cause: **window height is a constant, not a function of current-state content**. Fixing the sizing model removes the cutoff, removes the need to scroll, and removes the hand-tuning, all at once. The remaining defect (`/` discoverability) is a self-contained visual fix.

## 2. Non-Goals

The following elements of v2.5 are kept unchanged and MUST NOT be touched by this redesign:

- Switch hero (28 px, tracking +60), meta line fade behavior
- Mode chip and `‹ ›` nav flanks
- LED intensity ladder, VU peak warming, mute blackout
- Volume fader (ticks, handle, tabular value)
- `[ TUNE · T ]` button and its `[ DONE ]` active state
- Tune drawer internal layout (preset chips, DSP rows, reset/done footer)
- All 6 finish tokens (Graphite, Ivory, Phosphor, Cyan, Ember, Slate) and Auto
- Audio DSP chain, warmup sequence, mute breathing, drawer open/close shutter click
- Tray menu structure, Accessibility permission flow, first-launch onboarding
- Help panel internal content (keyboard shortcut rows, finish groups, output readout)

## 3. In-Scope Changes

### 3.1 Window Sizing Model (core)

**Principle:** `window.height = measure(currentStateRoot)`. The constants `WINDOW_HEIGHT_CLOSED` and `WINDOW_HEIGHT_OPEN` are decommissioned — they become **observed** values, not **set** values.

**Measurement pipeline:**

1. Renderer root element (`.app`) mounts a `ResizeObserver`.
2. On `contentRect` change, schedule a 120 ms debounced recompute.
3. Recompute reads `root.scrollHeight` plus the effective top + bottom padding.
4. Clamp to `[MIN_H, MAX_H]`.
5. Send IPC `resize(height)` to the main process.
6. Main calls `mainWindow.setBounds({ x, y, width: 360, height }, animate=true)` anchored at the top-left corner (y preserved, height grows downward — identical anchor to the existing drawer grow).

**Constants:**

- `MIN_H = 420` — defensive floor (renderer could briefly measure too small during finish swaps).
- `MAX_H = 760` — MacBook 13" safe-zone ceiling with menu bar accounted for.

**Animation:**

- Reuse the drawer easing: 220 ms `cubic-bezier(0.32, 0.72, 0.24, 1)`.
- First paint after mount is not animated (otherwise the window appears to grow on launch).
- During `shuttingDown` (existing flag set by `onBeforeHide`), resize is frozen — the close-animation owns the final frame.
- If a resize IPC arrives while another is mid-animation, cancel the in-flight and re-setBounds directly to the new target.

**States and observed heights (informational — not set values):**

| State | Observed height |
|---|---|
| `main · closed` | ≈ 480 |
| `main · drawer` | ≈ 720 |
| `help` | ≈ 540 (content-driven) |

### 3.2 Help Panel

- Stays a **mode** (replaces main UI), not a popover.
- `HelpPanel` removes any height constraint and any internal `overflow: auto` — the window is responsible for fitting the content.
- Internal structure unchanged: Keyboard section · hairline · Finish section (Auto → Dark group → Light group) · hairline · Output readout.
- Output readout text tightens from `48 ms · Bluetooth` to `48ms · BT` / `12ms · WIRED` (removes space around `ms`, abbreviates Bluetooth, keeps the "rack-unit readout" feel).

### 3.3 Slash Affordance

Replace `.slash-notch` with `.slash-key` — a keycap-glyph button that advertises the `/` shortcut.

| Property | Value |
|---|---|
| Box | 18 × 18 px, radius 3 |
| Border | 1 px `--hairline`, no shadow |
| Glyph | `/` centered, JetBrains Mono 11 px / 500, tabular-nums, `line-height: 18 px` |
| Idle | border `--hairline`, glyph `--ink-2` |
| Hover / `:focus-visible` | border `--accent`, glyph `--accent` |
| Active (help open) | border `--accent`, glyph `--accent`, background `--accent` at 14 % alpha |
| Position | Top-plate, right side, to the left of `StatusLed` (same slot `.slash-notch` occupies) |
| Tooltip | `Shortcuts · /` (v2 was `Shortcuts and finish (/)`) |
| Accessibility | `aria-label="Shortcuts"`, `aria-expanded` reflects `helpOpen` |

Rationale for a glyph keycap over a `/ HELP` text label: labels would compete with the mode chip and switch hero for typographic weight. The keycap is a silhouette of the `/` key itself — self-explanatory without copy.

### 3.4 Scroll Contract

**Eliminated by construction.** With the window growing to measured content and `MAX_H = 760`, no state's natural content currently exceeds the frame:

- Help: ≈ 540, well under MAX.
- Drawer: fixed 5 DSP rows, measured ≈ 720.
- Main: always equals content.

If a future change (e.g. Finishes expand beyond ~10 entries) causes help to exceed MAX_H, a fallback applies: help becomes a vertical flex with `overflow-y: auto` and a visible 3 px track (not hidden). This fallback is **designed but not implemented** in v3.

### 3.5 State Machine and Transitions

```
         T               T
 MAIN ────────────→ MAIN + DRAWER
  ↑                  ↑
  │ /                │ /  (drawer frozen; isTuning persisted value preserved)
  ↓                  ↓
 HELP ←────── HELP       (closing / restores the frozen state)
```

**Rules:**

- Pressing `/` with drawer open: `helpOpen = true`, drawer UI unmounts visually. `isTuning` in state and disk is **not** mutated — it's frozen.
- Pressing `/` again (or `Esc`) with help open: help closes. If `isTuning === true` when help opened, the drawer re-mounts; window resizes back to the drawer height.
- `Esc` priority (unchanged from v2): help → drawer → window hide.
- **blur-hide suppression (new):** v2 suppresses blur-hide only while drawer is open. v3 suppresses blur-hide while **help OR drawer is open**. Otherwise clicking anywhere outside while reading help would dismiss it prematurely.

### 3.6 Interaction Contract — Delta vs v2

| Item | v2 | v3 |
|---|---|---|
| `/` visual trigger | `.slash-notch` (10×1 hairline) | `.slash-key` (18×18 keycap glyph) |
| Help overflow | Clipped by 480 window | Window expands to measured height |
| Window height | Hardcoded 480 / 720 | Measured + animated resize |
| blur-hide suppression | drawer-only | help OR drawer |
| Help tooltip | `Shortcuts and finish (/)` | `Shortcuts · /` |
| Pressing `/` with drawer open | drawer UI replaced; isTuning untouched | drawer frozen (same — made explicit) |
| Output readout copy | `48ms · Bluetooth` | `48ms · BT` / `12ms · WIRED` |

Unchanged (explicit reminder): `← →`, `[ ]`, `T`, `⌘?`, `⇧⌘K`, `⌥⌘K`, `Esc` behaviors and tray menu.

## 4. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Rapid `/` + `T` toggling causes animation overlap | On each IPC resize, cancel in-flight animation and jump to new target |
| macOS vibrancy + `setBounds(animated=true)` drops frames on some hardware | Fallback: RAF-driven height interpolation calling `setBounds` per frame with `animate=false`; behind a feature flag for opt-in if users report stutter |
| 11 px glyph on Retina displays at non-integer baseline appears blurry | Force integer `line-height: 18px`; use `font-feature-settings: "tnum"` for consistent metrics |
| ResizeObserver fires during finish-swap blackout frame | Debounce (120 ms) absorbs the transient; also ignore measurements while `heroBlackout === true` |
| Help opening with drawer open causes a double resize (close drawer → open help) | Coalesce: single resize IPC to the help-measured height, bypassing the intermediate 480 |

## 5. Implementation Surface (files touched)

- `src/main/index.ts` — remove height constants; add `ipc.handle('resize', (_, h) => mainWindow.setBounds(...))`; extend blur-hide suppression condition.
- `src/main/preload.ts` + shared IPC types — expose `resize(h: number)`.
- `src/renderer/App.tsx` — mount ResizeObserver on root; call `window.api.resize(h)` on debounced change; preserve drawer state when help opens/closes; drop direct `setSize` calls.
- `src/renderer/components/HelpPanel.tsx` — remove height/overflow constraints; tighten output readout copy.
- `src/renderer/App.css` — new `.slash-key` styles; delete `.slash-notch`; ensure `.help-panel` has no `max-height` or `overflow`.

No changes to: audio pipeline, profile system, tune drawer internals, sound-pack loaders, tray, permissions, profile persistence.

## 6. Success Criteria

1. Opening `/` on any launch fits the entire help panel within the window with zero clipping — verified at min width and at all six finishes.
2. No file in `src/main` or `src/renderer` contains a literal `480` or `720` used as a window height after v3.
3. `.slash-key` is discoverable in a 5-second glance test — confirmed by visible border at idle under all six finishes.
4. Pressing `/` while drawer is open, then `/` again: drawer returns to its previous DSP and scroll state with no flicker.
5. Pressing `Esc` from the most nested state (help open with drawer-frozen) closes help, then closes the drawer on a second press. Esc does NOT hide the window on a third press — window-hide remains bound to `⌥⌘K` and blur, matching v2 behavior despite the v2 doc's claim to the contrary.
6. Rapidly toggling `/` and `T` (≥ 5 presses/s for 3 s) does not leave the window at a wrong height and does not stutter above 60 fps on reference hardware (M-series MBP).
7. No scrollbar appears in any state under default finish settings.

## 7. Out of Scope / Next Passes

- RAF-driven setBounds fallback (activate only if stutter is reported).
- Overflow-aware help panel with visible scroll track (designed in §3.4, implement only when Finishes exceed ~10 entries).
- MODE tab custom-mode parameter layout (inherited from v2 out-of-scope).
- First-launch permission onboarding reskin.
- Full v3 information-architecture rethink (help coexisting with main — the "Field Notes" direction). Deferred to a potential Chassis v4.
