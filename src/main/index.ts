import { app, BrowserWindow, globalShortcut } from 'electron'
import path from 'path'
import { startKeyboardListener, stopKeyboardListener } from './keyboard'
import { registerIpcHandlers } from './ipc-handlers'
import { createTray, setSoundEnabled } from './tray'
import { checkAccessibilityPermission, requestAccessibilityPermission } from './permissions'

const ROOT = path.join(__dirname, '..', '..')

let mainWindow: BrowserWindow | null = null
let soundEnabled = true

function isDev() {
  return !app.isPackaged
}

function createWindow() {
  const iconPath = path.join(ROOT, 'assets', 'icons', 'app-icon.icns')

  mainWindow = new BrowserWindow({
    width: 340,
    height: 440,
    show: true,
    resizable: true,
    minWidth: 280,
    minHeight: 320,
    maxWidth: 480,
    maxHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5173')
    // Open DevTools only when explicitly requested: DEVTOOLS=1 npm run dev
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

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide()
    }
  })
}

app.on('ready', () => {
  console.log('[Pekko] App ready')

  // Hide dock icon on macOS — app lives in menu bar tray only
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  createWindow()

  if (mainWindow) {
    createTray(mainWindow)

    // Prompt for Accessibility permission once, then poll until granted
    if (!checkAccessibilityPermission()) {
      console.log('[Pekko] Requesting Accessibility permission...')
      requestAccessibilityPermission() // opens System Settings — only once
    }

    const pollPermissionAndStart = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (!checkAccessibilityPermission()) {
        // Not yet granted — poll without prompting again
        setTimeout(pollPermissionAndStart, 2000)
        return
      }
      if (startKeyboardListener(mainWindow)) {
        console.log('[Pekko] Keyboard ready')
      }
    }
    pollPermissionAndStart()
  }

  registerIpcHandlers()

  // Global shortcut: Cmd+Shift+K to toggle sound on/off
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    soundEnabled = !soundEnabled
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sound-toggle', soundEnabled)
    }
    setSoundEnabled(soundEnabled)
    console.log(`[Pekko] Sound ${soundEnabled ? 'ON' : 'OFF'}`)
  })

  console.log('[Pekko] All systems go! (Cmd+Shift+K to toggle)')
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
