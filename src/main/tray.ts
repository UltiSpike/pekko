import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSettings, setProfile, setVolume, setFinish } from './store'
import { Profile, FINISHES, Finish } from '../shared/types'

const ROOT = path.join(__dirname, '..', '..')
let tray: Tray | null = null
let win: BrowserWindow | null = null
let _soundEnabled = true

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
    { type: 'separator' },
    {
      label: 'Show Window',
      accelerator: 'CommandOrControl+Alt+K',
      click: () => {
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
    return new Tray(img)
  } catch {
    return new Tray(nativeImage.createEmpty())
  }
}

export function createTray(mainWindow: BrowserWindow): Tray | null {
  try {
    win = mainWindow
    tray = createTrayIcon()
    tray.setToolTip('Pekko')
    tray.setContextMenu(buildMenu())

    tray.on('click', () => {
      if (win?.isVisible()) {
        win.hide()
      } else {
        win?.show()
        win?.focus()
      }
    })

    console.log('[Pekko] Tray created')
    return tray
  } catch (err) {
    console.error('[Pekko] Tray creation failed:', err)
    return null
  }
}
