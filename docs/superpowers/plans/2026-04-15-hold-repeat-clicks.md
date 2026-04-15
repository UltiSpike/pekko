# Hold-Repeat Clicks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "hold-repeat clicks" mode that lets the six information-work keys (`⌫ ⌦ ←→↑↓`) emit click sounds during OS auto-repeat, with three control surfaces (help panel toggle, `⇧⌘R` global shortcut, tray menu checkbox).

**Architecture:** Repeat eligibility is decided in `keyboard.ts` (main process) — first press emits `[keycode, 1]` as today; an OS-repeated keydown emits `[keycode, 2]` only if (a) the toggle is on AND (b) the key is in the `REPEAT_KEYS` whitelist. The renderer audio engine recognizes `flag === 2` as `'repeat'` and plays the down sound at fixed intensity 0.50 without polluting WPM or typing-intensity history. State syncs across all three control surfaces via an IPC + broadcast loop.

**Tech Stack:** Electron 31, React 18, uiohook-napi (existing). No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-04-15-hold-repeat-clicks-design.md`](../specs/2026-04-15-hold-repeat-clicks-design.md)

---

## File Structure

| File | Role |
|---|---|
| `src/shared/types.ts` | Add `holdRepeat: boolean` to `AppSettings`; widen `KeyEvent.type` to include `'repeat'` |
| `src/main/store.ts` | Default `holdRepeat: false` in `defaults`; merge in `mergeSettings` |
| `src/main/keyboard.ts` | Add `REPEAT_KEYS` set + `holdRepeatEnabled` flag + `setHoldRepeat()` export; rework `keydown` to emit `[kc, 2]` on eligible repeats |
| `src/main/preload.ts` | Expose `setHoldRepeat(enabled)` and `onHoldRepeatChanged(cb)` |
| `src/main/ipc-handlers.ts` | Add `set-hold-repeat` handler that persists, calls `keyboard.setHoldRepeat`, broadcasts |
| `src/main/index.ts` | Register `⇧⌘R` global shortcut; pass current `holdRepeat` into `startKeyboardListener` and broadcast helper |
| `src/main/tray.ts` | Add checkbox menu item; `rebuildTrayMenu` reads current state |
| `src/renderer/audio/AudioEngine.ts` | `playSound` accepts `'repeat'`; on repeat use intensity 0.50, skip history update, skip WPM update |
| `src/renderer/hooks/useAudioEngine.ts` | Update `onKeyEvent` callback type to `'down' \| 'up' \| 'repeat'`; widen `window.api` typing |
| `src/main/preload.ts` (key flow) | Map `flag === 2` → `'repeat'` |
| `src/renderer/components/HelpPanel.tsx` | New `TYPING` section with two-segment ON/OFF toggle |
| `src/renderer/App.tsx` | `holdRepeat` state, IPC sync (read on mount, listen for `hold-repeat-changed`), pass to `HelpPanel` |
| `src/renderer/App.css` | New `.repeat-toggle` styles (two-segment chip following the chassis language) |

---

## Task H1: Settings + IPC plumbing

**Files:**
- Modify: `src/shared/types.ts:39-58` (AppSettings) and `src/shared/types.ts:60-63` (KeyEvent)
- Modify: `src/main/store.ts:15-35` (defaults + mergeSettings)
- Modify: `src/main/preload.ts:7-16` (key flag mapping) and `src/main/preload.ts:54-77` (api surface)
- Modify: `src/main/ipc-handlers.ts:98-164` (Hooks + handler)

**Step 1: Extend `AppSettings`**

In `src/shared/types.ts`, inside `AppSettings`, after `uiSounds: boolean` and its comment, add:

```ts
  // Opt-in: when true, OS auto-repeat for ⌫ ⌦ ←→↑↓ produces click sounds.
  // All other keys remain physically realistic (silent on hold).
  holdRepeat: boolean
```

Also widen `KeyEvent.type`:

```ts
export interface KeyEvent {
  keycode: number
  type: 'down' | 'up' | 'repeat'
}
```

- [ ] **Step 2: Default + merge in store**

In `src/main/store.ts`, inside the `defaults` object (line ~15), add:

```ts
  holdRepeat: false,
```

Place it between `uiSounds: false` and the next field — match alphabetical or grouping convention used in surrounding fields.

In `mergeSettings` (line ~37), add a guard so a missing field falls back to default:

```ts
holdRepeat: typeof stored.holdRepeat === 'boolean' ? stored.holdRepeat : defaults.holdRepeat,
```

- [ ] **Step 3: Preload — flag mapping + new API methods**

In `src/main/preload.ts`, find the `port.onmessage` block (lines 9-15). Update the flag mapping to include `2 → 'repeat'`:

```ts
port.onmessage = (e: MessageEvent) => {
  const d = e.data
  if (!Array.isArray(d) || d.length !== 2 || typeof d[0] !== 'number' || typeof d[1] !== 'number') return
  const [keycode, flag] = d
  if (!keyCallback) return
  const type = flag === 1 ? 'down' : flag === 2 ? 'repeat' : 'up'
  keyCallback(keycode, type)
}
```

Update `keyCallback` type at the top of the file:

```ts
let keyCallback: ((keycode: number, type: 'down' | 'up' | 'repeat') => void) | null = null
```

Inside `contextBridge.exposeInMainWorld('api', {...})`, add two new entries — group with the other callback registrations:

```ts
  onHoldRepeatChanged: (cb: (enabled: boolean) => void) => { holdRepeatChangedCallback = cb },
```

And in the `set*` group (after `setHelpOpen`):

```ts
  setHoldRepeat:   (enabled: boolean) => ipcRenderer.invoke('set-hold-repeat', enabled),
```

Above the `contextBridge.exposeInMainWorld` call, declare the callback variable and listener (mirror the existing `uiSoundsChangedCallback` pattern):

```ts
let holdRepeatChangedCallback: ((enabled: boolean) => void) | null = null
ipcRenderer.on('hold-repeat-changed', (_e, enabled: boolean) => {
  if (holdRepeatChangedCallback) holdRepeatChangedCallback(enabled)
})
```

Update the `onKeyEvent` declaration in the same `contextBridge` exposure to widen the type:

```ts
  onKeyEvent: (cb: (keycode: number, type: 'down' | 'up' | 'repeat') => void) => { keyCallback = cb },
```

- [ ] **Step 4: IPC handler + broadcast hook**

In `src/main/ipc-handlers.ts`, extend the `Hooks` type:

```ts
type Hooks = {
  onTuningChange?: (isTuning: boolean) => void
  onResize?: (height: number) => void
  onHelpOpenChange?: (open: boolean) => void
  onHoldRepeatChange?: (enabled: boolean) => void
}
```

At the end of `registerIpcHandlers`, add:

```ts
  ipcMain.handle('set-hold-repeat', (_event, enabled: boolean) => {
    const v = !!enabled
    setHoldRepeat(v)
    rebuildTrayMenu()
    hooks.onHoldRepeatChange?.(v)
    return true
  })
```

Add `setHoldRepeat` to the imports at the top:

```ts
import { getSettings, setProfile, setVolume, setMode, setIsTuning, setFinish, setUiSounds, setCustomConfig, setSwitchDspOverride, setHoldRepeat } from './store'
```

- [ ] **Step 5: store.ts setter export**

In `src/main/store.ts`, after the existing `setUiSounds` setter (or wherever the other setters live), add:

```ts
export function setHoldRepeat(enabled: boolean): void {
  const s = getSettings()
  s.holdRepeat = enabled
  writeStore(s)
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
npm run build:main
```

Expected: exits 0.

```bash
git add src/shared/types.ts src/main/store.ts src/main/preload.ts src/main/ipc-handlers.ts
git commit -m "feat(ipc): plumbing for hold-repeat — settings, IPC channel, flag=2 mapping"
```

---

## Task H2: keyboard.ts — repeat dispatch + whitelist

**Files:**
- Modify: `src/main/keyboard.ts` (most of the file)

The current implementation deduplicates ALL keydown events. We need: first press → flag 1 (unchanged); auto-repeat → flag 2 only when toggle is on AND key is whitelisted.

- [ ] **Step 1: Add REPEAT_KEYS, holdRepeatEnabled flag, setter**

At the top of `src/main/keyboard.ts`, after the imports, add:

```ts
// uIOhook keycodes for the six "information work" keys that get hold-repeat
// when the toggle is on. Other keys remain physically realistic (silent on hold).
// Confirm against `uiohook-napi`'s exported constants on first run (see
// node_modules/uiohook-napi/dist/index.d.ts for the canonical list).
const REPEAT_KEYS: ReadonlySet<number> = new Set([
  14,    // VC_BACKSPACE
  3667,  // VC_DELETE (forward delete, fn+⌫)
  57416, // VC_UP
  57424, // VC_DOWN
  57419, // VC_LEFT
  57421, // VC_RIGHT
])

let holdRepeatEnabled = false

export function setHoldRepeat(enabled: boolean): void {
  holdRepeatEnabled = enabled
}
```

- [ ] **Step 2: Update keydown handler**

Replace the existing `uIOhook.on('keydown', ...)` (lines 22-26) with:

```ts
    uIOhook.on('keydown', (event: any) => {
      const kc = event.keycode
      if (activeKeys.has(kc)) {
        // OS auto-repeat. Drop unless this key is whitelisted AND toggle is on.
        if (!holdRepeatEnabled || !REPEAT_KEYS.has(kc)) return
        keyPort?.postMessage([kc, 2])
        return
      }
      activeKeys.add(kc)
      keyPort?.postMessage([kc, 1])
    })
```

The `keyup` handler (lines 28-31) stays unchanged.

- [ ] **Step 3: Initialize from settings on listener start**

In `startKeyboardListener` (line 9), accept the initial state. Extend the signature:

```ts
export function startKeyboardListener(mainWindow: BrowserWindow, initialHoldRepeat: boolean): boolean {
  if (isListening) return true
  holdRepeatEnabled = initialHoldRepeat
  // ... rest unchanged
```

- [ ] **Step 4: Wire from main**

In `src/main/index.ts`, find the call site of `startKeyboardListener(mainWindow)` (around line 122 in the `pollPermissionAndStart` function). Update to pass `getSettings().holdRepeat`:

```ts
      if (startKeyboardListener(mainWindow, getSettings().holdRepeat)) {
        console.log('[Pekko] Keyboard ready')
      }
```

Add `getSettings` to the imports at the top of `src/main/index.ts` if not already there (it should be — already used).

- [ ] **Step 5: Hook setHoldRepeat into the IPC pipeline**

In `src/main/index.ts`, the existing `registerIpcHandlers({...})` call (around line 121, post-T2). Extend it to wire `onHoldRepeatChange`:

```ts
  registerIpcHandlers({
    onResize: (h) => { /* existing */ },
    onHelpOpenChange: (open) => { /* existing */ },
    onHoldRepeatChange: (enabled) => {
      setKeyboardHoldRepeat(enabled)
      mainWindow?.webContents.send('hold-repeat-changed', enabled)
    },
  })
```

Import the keyboard setter at the top of `src/main/index.ts`. Rename the import to avoid shadowing the store's `setHoldRepeat`:

```ts
import { startKeyboardListener, stopKeyboardListener, setHoldRepeat as setKeyboardHoldRepeat } from './keyboard'
```

- [ ] **Step 6: Typecheck + commit**

```bash
npm run build:main
```

```bash
git add src/main/keyboard.ts src/main/index.ts
git commit -m "feat(keyboard): selective hold-repeat for ⌫⌦ arrows; flag=2 emission"
```

---

## Task H3: Audio engine — handle 'repeat' as fixed-intensity click

**Files:**
- Modify: `src/renderer/audio/AudioEngine.ts:416-...` (`playSound` method)
- Modify: `src/renderer/hooks/useAudioEngine.ts` (`onKeyEvent` typing)

- [ ] **Step 1: Read playSound to confirm structure**

Open `src/renderer/audio/AudioEngine.ts` and find `playSound(keycode: number, type: 'down' | 'up'): void` (around line 416). Read enough context to understand:
- Where typing-intensity history is updated
- Where WPM is updated
- Where the down sound is selected and played
- Where intensity feeds into volume

Confirm the comment in step 2 below describes the actual code.

- [ ] **Step 2: Widen the type and add the repeat branch**

Change the signature:

```ts
playSound(keycode: number, type: 'down' | 'up' | 'repeat'): void {
```

Inside the method, after the early returns and before the existing logic, add:

```ts
  // Repeat path: OS auto-repeat for whitelisted keys. Plays the down sound at
  // fixed intensity 0.50 — bypasses interval-based intensity (would already
  // be ~0.40 at OS rates anyway, this just makes it deterministic) and
  // doesn't pollute per-key intensity history or WPM (which would inflate to
  // 30 wpm-events/sec during a held backspace).
  if (type === 'repeat') {
    const pack = this.activePack
    if (!pack) return
    let buffer: AudioBuffer | null = null
    // Mirror the down-buffer selection from the existing branch — keep both
    // sprite and multi-pack code paths.
    if ('keys' in pack) {
      const keySound = pack.keys.get(keycode)
      buffer = keySound?.down ?? pack.fallbackDown
    } else {
      const special = (pack.data?.specialKeys as Record<number, string> | undefined)?.[keycode]
      buffer = (special && pack.data.press.special[special]) || this.pickVariant(pack.data.press.generic)
    }
    if (!buffer) return
    const fixedIntensity = 0.50
    const volIntensity = fixedIntensity
    const pitchBase = 1.0
    const intensityVol = 0.5 + volIntensity * 0.5
    const finalVol = intensityVol * this.adaptiveMultiplier
    this.playBuffer(buffer, keycode, finalVol, pitchBase, /* isUp */ false)
    return
  }
```

This branch deliberately keeps things minimal: no per-switch DSP balance variation, no jitter, no per-key history. The user gets a clean "metronome-tick" version of the down sound.

The `this.playBuffer(...)` call assumes a private helper that wraps the Web Audio chain. If the existing code does not have this helper and inlines buffer creation in playSound, **stop and report** — the refactor to extract it is part of this task; describe what you found.

- [ ] **Step 3: Update the renderer key-event callback typing**

In `src/renderer/hooks/useAudioEngine.ts`, find the `onKeyEvent` declaration in the `declare global` block (around line 8):

```ts
onKeyEvent: (cb: (keycode: number, type: 'down' | 'up' | 'repeat') => void) => void
```

And the call site in `useEffect` (around line 54):

```ts
window.api.onKeyEvent((keycode, type) => {
  audioEngine.resume()
  audioEngine.playSound(keycode, type)
  pollWpm()
})
```

The `pollWpm()` call after every key event is OK to keep — pollWpm reads `audioEngine.wpm` which is only updated on `'down'` events (the existing engine logic stays unchanged). The repeat path skipped `updateWpm()` in step 2.

- [ ] **Step 4: Build + commit**

```bash
npm run build
```

Both targets should exit 0.

```bash
git add src/renderer/audio/AudioEngine.ts src/renderer/hooks/useAudioEngine.ts
git commit -m "feat(audio): playSound 'repeat' path · fixed intensity 0.50 · skips history/WPM"
```

---

## Task H4: Global shortcut `⇧⌘R`

**Files:**
- Modify: `src/main/index.ts:131-152` (globalShortcut block)

- [ ] **Step 1: Register the shortcut**

In `src/main/index.ts`, immediately after the `⌥⌘K` global shortcut (around line 152), add:

```ts
  // Global: ⇧⌘R toggle hold-repeat
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    const next = !getSettings().holdRepeat
    setHoldRepeat(next)
    setKeyboardHoldRepeat(next)
    rebuildTrayMenu()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hold-repeat-changed', next)
    }
    console.log(`[Pekko] Hold-repeat ${next ? 'ON' : 'OFF'}`)
  })
```

Add the missing imports if not already present:

```ts
import { getSettings, getSettingsWithStaleGuard, recordClose, setHoldRepeat } from './store'
import { rebuildTrayMenu } from './tray'  // if not already imported
```

(Check existing imports — `rebuildTrayMenu` is imported by tray-related files but may not be in `index.ts` yet; if not, add it.)

- [ ] **Step 2: Console log on register failure (defensive)**

After the `globalShortcut.register` call, the return value indicates whether registration succeeded. Wrap it:

```ts
  const heldRegistered = globalShortcut.register('CommandOrControl+Shift+R', () => { ... })
  if (!heldRegistered) {
    console.warn('[Pekko] ⇧⌘R could not be registered — another app holds it. Use the help panel toggle or tray menu instead.')
  }
```

(Refactor the previous block to use this pattern.)

- [ ] **Step 3: Build + commit**

```bash
npm run build:main
```

```bash
git add src/main/index.ts
git commit -m "feat(shortcut): ⇧⌘R toggles hold-repeat globally"
```

---

## Task H5: Tray menu item

**Files:**
- Modify: `src/main/tray.ts` (the `buildMenu` function)

- [ ] **Step 1: Add the checkbox item**

Read `src/main/tray.ts` to find the `buildMenu` function. Locate the existing "Mute" item (already wired through `_soundEnabled`). Immediately after Mute, add:

```ts
{
  label: 'Hold-Repeat Clicks',
  type: 'checkbox',
  accelerator: 'CommandOrControl+Shift+R',
  checked: getSettings().holdRepeat,
  click: () => {
    const next = !getSettings().holdRepeat
    setHoldRepeat(next)
    setKeyboardHoldRepeat(next)
    rebuildTrayMenu()
    if (win && !win.isDestroyed()) {
      win.webContents.send('hold-repeat-changed', next)
    }
  },
},
```

Add imports at the top of `src/main/tray.ts`:

```ts
import { getSettings, setHoldRepeat } from './store'
import { setHoldRepeat as setKeyboardHoldRepeat } from './keyboard'
```

(Check what's already imported — `getSettings` may not be here yet.)

- [ ] **Step 2: Build + commit**

```bash
npm run build:main
```

```bash
git add src/main/tray.ts
git commit -m "feat(tray): Hold-Repeat Clicks checkbox · ⇧⌘R accelerator label"
```

---

## Task H6: Help panel toggle + App.tsx wiring + CSS

**Files:**
- Modify: `src/renderer/App.tsx` (state, IPC sync, prop pass-through)
- Modify: `src/renderer/components/HelpPanel.tsx` (new TYPING section)
- Modify: `src/renderer/App.css` (toggle styles)

- [ ] **Step 1: App.tsx — state + sync**

In `src/renderer/App.tsx`, near the other top-level state declarations (around lines 44-56), add:

```ts
  const [holdRepeat, setHoldRepeatState] = useState(false)
```

In the `useEffect` that calls `getSettings()` on mount (around line 80), inside `.then((s) => { ... })`, add:

```ts
      if (typeof s.holdRepeat === 'boolean') setHoldRepeatState(s.holdRepeat)
```

Add a new `useEffect` (alongside the other `window.api.on*` listeners around line 130):

```ts
  useEffect(() => {
    if (!hasApi) return
    window.api.onHoldRepeatChanged?.(setHoldRepeatState)
  }, [])
```

Add a handler to flip from the help panel:

```ts
  const handleHoldRepeatChange = useCallback(async (next: boolean) => {
    setHoldRepeatState(next)
    if (hasApi) await window.api.setHoldRepeat(next)
  }, [])
```

Pass new props into `<HelpPanel ...>`:

```tsx
<HelpPanel
  finish={finish}
  onFinishChange={handleFinishChange}
  outputInfo={outputInfo}
  holdRepeat={holdRepeat}
  onHoldRepeatChange={handleHoldRepeatChange}
  onClose={() => setHelpOpen(false)}
/>
```

- [ ] **Step 2: Widen `window.api` type in useAudioEngine.ts**

In `src/renderer/hooks/useAudioEngine.ts`, the `declare global { interface Window { api: { ... } } }` block. Add:

```ts
setHoldRepeat: (enabled: boolean) => Promise<boolean>
onHoldRepeatChanged: (cb: (enabled: boolean) => void) => void
```

- [ ] **Step 3: HelpPanel.tsx — TYPING section**

In `src/renderer/components/HelpPanel.tsx`:

Update the `Props` interface (lines 5-10):

```ts
interface Props {
  finish: Finish
  onFinishChange: (f: Finish) => void
  outputInfo: OutputInfo | null
  holdRepeat: boolean
  onHoldRepeatChange: (enabled: boolean) => void
  onClose: () => void
}
```

Update the function signature (line 26):

```ts
export default function HelpPanel({ finish, onFinishChange, outputInfo, holdRepeat, onHoldRepeatChange, onClose }: Props) {
```

Inside the JSX, after the `<hr className="help-divider" />` that follows the Keyboard section (around line 101) and BEFORE the Finish section's `<div>...`, insert:

```tsx
      <div>
        <div className="help-section-title">Typing</div>
        <div className="repeat-toggle">
          <span className="repeat-toggle-label">Hold-repeat clicks</span>
          <div className="repeat-toggle-segments" role="group" aria-label="Hold-repeat clicks">
            <button
              type="button"
              className={`repeat-toggle-seg${holdRepeat ? ' on' : ''}`}
              aria-pressed={holdRepeat}
              onClick={() => onHoldRepeatChange(true)}
            >ON</button>
            <button
              type="button"
              className={`repeat-toggle-seg${!holdRepeat ? ' on' : ''}`}
              aria-pressed={!holdRepeat}
              onClick={() => onHoldRepeatChange(false)}
            >OFF</button>
          </div>
        </div>
        <div className="repeat-toggle-caption">⌫  ⌦  ←  →  ↑  ↓</div>
      </div>

      <hr className="help-divider" />
```

The KEYBOARD shortcut list also needs a new row — append the `⇧⌘R` shortcut to the `SHORTCUTS` constant (line 12):

```ts
const SHORTCUTS: { keys: string; use: string }[] = [
  { keys: '← →',     use: 'Switch'        },
  { keys: '[  ]',    use: 'Mode'          },
  { keys: 'T',       use: 'Tune drawer'   },
  { keys: '/',       use: 'This panel'    },
  { keys: '⌘?',      use: 'This panel'    },
  { keys: 'Esc',     use: 'Close drawer'  },
  { keys: '⇧⌘K',     use: 'Mute'          },
  { keys: '⇧⌘R',     use: 'Hold-repeat'   },
  { keys: '⌥⌘K',     use: 'Toggle window' },
]
```

- [ ] **Step 4: App.css — toggle styles**

In `src/renderer/App.css`, add a new block alongside the other help-related rules (right after `.help-readout-value` block, around line 570):

```css
/* TYPING toggle — two-segment chip; matches .slash-key visual language but
   wider, with a clear hairline divider between segments. */
.repeat-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}
.repeat-toggle-label {
  font-family: var(--font);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--ink-1);
}
.repeat-toggle-segments {
  display: inline-flex;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  overflow: hidden;
}
.repeat-toggle-seg {
  font-family: var(--font);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  background: transparent;
  color: var(--ink-2);
  border: none;
  padding: 4px 10px;
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease;
}
.repeat-toggle-seg + .repeat-toggle-seg {
  border-left: 1px solid var(--hairline);
}
.repeat-toggle-seg:hover { color: var(--interactive); }
.repeat-toggle-seg.on {
  color: var(--interactive);
  background: var(--interactive-soft);
}
.repeat-toggle-seg:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--focus-ring);
}
.repeat-toggle-caption {
  margin-top: var(--s-2);
  font-family: var(--font);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-2);
  opacity: 0.7;
}
```

- [ ] **Step 5: Build + commit**

```bash
npm run build
```

Both should exit 0.

```bash
git add src/renderer/App.tsx src/renderer/components/HelpPanel.tsx src/renderer/App.css src/renderer/hooks/useAudioEngine.ts
git commit -m "feat(help): TYPING section · two-segment Hold-repeat toggle · ⇧⌘R cheatsheet row"
```

---

## Task H7: Manual verification

No code change. Walk through spec §9 success criteria.

- [ ] **Step 1: Baseline OFF — regression check**

Launch dev. Confirm `holdRepeat` is OFF by default (or set via tray to ensure). Hold `⌫` for 3 seconds. Expected: exactly one click sound, no clicks during hold. Same for `←`. PASS / FAIL.

- [ ] **Step 2: ON — repeat triggers for whitelisted keys**

Toggle ON via help panel. Hold `⌫` for 3 seconds. Expected: continuous click stream at OS repeat rate. Releasing stops within ~50ms. Repeat for `⌦`, `←`, `→`, `↑`, `↓`. PASS / FAIL each.

- [ ] **Step 3: ON — non-whitelisted keys still single**

With toggle ON, hold `A` for 3 seconds. Expected: one click on press, silence on hold, one click on release. PASS / FAIL.

- [ ] **Step 4: ⇧⌘R toggle**

Press `⇧⌘R`. Confirm: keyboard behavior changes (test with `⌫` hold); help panel toggle visually flips; tray menu checkbox flips. Press `⇧⌘R` again, all three reflect the flip back. PASS / FAIL.

- [ ] **Step 5: Tray menu toggle**

Tray → Hold-Repeat Clicks. Confirm: keyboard behavior changes; help panel toggle and `⇧⌘R` agree on next press. PASS / FAIL.

- [ ] **Step 6: Help panel toggle**

Open `/`, click ON/OFF segment. Confirm: tray checkbox follows; `⇧⌘R` next press toggles from new state. PASS / FAIL.

- [ ] **Step 7: Persistence**

Set ON, quit Pekko (Cmd+Q from menu bar tray), relaunch. Expected: still ON. PASS / FAIL.

- [ ] **Step 8: Volume comparison**

With ON, hold `⌫` while listening at moderate volume. Repeat clicks should be subjectively softer than first-press click — the 0.50 intensity lock at work. Subjective PASS / FAIL.

- [ ] **Step 9: Commit verification log if needed**

If any step failed: open a follow-up issue or fix in place. If all PASS: no commit needed (this task is verification only).

---

## Self-Review Notes (inline — plan author)

- **Spec coverage:** §3 (REPEAT_KEYS) → H2. §4 (settings field) → H1. §5 (event pipeline) → H1+H2. §6 (renderer 0.50 intensity) → H3. §7.1 (help toggle) → H6. §7.2 (`⇧⌘R`) → H4. §7.3 (tray) → H5. §7.4 (sync loop) → H1+H2+H4+H5+H6 collectively. §9 → H7.
- **Placeholder scan:** no TBD. One conditional in H3 Step 2 ("if not, stop and report") — that's an explicit escalation instruction, not a placeholder.
- **Type consistency:** `setHoldRepeat` (store) and `setKeyboardHoldRepeat` (keyboard alias) are explicitly aliased to avoid shadowing. `'repeat'` literal type appears in widened `KeyEvent.type` (H1), preload mapping (H1), `playSound` signature (H3), and `onKeyEvent` callback (H3). All in agreement. The `'hold-repeat-changed'` channel name is consistent across preload subscribe (H1), main broadcast (H2 step 5, H4, H5).
- **Risk awareness:** `globalShortcut.register` failure handled in H4 Step 2. The keycodes in REPEAT_KEYS need verification against actual `uiohook-napi` exports — flagged as a "first run" check in H2 Step 1 comment. If they're wrong, holding the key will simply do nothing — easy to spot in H7.
