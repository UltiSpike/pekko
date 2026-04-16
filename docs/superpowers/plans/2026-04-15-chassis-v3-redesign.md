# Chassis v3 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Pekko popover window height content-driven (not hardcoded), eliminate help-panel cutoff and hidden-scroll UX, and raise the `/` shortcut's discoverability with a keycap glyph — strictly preserving all v2.5 audio and visual semantics.

**Architecture:** Renderer measures the natural content height (via `ResizeObserver` on `.app`, reading `scrollHeight`), debounces, and sends a `resize-window` IPC to main. Main calls `mainWindow.setBounds(...animate)` clamped to `[MIN_H, MAX_H]`. The window construction starts with `show: false` and boots at `MIN_H`; it's revealed only after the first measurement arrives, so users never see a provisional size.

**Tech Stack:** Electron 31, React 18, Vite, TypeScript. No existing unit-test infrastructure — this plan uses manual verification via `npm run dev` + DevTools at each task boundary, not automated tests.

**Spec:** [`docs/superpowers/specs/2026-04-15-chassis-v3-redesign-design.md`](../specs/2026-04-15-chassis-v3-redesign-design.md)

---

## File Structure

Files created or modified, with one-line responsibility:

| File | Role in v3 |
|---|---|
| `src/main/index.ts` | Decommission WINDOW_HEIGHT_CLOSED/OPEN; add boot-show gate; extend blur-hide suppression |
| `src/main/ipc-handlers.ts` | Add `resize-window` and `set-help-open` handlers |
| `src/main/preload.ts` | Expose `resizeWindow(h)` and `setHelpOpen(b)` |
| `src/main/store.ts` | Add `isHelpOpen` to in-memory session state (not persisted) |
| `src/renderer/hooks/useAutoResizeWindow.ts` | NEW — ResizeObserver + debounced resize IPC |
| `src/renderer/App.tsx` | Mount the resize hook; signal helpOpen to main; drop `setIsTuning`-triggered window sizing |
| `src/renderer/App.css` | `.app` → `min-height: 100vh`; `.help-panel` remove overflow; add `.slash-key`, delete `.slash-notch` |
| `src/renderer/components/HelpPanel.tsx` | Remove internal overflow reliance; tighten output readout copy |

Non-responsibilities — files deliberately untouched: every audio file (`audio/**`), every component other than HelpPanel and the top-plate region in App.tsx, all profile/sound-pack logic, tray and permissions code.

---

## Task 1: Add IPC handlers for window resize and help-open state

**Files:**
- Modify: `src/main/preload.ts:54-76`
- Modify: `src/main/ipc-handlers.ts:98-154`

The renderer must be able to (a) tell main "resize to N px" and (b) tell main "help is open" so blur-hide can be suppressed. Two thin IPC channels, no business logic.

- [ ] **Step 1: Extend preload surface**

Edit `src/main/preload.ts`, inside `contextBridge.exposeInMainWorld('api', { ... })` (line 54-76), add two entries immediately after `setSwitchDspOverride`:

```ts
  resizeWindow:    (h: number)  => ipcRenderer.invoke('resize-window', h),
  setHelpOpen:     (open: boolean) => ipcRenderer.invoke('set-help-open', open),
```

- [ ] **Step 2: Add main-side IPC handlers**

Edit `src/main/ipc-handlers.ts`. Extend the `Hooks` type (line 98-100):

```ts
type Hooks = {
  onTuningChange?: (isTuning: boolean) => void
  onResize?: (height: number) => void
  onHelpOpenChange?: (open: boolean) => void
}
```

At the end of `registerIpcHandlers` (just before the closing `}` at line 154), add:

```ts
  ipcMain.handle('resize-window', (_event, h: number) => {
    if (typeof h !== 'number' || !Number.isFinite(h)) return false
    hooks.onResize?.(h)
    return true
  })
  ipcMain.handle('set-help-open', (_event, open: boolean) => {
    hooks.onHelpOpenChange?.(!!open)
    return true
  })
```

- [ ] **Step 3: Typecheck and commit**

```bash
npm run build:main
```

Expected: `tsc -p tsconfig.main.json` exits 0.

```bash
git add src/main/preload.ts src/main/ipc-handlers.ts
git commit -m "feat(ipc): add resize-window / set-help-open channels · v3"
```

---

## Task 2: Main — content-driven window sizing and extended blur suppression

**Files:**
- Modify: `src/main/index.ts:15-24` (constants)
- Modify: `src/main/index.ts:33-89` (createWindow + blur handler)
- Modify: `src/main/index.ts:91-96` (delete setWindowTuning)
- Modify: `src/main/index.ts:128` (hooks wiring)

Decommission `WINDOW_HEIGHT_CLOSED/OPEN/MIN/MAX`. Replace with `MIN_H = 420` and `MAX_H = 760`. The window boots at MIN_H, stays hidden until the renderer's first resize IPC arrives, then shows. Drawer toggling no longer drives window size — the renderer's content change is observed, and the renderer drives the resize.

- [ ] **Step 1: Replace height constants**

In `src/main/index.ts`, replace lines 18-24:

```ts
// Auto-resize clamp — window height follows measured content within these bounds.
// Also used as the BrowserWindow min/max to cap user-initiated drag-resize.
const MIN_H = 420
const MAX_H = 760
```

Delete: `WINDOW_HEIGHT_CLOSED`, `WINDOW_HEIGHT_OPEN`, `WINDOW_HEIGHT_MIN`, `WINDOW_HEIGHT_MAX`.

- [ ] **Step 2: Change window construction**

In `src/main/index.ts`, replace lines 36-57 — the `initialHeight` declaration, the blank line, and the full `new BrowserWindow({...})` call — with:

```ts
  // Provisional boot height — window stays hidden until the renderer's first
  // resize IPC arrives (see 'first-measure-show' gate below). User never sees
  // this size.
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: MIN_H,
    minWidth: WINDOW_WIDTH_MIN,
    maxWidth: WINDOW_WIDTH_MAX,
    minHeight: MIN_H,
    maxHeight: MAX_H,
    show: false,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    roundedCorners: true,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })
```

The `initialHeight` branch on `isTuning` is dropped: on launch the window is hidden at MIN_H and the renderer's first measurement sizes it correctly before it becomes visible. `getSettingsWithStaleGuard()` is still called elsewhere (renderer reads `isTuning` via `window.api.getSettings()` through `store.ts`); that path is untouched.

- [ ] **Step 3: Add helpOpen + firstMeasure state and blur-hide suppression**

In `src/main/index.ts`, add two module-level flags after `let soundEnabled = true` (line 27):

```ts
let soundEnabled = true
let isHelpOpen = false
let firstMeasureApplied = false
```

Replace the entire `mainWindow.on('blur', ...)` handler (lines 78-88):

```ts
  // Hide on blur — popover behavior. Suspended while tune drawer OR help is
  // open so a misclick can't destroy the user's reading/tuning context.
  // (v3: suppression extended from drawer-only to drawer-or-help.)
  mainWindow.on('blur', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (getSettings().isTuning) return
    if (isHelpOpen) return
    recordClose()
    mainWindow.webContents.send('before-hide')
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
        mainWindow.hide()
      }
    }, SHUTDOWN_MS)
  })
```

- [ ] **Step 4: Delete setWindowTuning and wire new hooks**

Delete lines 91-96 entirely (`function setWindowTuning(...)`).

Replace line 128:

```ts
  registerIpcHandlers({ onTuningChange: setWindowTuning })
```

with:

```ts
  registerIpcHandlers({
    onResize: (h) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      const clamped = Math.max(MIN_H, Math.min(MAX_H, Math.round(h)))
      const [w] = mainWindow.getSize()
      mainWindow.setBounds({ width: w, height: clamped }, /* animate */ firstMeasureApplied)
      if (!firstMeasureApplied) {
        firstMeasureApplied = true
        mainWindow.show()
      }
    },
    onHelpOpenChange: (open) => {
      isHelpOpen = open
    }
  })
```

Rationale for `animate: firstMeasureApplied`: the first resize skips animation (otherwise the window would appear to grow on launch); subsequent resizes animate via Electron's internal easing.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run build:main
```

Expected: exits 0. Check the output for any unused-variable warnings about the deleted constants — should be none because they're fully removed.

```bash
git add src/main/index.ts
git commit -m "feat(main): decommission fixed window heights; content-driven resize · v3"
```

---

## Task 3: CSS — `.app` min-height, help-panel scroll removal, slash-key styles

**Files:**
- Modify: `src/renderer/App.css:232-249` (`.app` block)
- Modify: `src/renderer/App.css:401-443` (`.help-wrap`, `.slash-notch` block — rewrite to `.slash-key`)
- Modify: `src/renderer/App.css:448-457` (`.help-panel` block)

Three CSS changes. They are independent and safe to land together in one commit.

- [ ] **Step 1: `.app` height → min-height**

In `src/renderer/App.css`, replace line 236:

```css
  height: 100vh;
```

with:

```css
  min-height: 100vh;
```

Keep `overflow: hidden` on line 248 (defensive — if content momentarily overshoots during a resize animation, no scrollbar flashes).

**Why `min-height` not `height`:** `scrollHeight` on an element with `height: 100vh` + `overflow: hidden` clamps to viewport, which defeats measurement. With `min-height: 100vh`, the element is at least the viewport height (so `.app` still fills the window on short content) but `scrollHeight` reports the natural content height when content exceeds the minimum — which is exactly what we need for measurement.

- [ ] **Step 2: Remove help-panel internal overflow**

In `src/renderer/App.css`, replace the `.help-panel` block (lines 448-457):

```css
.help-panel {
  padding: var(--s-4) 0 var(--s-5);
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  animation: help-in 160ms cubic-bezier(0.32, 0.72, 0.24, 1);
}
```

Deleted: `flex: 1`, `min-height: 0`, `overflow-y: auto`. The window is now responsible for fitting all help content; there is no longer any internal scroll container.

- [ ] **Step 3: Replace `.slash-notch` with `.slash-key`**

In `src/renderer/App.css`, replace the entire `.slash-notch` block (lines 410-443) with:

```css
/* Slash Key — 18×18 keycap glyph of the `/` shortcut. Replaces v2.5's
   near-invisible 10×1 hairline. Idle reads as a chassis label; hover/active
   routes through --interactive so it behaves like any other actionable on
   the panel. */
.slash-key {
  width: 18px;
  height: 18px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: transparent;
  color: var(--ink-2);
  font-family: var(--font);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 16px;  /* 18 box - 2px borders = 16 inner */
  text-align: center;
  cursor: pointer;
  padding: 0;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
}
.slash-key:hover,
.slash-key:focus-visible {
  color: var(--interactive);
  border-color: var(--interactive);
  outline: none;
}
.slash-key:focus-visible {
  box-shadow: 0 0 0 2px var(--chassis), 0 0 0 3px var(--focus-ring);
}
.slash-key.on {
  color: var(--interactive);
  border-color: var(--interactive);
  background: var(--interactive-soft);
}
```

Delete all v2 `.slash-notch` and `.slash-notch::before` rules entirely.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.css
git commit -m "style(chassis): .app min-height; help panel non-scrolling; .slash-key keycap · v3"
```

No build step here — CSS is not typechecked. Visual check happens in Task 7.

---

## Task 4: Add `useAutoResizeWindow` hook

**Files:**
- Create: `src/renderer/hooks/useAutoResizeWindow.ts`

Observes a ref'd element's `scrollHeight`, debounces 120ms, and calls `window.api.resizeWindow(h)`. Self-contained, no React dependencies beyond hooks.

- [ ] **Step 1: Create the hook**

Create `src/renderer/hooks/useAutoResizeWindow.ts`:

```ts
import { useEffect } from 'react'

const DEBOUNCE_MS = 120

// Watches the given element's scrollHeight and pushes it to main as a
// window-resize IPC. No clamping here — main is the authority on min/max.
// `active` lets the caller pause measurement during shutdown / finish-blackout
// frames; when paused, no IPC fires.
export function useAutoResizeWindow(
  ref: React.RefObject<HTMLElement>,
  active: boolean
): void {
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    if (typeof window === 'undefined' || !window.api) return

    let timer: number | null = null
    let lastSent = -1

    const push = () => {
      if (!ref.current) return
      const h = ref.current.scrollHeight
      if (h === lastSent || h <= 0) return
      lastSent = h
      window.api.resizeWindow(h).catch(() => {})
    }

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        push()
      }, DEBOUNCE_MS)
    }

    // Fire once immediately so main can show the window on first paint
    // without waiting the debounce.
    push()

    const ro = new ResizeObserver(schedule)
    ro.observe(el)

    return () => {
      if (timer !== null) window.clearTimeout(timer)
      ro.disconnect()
    }
  }, [ref, active])
}
```

Key design notes inside the hook:

- **First push is synchronous**: the window is hidden on launch waiting for the first `resize-window` IPC (Task 2, Step 4). If we debounce that first call, the window stays hidden for the full debounce window — visible as a delayed launch. Push once immediately, then schedule for subsequent changes.
- **`lastSent` guard**: ResizeObserver can fire repeatedly during CSS transitions; skipping duplicate heights avoids flooding the IPC.
- **`active` flag**: caller passes `false` during `shuttingDown` (see Task 5) so the closing animation's height drop doesn't round-trip through main.

- [ ] **Step 2: Augment `window.api` type declaration**

Search for where `window.api` is typed (likely `src/renderer/vite-env.d.ts` or similar):

```bash
grep -rn "interface.*api\|window\.api" /Users/pochita-/Projects/pekko/src/renderer --include="*.ts" --include="*.tsx" | head -20
```

Expected: one or two files declaring `window.api`. If the declaration is in a `.d.ts` file or an `Api` interface in `App.tsx`, add these two fields (matching preload additions from Task 1):

```ts
resizeWindow: (h: number) => Promise<boolean>
setHelpOpen: (open: boolean) => Promise<boolean>
```

If no typed interface exists (`window.api` is just `any`), create `src/renderer/env.d.ts`:

```ts
export {}

declare global {
  interface Window {
    api: {
      // existing handlers — extend the set declared in preload.ts
      resizeWindow: (h: number) => Promise<boolean>
      setHelpOpen: (open: boolean) => Promise<boolean>
      // Re-declare only the methods this module needs; the rest stays loose.
      [key: string]: any
    }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run build:renderer
```

Expected: exits 0. Vite should report no type errors referencing `window.api.resizeWindow`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useAutoResizeWindow.ts src/renderer/env.d.ts
git commit -m "feat(hook): useAutoResizeWindow — ResizeObserver + debounced IPC · v3"
```

(Omit `env.d.ts` from the command if Step 2 updated an existing declaration instead of creating a new file.)

---

## Task 5: App.tsx — wire the resize hook and signal helpOpen

**Files:**
- Modify: `src/renderer/App.tsx:1-9` (imports)
- Modify: `src/renderer/App.tsx:46-56` (state/refs)
- Modify: `src/renderer/App.tsx:296-299` (root ref on `.app`)
- Modify: `src/renderer/App.tsx:253-288` (keyboard handler — no change to `/` logic; see Step 3)
- Modify: `src/renderer/App.tsx` (new useEffect for helpOpen → main signal)

- [ ] **Step 1: Import the hook**

In `src/renderer/App.tsx`, add one line after line 1:

```ts
import { useAutoResizeWindow } from './hooks/useAutoResizeWindow'
```

- [ ] **Step 2: Add a ref for `.app`**

In `src/renderer/App.tsx`, after line 56 (`const metaTimerRef = useRef<number | null>(null)`), add:

```ts
  const appRef = useRef<HTMLDivElement | null>(null)
```

- [ ] **Step 3: Mount the hook**

Immediately after the `appRef` declaration, add:

```ts
  useAutoResizeWindow(appRef, !shuttingDown)
```

The `!shuttingDown` argument pauses measurement during the 420ms close animation (see App.tsx:114-120 and CSS `@keyframes shutdown-fade`).

- [ ] **Step 4: Signal helpOpen to main**

Find the `setHelpOpen` calls in App.tsx (currently only inline setters like `setHelpOpen((o) => !o)`). Add one new effect after the existing `onBeforeHide` effect (around line 120):

```ts
  useEffect(() => {
    if (!hasApi) return
    window.api.setHelpOpen(helpOpen).catch(() => {})
  }, [helpOpen])
```

- [ ] **Step 5: Attach the ref**

In `src/renderer/App.tsx`, change the root div at line 297 from:

```tsx
    <div className={appCls}>
```

to:

```tsx
    <div className={appCls} ref={appRef}>
```

- [ ] **Step 6: Typecheck + dev smoke**

```bash
npm run build
```

Expected: both main and renderer build exit 0.

```bash
npm run dev
```

Manual check (within 30s):
- Window appears at ~480px (no visible growth animation on launch — first-measure-show gate active)
- Press `/` — window grows smoothly to fit help panel; no bottom clipping
- Press `/` again — window shrinks back
- Press `T` — window grows to drawer height
- Click outside while help is open — window does NOT hide
- Click outside while drawer is open — window does NOT hide
- Click outside while neither is open — window hides normally (regression check)

Kill dev: `Ctrl+C`.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(app): wire auto-resize hook; signal helpOpen to main · v3"
```

---

## Task 6: Replace `.slash-notch` element with `.slash-key`

**Files:**
- Modify: `src/renderer/App.tsx:301-312` (the slash button)

- [ ] **Step 1: Swap classname, glyph, tooltip**

In `src/renderer/App.tsx`, replace lines 304-311:

```tsx
          <button
            className={`slash-notch${helpOpen ? ' on' : ''}`}
            onClick={() => setHelpOpen((o) => !o)}
            aria-label="Shortcuts and finish"
            aria-expanded={helpOpen}
            title="Shortcuts and finish (/)"
          />
```

with:

```tsx
          <button
            className={`slash-key${helpOpen ? ' on' : ''}`}
            onClick={() => setHelpOpen((o) => !o)}
            aria-label="Shortcuts"
            aria-expanded={helpOpen}
            title="Shortcuts · /"
          >/</button>
```

Three changes: class name `slash-notch` → `slash-key`, button has textContent `/` (drives CSS `::before`-free styling), tooltip tightened.

Note: the HelpPanel.tsx `onDown` handler at line 70 references `target.closest('.slash-notch')` — that's updated in Task 7 alongside the readout copy change (they share a commit).

- [ ] **Step 2: Dev visual check**

```bash
npm run dev
```

Manual check:
- Top-right of chassis shows an 18×18 boxed `/` glyph (not a near-invisible hairline)
- Hover: border and glyph turn `--interactive`
- Press `/` or click: help opens, glyph stays highlighted (`.on` class active)
- Tab focus reveals the focus ring box shadow
- Cycle through each Finish (tray menu → Finish): the keycap adapts to all six + Auto

Kill dev: `Ctrl+C`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "style(top-plate): slash-notch → slash-key · discoverable keycap glyph · v3"
```

---

## Task 7: HelpPanel tidy-up — output readout copy + closest selector

**Files:**
- Modify: `src/renderer/components/HelpPanel.tsx:69` (closest selector)
- Modify: `src/renderer/components/HelpPanel.tsx:152-157` (output readout text)

- [ ] **Step 1: Update the outside-click selector**

In `src/renderer/components/HelpPanel.tsx`, replace line 69:

```ts
      if (target.closest('.slash-notch')) return
```

with:

```ts
      if (target.closest('.slash-key')) return
```

- [ ] **Step 2: Tighten output readout copy**

In `src/renderer/components/HelpPanel.tsx`, replace lines 152-157 (the `<span className="help-readout-value">` block):

```tsx
          <span className="help-readout-value">
            {outputInfo
              ? `${outputInfo.latencyMs}ms · ${outputInfo.isBluetooth ? 'BT' : 'WIRED'}`
              : '—'}
          </span>
```

Changes: `Bluetooth` → `BT`, `Wired` → `WIRED` (all-caps matches the `--ink-2` uppercase convention used elsewhere in the readout row).

- [ ] **Step 3: Dev smoke — help panel full-height**

```bash
npm run dev
```

Manual check:
- Press `/` at window default size — the readout at the bottom reads `48ms · BT` or similar with no clipping; window height auto-adjusted
- Click outside the help panel on the chassis background — help closes (the `.slash-key` selector update keeps the open-button from acting as an outside-click)
- Click on the `.slash-key` button itself — toggles (not double-close)

Kill dev: `Ctrl+C`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/HelpPanel.tsx
git commit -m "refactor(help): align closest selector to .slash-key; readout copy BT/WIRED · v3"
```

---

## Task 8: Verification pass against spec §6 success criteria

No code change. Walk through every bullet of the spec's §6 Success Criteria and note PASS/FAIL with evidence.

- [ ] **Step 1: Criterion 1 — help panel fits with no clipping in all six finishes**

```bash
npm run dev
```

Open `/`. For each finish (tray menu → Finish submenu): Basalt, Bone, Phosphor, Cyan, Ember, Slate. In each, confirm the Output readout row at the bottom is fully visible and there's no missing padding at the bottom edge.

Record: PASS / FAIL per finish.

- [ ] **Step 2: Criterion 2 — no literal 480 or 720 as a window height**

```bash
grep -nE "^[^\"']*\b(480|720)\b" src/main/index.ts src/main/ipc-handlers.ts src/main/preload.ts src/renderer/App.tsx src/renderer/components/HelpPanel.tsx src/renderer/App.css src/renderer/hooks/useAutoResizeWindow.ts 2>&1 | grep -v "^Binary"
```

Expected: no matches referring to window height (incidental matches in unrelated contexts — e.g. a 480ms timing — should be reviewed manually but are acceptable).

- [ ] **Step 3: Criterion 3 — `.slash-key` discoverable in 5s glance**

Ask any project member (or self-check): without prior priming, can you spot the `/` affordance on the top plate within 5 seconds at each finish? PASS if yes for all six. A boxed glyph with 1px border against the chassis should be findable.

- [ ] **Step 4: Criterion 4 — drawer state preservation across help open/close**

In dev: open drawer (`T`), adjust a DSP slider (e.g., SPRING). Open help (`/`). Close help (`/` or `Esc`). Confirm drawer is back open with the SPRING value unchanged and no visible flicker during the transition.

- [ ] **Step 5: Criterion 5 — Esc ladder**

In dev: open drawer (`T`), open help (`/`). Press Esc — help closes, drawer visible. Press Esc — drawer closes. Press Esc — (no effect; note: per v2.5 behavior, third Esc is not wired to window hide. This criterion as written in spec §6.5 assumes Esc cascades to window hide, which is not in v2 or v3. Flag this to the spec author — likely a spec error, the ladder should terminate at the drawer close. Do NOT add window-hide-on-Esc in this pass; leave as is.)

Record: PASS on help/drawer close; spec ambiguity on window hide noted.

- [ ] **Step 6: Criterion 6 — rapid `/` and `T` toggling**

In dev: hold `/` to retrigger, then hold `T`, alternate rapidly for ~3 seconds. Observe: window lands at the correct height for the final state (not stuck at an intermediate size), and no visible stutter.

- [ ] **Step 7: Criterion 7 — no scrollbars in any state**

In dev: cycle through main, main+drawer, help. Confirm no scrollbar appears in any state under default Basalt finish.

- [ ] **Step 8: Summarize and commit the verification log**

If any PASS/FAIL deltas warrant documentation, append to the spec under a new `## 8. Verification Log` section (spec has §7 Out of Scope, so §8 is free). Otherwise, skip this step.

If Criterion 5 spec ambiguity was flagged: update spec §6.5 to clarify the intended end-state, then commit:

```bash
git add docs/superpowers/specs/2026-04-15-chassis-v3-redesign-design.md
git commit -m "docs(spec): v3 verification log; clarify Esc ladder end-state"
```

---

## Risk-mitigation follow-ups (not initial scope)

The spec §4 lists risks and their mitigations. Three are implemented in-plan:

- ✅ Rapid toggle overlap — Electron's `setBounds(..., animate)` cancels in-flight automatically when called again (Task 2 Step 4 relies on this).
- ✅ Finish-swap blackout — the hook's `lastSent` guard and the 120ms debounce absorb the transient (Task 4 Step 1).
- ✅ Double resize when help preempts drawer — the renderer re-mounts help content in one pass and the hook fires a single IPC with the final measured height (Task 5).

Two are designed-but-unimplemented; open a follow-up issue if they surface in QA:

- ❌ macOS vibrancy stutter — fallback is RAF-driven `setBounds(..., animate=false)`. Not implemented here; only activate if users report dropped frames.
- ❌ Overflow-aware help panel — if Finishes expand beyond ~10 entries and help exceeds MAX_H, add `overflow-y: auto` with visible 3px track scoped to `.help-panel`. Not implemented here; currently no state exceeds MAX_H.

---

## Self-Review Notes (inline — plan author)

- **Spec coverage**: §3.1 → T2 + T4. §3.2 → T3 + T7. §3.3 → T3 + T6. §3.4 → T3 (removing overflow kills the scroll; the designed-but-not-implemented fallback is documented in the Risks section above). §3.5 → T2 (blur suppression) + T5 (helpOpen signal) + T6 (drawer state preserved because `isTuning` is never mutated during help). §3.6 → T2, T3, T5, T6, T7 collectively. §4 → three mitigations in-plan, two deferred (above). §5 file surface → T1-T7 touch exactly the listed files. §6 → T8.
- **Placeholder scan**: no TBD / TODO / "add appropriate handling" / "similar to above" — every code block is concrete.
- **Type consistency**: `resizeWindow(h: number)` / `setHelpOpen(open: boolean)` match between preload (T1), hook (T4), App.tsx effect (T5). Hooks type `Hooks` extended in T1 Step 2 and consumed in T2 Step 4. The `onResize` / `onHelpOpenChange` names are consistent across both tasks.
