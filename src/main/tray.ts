import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSettings, setProfile, setVolume, setFinish, setUiSounds, setHoldRepeat } from './store'
import { setHoldRepeat as setKeyboardHoldRepeat } from './keyboard'
import { Profile, FINISHES, Finish } from '../shared/types'

export type ArcadeHudState =
  | { kind: 'idle' }
  | { kind: 'active'; stage: 'engaged' | 'stacking' | 'flow' | 'zone'; perfect: boolean }

const ROOT = path.join(__dirname, '..', '..')
let tray: Tray | null = null
let defaultTemplateImg: Electron.NativeImage | null = null
let rushBaseImg: Electron.NativeImage | null = null
let rushBrightImg: Electron.NativeImage | null = null
let rushPerfectImg: Electron.NativeImage | null = null
let pulseTimer: ReturnType<typeof setInterval> | null = null
let perfectTimer: ReturnType<typeof setTimeout> | null = null
let pulseAlt = false
let win: BrowserWindow | null = null
let _soundEnabled = true
// Gate for pre-measurement race — see index.ts createWindow comment. The tray
// must not reveal the window at the provisional MIN_H size before the
// renderer's first ResizeObserver fire has corrected it.
let canShow: () => boolean = () => true

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
      label: 'Hold-Repeat Clicks',
      type: 'checkbox' as const,
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
  const iconPath = path.join(ROOT, 'assets', 'icons', 'tray-icon.png')
  try {
    const img = nativeImage.createFromPath(iconPath)
    img.setTemplateImage(true)
    defaultTemplateImg = img
    return new Tray(img)
  } catch {
    return new Tray(nativeImage.createEmpty())
  }
}

function loadRushIcons(): void {
  if (rushBaseImg) return
  try {
    rushBaseImg = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray-rush', 'rush-base.png'))
    rushBrightImg = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray-rush', 'rush-bright.png'))
    rushPerfectImg = nativeImage.createFromPath(path.join(ROOT, 'assets', 'icons', 'tray-rush', 'rush-perfect.png'))
  } catch (err) {
    console.error('[Pekko] rush icons load failed:', err)
  }
}

export function updateArcadeHud(state: ArcadeHudState): void {
  if (!tray) return
  loadRushIcons()

  if (state.kind === 'active' && state.perfect && rushPerfectImg) {
    if (perfectTimer) clearTimeout(perfectTimer)
    tray.setImage(rushPerfectImg)
    perfectTimer = setTimeout(() => {
      applyBaseStage(state)
    }, 200)
    return
  }

  applyBaseStage(state)
}

function applyBaseStage(state: ArcadeHudState): void {
  if (!tray) return

  if (state.kind === 'idle' || !rushBaseImg || !rushBrightImg) {
    if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null }
    if (defaultTemplateImg) tray.setImage(defaultTemplateImg)
    return
  }

  const { stage } = state
  if (stage === 'engaged' || stage === 'stacking') {
    if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null }
    tray.setImage(stage === 'engaged' ? rushBaseImg : rushBrightImg)
    return
  }

  // flow / zone — 2-frame pulse alternation
  const intervalMs = stage === 'flow' ? 500 : 250  // flow: 2s/cycle, zone: 1s/cycle
  if (pulseTimer) clearInterval(pulseTimer)
  pulseAlt = false
  pulseTimer = setInterval(() => {
    pulseAlt = !pulseAlt
    if (tray && rushBaseImg && rushBrightImg) {
      tray.setImage(pulseAlt ? rushBrightImg : rushBaseImg)
    }
  }, intervalMs)
  tray.setImage(rushBaseImg)
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
