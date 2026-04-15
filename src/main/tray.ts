import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSettings, setProfile, setVolume, setFinish, setUiSounds, setHoldRepeat } from './store'
import { setHoldRepeat as setKeyboardHoldRepeat } from './keyboard'
import { Profile, FINISHES, Finish, HoldRepeatMode } from '../shared/types'

export type ArcadeHudState =
  | { kind: 'idle' }
  | { kind: 'active'; stage: 'engaged' | 'stacking' | 'flow' | 'zone'; perfect: boolean }

const ROOT = path.join(__dirname, '..', '..')
let tray: Tray | null = null
let idleImg: Electron.NativeImage | null = null         // amber ring, dim (presence)
let onImg: Electron.NativeImage | null = null           // amber ring + center dot (keystroke)
let rushPerfectImg: Electron.NativeImage | null = null  // rush-only: 200ms perfect pop
let revertTimer: ReturnType<typeof setTimeout> | null = null
let win: BrowserWindow | null = null
let _soundEnabled = true
// Gate for pre-measurement race — see index.ts createWindow comment. The tray
// must not reveal the window at the provisional MIN_H size before the
// renderer's first ResizeObserver fire has corrected it.
let canShow: () => boolean = () => true

function holdRepeatSummary(mode: HoldRepeatMode): string {
  return mode === 'off' ? 'Off' : mode === 'edit' ? 'Edit keys' : 'All keys'
}

function applyHoldRepeat(mode: HoldRepeatMode): void {
  setHoldRepeat(mode)
  setKeyboardHoldRepeat(mode)
  rebuildTrayMenu()
  if (win && !win.isDestroyed()) {
    win.webContents.send('hold-repeat-changed', mode)
  }
}

function loadProfiles(): Profile[] {
  try {
    const data = fs.readFileSync(path.join(ROOT, 'profiles', 'index.json'), 'utf-8')
    return JSON.parse(data).profiles
  } catch {
    return []
  }
}

function buildMenu(): Menu {
  const settings = getSettings()
  const profiles = loadProfiles()
  const volPct = Math.round(settings.volume * 100)
  const activeName = profiles.find((p) => p.id === settings.activeProfile)?.name || '—'

  const profileItems: Electron.MenuItemConstructorOptions[] = profiles.map((p) => ({
    label: p.name,
    type: 'radio' as const,
    checked: p.id === settings.activeProfile,
    click: () => {
      setProfile(p.id)
      win?.webContents.send('profile-changed', p.id)
      rebuildTrayMenu()
    },
  }))

  const presets = [0, 25, 50, 75, 100]
  const nearest = presets.reduce((prev, curr) =>
    Math.abs(curr - volPct) < Math.abs(prev - volPct) ? curr : prev
  )
  const volumeItems: Electron.MenuItemConstructorOptions[] = presets.map((v) => ({
    label: `${v}%`,
    type: 'radio' as const,
    checked: v === nearest,
    click: () => {
      setVolume(v / 100)
      win?.webContents.send('volume-changed', v / 100)
      rebuildTrayMenu()
    },
  }))

  const finishItems: Electron.MenuItemConstructorOptions[] = FINISHES.map((f) => ({
    label: f.name,
    type: 'radio' as const,
    checked: f.id === settings.finish,
    click: () => {
      setFinish(f.id as Finish)
      win?.webContents.send('finish-changed', f.id)
      rebuildTrayMenu()
    },
  }))

  const activeFinishName = FINISHES.find((f) => f.id === settings.finish)?.name ?? 'Auto'

  return Menu.buildFromTemplate([
    { label: activeName, enabled: false },
    { type: 'separator' },
    { label: 'Switch', submenu: profileItems },
    { label: `Volume · ${volPct}%`, submenu: volumeItems },
    { label: `Finish · ${activeFinishName}`, submenu: finishItems },
    {
      label: 'UI Sounds',
      type: 'checkbox' as const,
      checked: settings.uiSounds,
      click: () => {
        setUiSounds(!settings.uiSounds)
        win?.webContents.send('ui-sounds-changed', !settings.uiSounds)
        rebuildTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: _soundEnabled ? 'Sound On' : 'Muted',
      type: 'checkbox',
      checked: _soundEnabled,
      accelerator: 'CommandOrControl+Shift+K',
      click: () => {
        _soundEnabled = !_soundEnabled
        win?.webContents.send('sound-toggle', _soundEnabled)
        rebuildTrayMenu()
      },
    },
    {
      label: `Hold-Repeat · ${holdRepeatSummary(settings.holdRepeat)}`,
      submenu: [
        {
          label: 'Off',
          type: 'radio' as const,
          checked: settings.holdRepeat === 'off',
          click: () => applyHoldRepeat('off'),
        },
        {
          label: 'Edit keys  (⌫ ⌦ ← → ↑ ↓)',
          type: 'radio' as const,
          checked: settings.holdRepeat === 'edit',
          click: () => applyHoldRepeat('edit'),
        },
        {
          label: 'All keys',
          type: 'radio' as const,
          checked: settings.holdRepeat === 'global',
          click: () => applyHoldRepeat('global'),
        },
        { type: 'separator' },
        { label: '⇧⌘R  cycle', enabled: false },
      ],
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      accelerator: 'CommandOrControl+Alt+K',
      click: () => {
        if (!canShow()) return
        win?.show()
        win?.focus()
      },
    },
    { label: 'Quit Pekko', click: () => app.quit() },
  ])
}

export function rebuildTrayMenu(): void {
  tray?.setContextMenu(buildMenu())
}

export function setSoundEnabled(enabled: boolean): void {
  _soundEnabled = enabled
  rebuildTrayMenu()
}

function createTrayIcon(): Tray {
  const iconsDir = path.join(ROOT, 'assets', 'icons')
  try {
    // NOT template images — we want the amber color to read as pilot-lamp
    // glow, not auto-tint to menu-bar black/white. Colored PNGs render
    // identically in light and dark menu bars.
    idleImg = nativeImage.createFromPath(path.join(iconsDir, 'tray-icon.png'))
    try {
      onImg = nativeImage.createFromPath(path.join(iconsDir, 'tray-icon-on.png'))
    } catch (err) {
      console.error('[Pekko] on-state icon load failed:', err)
    }
    return new Tray(idleImg)
  } catch {
    return new Tray(nativeImage.createEmpty())
  }
}

function loadRushIcons(): void {
  if (rushPerfectImg) return
  try {
    rushPerfectImg = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray-rush', 'rush-perfect.png'))
  } catch (err) {
    console.error('[Pekko] rush-perfect icon load failed:', err)
  }
}

// Shared transient-image driver. Sets `img` now, clears any prior pending
// revert, and schedules a revert to idle after `ms`. Latest caller wins — a
// keystroke pulse arriving during a PERFECT flash will preempt the flash,
// which is intentional (keep up with typing > linger on celebration).
function setTrayTransient(img: Electron.NativeImage, ms: number): void {
  if (!tray) return
  tray.setImage(img)
  if (revertTimer) clearTimeout(revertTimer)
  revertTimer = setTimeout(() => {
    revertTimer = null
    if (tray && idleImg) tray.setImage(idleImg)
  }, ms)
}

// Fire once per fresh keydown — tray flips to `on` (ring + dot) for 80 ms,
// then reverts to idle (ring). Density is capped only by user's keystroke
// rate, by design. Universal across all modes.
export function pulseTrayOnce(): void {
  if (!onImg) return
  setTrayTransient(onImg, 80)
}

// Rush mode HUD. The per-keystroke pulse is now universal (not rush-specific),
// so this function only reacts to PERFECT hits (brief colored pop) and to
// explicit idle resets. Non-perfect active stages are no-ops — the keystroke
// pulse owns the tray while typing.
export function updateArcadeHud(state: ArcadeHudState): void {
  if (!tray) return
  loadRushIcons()

  if (state.kind === 'active' && state.perfect && rushPerfectImg) {
    setTrayTransient(rushPerfectImg, 200)
    return
  }

  if (state.kind === 'idle') {
    if (revertTimer) { clearTimeout(revertTimer); revertTimer = null }
    if (idleImg) tray.setImage(idleImg)
  }
}

export function createTray(
  mainWindow: BrowserWindow,
  getFirstMeasureApplied: () => boolean = () => true
): Tray | null {
  try {
    win = mainWindow
    canShow = getFirstMeasureApplied
    tray = createTrayIcon()
    tray.setToolTip('Pekko')
    tray.setContextMenu(buildMenu())

    // Left-click on macOS pops the context menu automatically when one is
    // attached. We intentionally don't override it — the panel is a central
    // element and shouldn't pop open from an absent-minded tray click. Panel
    // entry points: ⌥⌘K, menu → Show Window, or the boot-time auto-show.

    console.log('[Pekko] Tray created')
    return tray
  } catch (err) {
    console.error('[Pekko] Tray creation failed:', err)
    return null
  }
}
