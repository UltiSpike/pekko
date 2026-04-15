import { app, BrowserWindow, globalShortcut } from 'electron'
import path from 'path'
import { startKeyboardListener, stopKeyboardListener } from './keyboard'
import { registerIpcHandlers } from './ipc-handlers'
import { createTray, setSoundEnabled } from './tray'
import { checkAccessibilityPermission, requestAccessibilityPermission } from './permissions'
import { getSettings } from './store'

const ROOT = path.join(__dirname, '..', '..')

const WINDOW_WIDTH = 360
const WINDOW_HEIGHT_CLOSED = 480
const WINDOW_HEIGHT_OPEN = 720

let mainWindow: BrowserWindow | null = null
let soundEnabled = true

function isDev() {
  return !app.isPackaged
}

function createWindow() {
  const iconPath = path.join(ROOT, 'assets', 'icons', 'app-icon.icns')
  const initialHeight = getSettings().isTuning ? WINDOW_HEIGHT_OPEN : WINDOW_HEIGHT_CLOSED

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: initialHeight,
    show: true,
    resizable: false,
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

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5173')
    if (process.env.DEVTOOLS === '1') {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.openDevTools({ mode: 'detach' })
      })
    }
  } else {
    mainWindow.loadFile(path.join(ROOT, 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Hide on blur — popover behavior. Suspended while the tune drawer is open
  // so a misclick can't destroy the user's mid-tune context.
  mainWindow.on('blur', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (getSettings().isTuning) return
    mainWindow.hide()
  })
}

function setWindowTuning(isTuning: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const [w] = mainWindow.getSize()
  mainWindow.setSize(w, isTuning ? WINDOW_HEIGHT_OPEN : WINDOW_HEIGHT_CLOSED, true)
}

app.on('ready', () => {
  console.log('[Pekko] App ready')

  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  createWindow()

  if (mainWindow) {
    createTray(mainWindow)

    if (!checkAccessibilityPermission()) {
      console.log('[Pekko] Requesting Accessibility permission...')
      requestAccessibilityPermission()
    }

    const pollPermissionAndStart = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (!checkAccessibilityPermission()) {
        setTimeout(pollPermissionAndStart, 2000)
        return
      }
      if (startKeyboardListener(mainWindow)) {
        console.log('[Pekko] Keyboard ready')
      }
    }
    pollPermissionAndStart()
  }

  registerIpcHandlers({ onTuningChange: setWindowTuning })

  // Global: ⇧⌘K mute toggle
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    soundEnabled = !soundEnabled
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sound-toggle', soundEnabled)
    }
    setSoundEnabled(soundEnabled)
    console.log(`[Pekko] Sound ${soundEnabled ? 'ON' : 'OFF'}`)
  })

  // Global: ⌥⌘K toggle window
  globalShortcut.register('CommandOrControl+Alt+K', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  console.log('[Pekko] All systems go! (⇧⌘K mute · ⌥⌘K toggle window · T tune)')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  stopKeyboardListener()
})
