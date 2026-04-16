# Pekko · Hold-Repeat Clicks Design

**Date:** 2026-04-15
**Status:** design approved — ready for plan (v1 shipped) · **Revision v2 appended § 11**
**Predecessor:** v3 chassis redesign ([2026-04-15-chassis-v3-redesign-design.md](2026-04-15-chassis-v3-redesign-design.md))
**Scope:** additive feature — does not alter v3 chassis behavior

## 1. Motivation

v2.5 deduplicates `keydown` events while a key is held (`src/main/keyboard.ts:23`). This matches real mechanical keyboard physics — the switch clicks once on actuation and stays silent during a hold. But software users typing `⌫` to delete a paragraph, or holding `←` to navigate, expect rhythmic per-character feedback. The current behavior leaves them in silence during precisely the moments where audio reinforcement is most valuable.

**Goal:** offer hold-repeat clicks for the six "information work" keys, opt-in by default, with three control surfaces (help panel toggle, global shortcut, tray menu).

## 2. Non-Goals

- Do not change behavior for any other key. All ~100 non-listed keys keep "click once on press, silent on hold" (the v2 baseline).
- Do not introduce per-key volume curves beyond the single repeat-intensity lock specified below.
- Do not extend to mouse, trackpad, or non-keyboard input.
- Do not change the audio DSP chain, profile system, or finish system.

## 3. Repeat-Eligible Keys

| Key | macOS keycode (uIOhook) | Notes |
|---|---|---|
| Backspace (`⌫`) | `VC_BACKSPACE` (14) | Most common use case |
| Forward Delete (`⌦`) | `VC_DELETE` (3667) | `fn + ⌫` on Apple keyboards |
| Up arrow | `VC_UP` (57416) | |
| Down arrow | `VC_DOWN` (57424) | |
| Left arrow | `VC_LEFT` (57419) | |
| Right arrow | `VC_RIGHT` (57421) | |

Exact constants must be confirmed against `uiohook-napi`'s exported keycodes during implementation. The set is named `REPEAT_KEYS` and lives in `src/main/keyboard.ts`.

## 4. Settings

Add to `src/shared/types.ts` (or wherever `Settings` is defined) and `src/main/store.ts`:

- `holdRepeat: boolean` — default `false`, persisted to `settings.json`.

The default is `false` because Pekko's baseline is "physical realism." Repeat is a power-user opt-in.

## 5. Event Pipeline

```
uIOhook 'keydown'
  │
  ├─ first press (activeKeys does not have keycode):
  │     activeKeys.add(keycode)
  │     postMessage([keycode, 1])    ← flag 1 = first
  │
  └─ repeat (activeKeys has keycode):
        if !holdRepeatEnabled OR !REPEAT_KEYS.has(keycode): return  (suppressed)
        else: postMessage([keycode, 2])   ← flag 2 = repeat (do NOT mutate activeKeys)

uIOhook 'keyup'
  activeKeys.delete(keycode)
  postMessage([keycode, 0])
```

The MessagePort tuple `[keycode, flag]` already exists. v3 introduces `flag = 2` as a new value alongside the existing `1` (down) and `0` (up). Renderer code that only knows about `1`/`0` would treat `2` as a no-op (existing check `flag === 1 ? 'down' : 'up'` would label it as `'up'` — wrong). The renderer audio engine must be updated to recognize `flag === 2` as "repeat".

## 6. Renderer Audio Behavior

In `src/renderer/hooks/useAudioEngine.ts`, the keypress handler currently routes every `keydown` through the typing-intensity model (interval-based, 0.35–1.00).

For `flag === 2` (repeat) events:
- Bypass the typing-intensity computation.
- Use a fixed `intensity = 0.50`.
- Continue to apply: spatial pan (per `key-positions.ts`), adaptive volume (session-level decay), all DSP processing.
- Do NOT mutate the per-keycode intensity history (otherwise the next non-repeat press would see distorted intervals).

For `flag === 1` (first press) and `flag === 0` (release): unchanged.

Rationale: at OS auto-repeat rates (~30 Hz, ~33 ms intervals), the existing typing-intensity model would naturally compute 0.35–0.50 anyway. The explicit `0.50` lock makes the behavior deterministic and isolates repeats from the per-key history.

## 7. Control Surfaces

### 7.1 Help panel toggle (primary)

Add a new section to `HelpPanel.tsx`, between the existing KEYBOARD section and the FINISH section, separated by a `<hr className="help-divider" />`:

```
TYPING
  Hold-repeat clicks      [ ON · OFF ]
  ⌫  ⌦  ←→↑↓             (caption, --ink-3 opacity 0.7)
```

The toggle is a two-segment chip styled as a sibling of the existing `.finish-auto` button (single hairline border, 6px radius, JetBrains Mono 11px, uppercase). Active segment uses `--accent` background at 14% alpha (matching `.slash-key.on`).

### 7.2 Global shortcut

`⇧⌘R` (Shift + Command + R). Toggles `holdRepeat`. Registered in `src/main/index.ts` alongside the existing `⇧⌘K` (mute) and `⌥⌘K` (toggle window).

Conflict check: not bound by macOS. Common app-level conflicts (Safari "Reload Without Cache", IntelliJ "Replace") are app-local and don't take priority over `globalShortcut.register`.

### 7.3 Tray menu

Add an item to the tray menu next to "Mute":

```
Hold-Repeat Clicks · ⇧⌘R    [✓]
```

Type: `checkbox` (Electron `MenuItemConstructorOptions.type = 'checkbox'`). State reflects `holdRepeat`.

### 7.4 Synchronization

```
any control surface flips bool
  → IPC `set-hold-repeat` to main
  → store.holdRepeat persisted
  → keyboard.setHoldRepeat() module cache updated
  → main broadcasts `hold-repeat-changed` to renderer
  → renderer state syncs (drives help-panel UI)
  → tray.rebuildMenu() refreshes checkbox
```

The renderer is the source of UI state; main is the source of truth for the keyboard listener's behavior. The broadcast loops back so that toggles from `⇧⌘R` or tray are reflected in the help panel without polling.

## 8. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `flag === 2` reaches an old renderer that doesn't recognize it | Renderer change ships in same release; main and renderer build together. Defensive: in renderer, treat unknown flags as no-op. |
| `⇧⌘R` conflicts with a user's other globally-registered tool | Surface a warning in console only if `globalShortcut.register` returns false; do not fail silently. Gracefully accept that the help-panel toggle and tray are alternative entry points. |
| User holds backspace for many seconds → loud sustained burst | Existing adaptive-volume system (DESIGN.md §"Adaptive Volume") already attenuates sustained typing to 65% after 30s. Repeats are no different. |
| OS repeat rate varies by system preference | Pass-through. Pekko sounds whatever the OS emits. No cap. |

## 9. Success Criteria

1. With `holdRepeat = false`, holding any key produces exactly one click (regression check — same as v2.5).
2. With `holdRepeat = true`, holding `⌫` produces a continuous stream of clicks at OS repeat rate; releasing `⌫` stops the stream within one keyup latency.
3. With `holdRepeat = true`, holding `A` (or any non-repeat-eligible key) still produces only one click.
4. Toggling via `⇧⌘R`: keyboard behavior changes immediately; help panel toggle reflects new state; tray checkbox reflects new state.
5. Toggling via help panel: `⇧⌘R` next press toggles the new state; tray checkbox in sync.
6. Toggling via tray: help panel UI reflects; `⇧⌘R` in sync.
7. Setting persists: quit Pekko while `holdRepeat = true`, relaunch, verify still on.
8. Repeat clicks at intensity 0.50 are audibly quieter than first-press clicks (subjective comfort check).

## 10. Out of Scope / Next Passes

- Per-key intensity tuning for repeats (would add user-facing complexity for marginal gain).
- Additional repeat-eligible keys (`Tab`, `Space` — would create noise during text editing where these are commonly held).
- Mouse / trackpad expansion (separate product question, deferred indefinitely).
- Per-app whitelist (e.g. only repeat in code editors). Out of project scope.

---

## 11. Revision v2 · Tri-State Expansion

**Date:** 2026-04-15 (same-day iteration)
**Driver:** Users who want hold-repeat on **every** key (not just the editing-keys whitelist) were unserved by the v1 boolean toggle. Promoting the boolean to a tri-state lets the feature meet both the "safe default subset" and "opt-in everywhere" cases without inventing a second toggle.

### 11.1 Data shape

Replace `holdRepeat: boolean` with:

```ts
export type HoldRepeatMode = 'off' | 'edit' | 'global'
holdRepeat: HoldRepeatMode
```

Semantics:

| Mode | Auto-repeat policy |
|---|---|
| `'off'` | Drop every OS auto-repeat event (= v1 false; baseline physical realism) |
| `'edit'` | Pass auto-repeat **only** if key is in `REPEAT_KEYS` (⌫ ⌦ ← → ↑ ↓; = v1 true) |
| `'global'` | Pass auto-repeat for every key |

### 11.2 Migration

In `mergeSettings()` (`src/main/store.ts`):

| Stored `holdRepeat` value | v2 runtime value |
|---|---|
| `true` (v1 on) | `'edit'` — preserve prior behavior |
| `false` (v1 off) | `'off'` |
| `'off'` / `'edit'` / `'global'` | pass through |
| anything else | `defaults.holdRepeat` (= `'off'`) |

Migration is one-way: the next `writeStore` call rewrites the JSON with the tri-state string. The renderer's `useEffect`-time load also accepts legacy booleans defensively, in case main hasn't rewritten yet.

### 11.3 Control surfaces

**Help panel** — segment count goes 2 → 3; label changes:

```
Hold-repeat clicks   [ OFF ] [ EDIT ] [ ALL ]
  <caption changes with selection>
```

Caption per mode:
- `off` → `—`
- `edit` → `⌫  ⌦  ←  →  ↑  ↓`
- `global` → `every key`

Existing `.repeat-toggle-seg + .repeat-toggle-seg` sibling-border rule handles a third segment without CSS changes.

**Tray menu** — checkbox → submenu:

```
Hold-Repeat · <Current label>
  ○ Off
  ● Edit keys  (⌫ ⌦ ← → ↑ ↓)
  ○ All keys
  ──
  ⇧⌘R cycle        (disabled hint row)
```

The top-level label includes the current mode's short form (`Off` / `Edit keys` / `All keys`) so state is visible without expanding the submenu. The `⇧⌘R` hint is a disabled menu item — Electron does not allow accelerators on submenu children, so the shortcut lives only at the global level (see below).

**Global shortcut (`⇧⌘R`)** — toggle → cycle:

```ts
off → edit → global → off
```

The cycle order matches `HOLD_REPEAT_CYCLE` exported from `src/shared/types.ts`, used by both main (shortcut handler) and (potentially) renderer in future.

### 11.4 IPC contract

- `set-hold-repeat` payload: `boolean` → `HoldRepeatMode`. Handler validates against the union; invalid values return `false` without state change.
- `hold-repeat-changed` broadcast payload: same type shift.
- Preload `setHoldRepeat` / `onHoldRepeatChanged` signatures updated.
- Renderer `window.api` ambient declaration in `useAudioEngine.ts` updated.

### 11.5 Acceptance delta (beyond v1 §9)

1. Setting `'global'` and holding `A` produces a continuous click stream (new behavior — v1 dropped this).
2. Setting `'edit'` behaves exactly like v1 true (regression check).
3. Setting `'off'` behaves exactly like v1 false (regression check).
4. `⇧⌘R` cycles through all three states (three presses return to start).
5. Tray submenu radios reflect current state; tray label shows short form.
6. First launch after upgrading from a v1 `true` setting lands on `'edit'` without prompting.
7. IPC handler rejects string values outside the union without crashing.
