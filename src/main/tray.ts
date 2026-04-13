import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { getSettings, setProfile, setVolume, setTheme } from './store'
import { Profile } from '../shared/types'

const THEMES = [
  { id: 'catppuccin', name: 'Catppuccin' },
  { id: 'tokyo-night', name: 'Tokyo Night' },
  { id: 'rose-pine', name: 'Rosé Pine' },
  { id: 'nord', name: 'Nord' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'gruvbox', name: 'Gruvbox' },
]

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

  // Profile selection (radio group)
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

  // Volume presets (radio group)
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

  return Menu.buildFromTemplate([
    { label: activeName, enabled: false },
    { type: 'separator' },
    ...profileItems,
    { type: 'separator' },
    { label: `Vol ${volPct}%`, enabled: false },
    ...volumeItems,
    { type: 'separator' },
    {
      label: 'Theme',
      submenu: THEMES.map((t) => ({
        label: t.name,
        type: 'radio' as const,
        checked: settings.theme === t.id,
        click: () => {
          setTheme(t.id)
          win?.webContents.send('theme-changed', t.id)
          rebuildTrayMenu()
        },
      })),
    },
    { type: 'separator' },
    {
      label: _soundEnabled ? 'Sound On' : 'Muted',
      type: 'checkbox',
      checked: _soundEnabled,
      click: () => {
        _soundEnabled = !_soundEnabled
        win?.webContents.send('sound-toggle', _soundEnabled)
        rebuildTrayMenu()
      },
    },
    { type: 'separator' },
    {
      label: 'Show Window',
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
