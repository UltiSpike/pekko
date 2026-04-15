import { app, BrowserWindow, globalShortcut, powerMonitor } from 'electron'
import path from 'path'
import { startKeyboardListener, stopKeyboardListener, pauseForSleep, resumeAfterWake, setHoldRepeat as setKeyboardHoldRepeat } from './keyboard'
import { registerIpcHandlers } from './ipc-handlers'
import { createTray, setSoundEnabled, rebuildTrayMenu } from './tray'
import { checkAccessibilityPermission, requestAccessibilityPermission } from './permissions'
import { getSettings, recordClose, setHoldRepeat } from './store'

// Shutdown choreography — renderer plays a 400ms fade before main hides the
// window. Slightly over the animation duration to let the keyframe finish.
const SHUTDOWN_MS = 420

const ROOT = path.join(__dirname, '..', '..')

const WINDOW_WIDTH = 360
const WINDOW_WIDTH_MIN = 320
const WINDOW_WIDTH_MAX = 520
// Auto-resize clamp — window height follows measured content within these bounds.
// Also used as the BrowserWindow min/max to cap user-initiated drag-resize.
const MIN_H = 420
const MAX_H = 760

let mainWindow: BrowserWindow | null = null
let soundEnabled = true
let isHelpOpen = false
let firstMeasureApplied = false

function isDev() {
  return !app.isPackaged
}

function createWindow() {
  const iconPath = path.join(ROOT, 'assets', 'icons', 'app-icon.icns')

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
      // Tray-only app: window is hidden most of the time, but renderer must
      // stay responsive for key-event playback and the AudioEngine keepAlive
      // tick. Disabling background throttling prevents Chromium from clamping
      // setTimeout and suspending the AudioContext on a hidden window.
      backgroundThrottling: false,
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
    firstMeasureApplied = false
    isHelpOpen = false
  })

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
}

app.on('ready', () => {
  console.log('[Pekko] App ready')

  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  createWindow()

  if (mainWindow) {
    createTray(mainWindow, () => firstMeasureApplied)

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
      if (startKeyboardListener(mainWindow, getSettings().holdRepeat)) {
        console.log('[Pekko] Keyboard ready')
      }
    }
    pollPermissionAndStart()
  }

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
    },
    onHoldRepeatChange: (enabled) => {
      setKeyboardHoldRepeat(enabled)
      mainWindow?.webContents.send('hold-repeat-changed', enabled)
    }
  })

  // === Power lifecycle ===
  // Why this exists: on long display-sleep / system-sleep cycles macOS tears
  // down uIOhook's CGEventTap (no key events reach us) and suspends the
  // AudioContext. Without explicit handling, the app stays silent until
  // restart. Here we restart uIOhook and notify the renderer to self-heal its
  // audio graph. 'user-did-become-active' covers the display-sleep-only case
  // where 'suspend'/'resume' don't fire.
  const onSleepLike = (label: string) => () => {
    console.log(`[Pekko] Power: ${label}`)
    pauseForSleep()
  }
  const onWakeLike = (label: string) => () => {
    console.log(`[Pekko] Power: ${label}`)
    resumeAfterWake()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('power-resume')
    }
  }
  powerMonitor.on('suspend', onSleepLike('suspend'))
  powerMonitor.on('lock-screen', onSleepLike('lock-screen'))
  powerMonitor.on('resume', onWakeLike('resume'))
  powerMonitor.on('unlock-screen', onWakeLike('unlock-screen'))
  powerMonitor.on('user-did-become-active', onWakeLike('user-did-become-active'))

  // Global: ⇧⌘K mute toggle
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    soundEnabled = !soundEnabled
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sound-toggle', soundEnabled)
    }
    setSoundEnabled(soundEnabled)
    console.log(`[Pekko] Sound ${soundEnabled ? 'ON' : 'OFF'}`)
  })

  // Global: ⌥⌘K toggle window.
  // Suppressed during the brief pre-measurement window on launch — otherwise
  // user would see the provisional MIN_H size before the renderer's first
  // ResizeObserver fire corrects it.
  globalShortcut.register('CommandOrControl+Alt+K', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else if (firstMeasureApplied) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Global: ⇧⌘R toggle hold-repeat
  const holdRepeatRegistered = globalShortcut.register('CommandOrControl+Shift+R', () => {
    const next = !getSettings().holdRepeat
    setHoldRepeat(next)
    setKeyboardHoldRepeat(next)
    rebuildTrayMenu()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hold-repeat-changed', next)
    }
    console.log(`[Pekko] Hold-repeat ${next ? 'ON' : 'OFF'}`)
  })
  if (!holdRepeatRegistered) {
    console.warn('[Pekko] ⇧⌘R could not be registered — another app holds it. Use the help panel toggle or tray menu instead.')
  }

  console.log('[Pekko] All systems go! (⇧⌘K mute · ⇧⌘R hold-repeat · ⌥⌘K toggle window · T tune)')
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
