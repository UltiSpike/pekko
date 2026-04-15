import { BrowserWindow, MessageChannelMain } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'

// uIOhook keycodes for the six "information work" keys that get hold-repeat
// when the toggle is on. Other keys remain physically realistic (silent on hold).
const REPEAT_KEYS: ReadonlySet<number> = new Set([
  UiohookKey.Backspace,
  UiohookKey.Delete,
  UiohookKey.ArrowUp,
  UiohookKey.ArrowDown,
  UiohookKey.ArrowLeft,
  UiohookKey.ArrowRight,
])

let holdRepeatEnabled = false

export function setHoldRepeat(enabled: boolean): void {
  holdRepeatEnabled = enabled
}

let isListening = false
let eventsRegistered = false
const activeKeys = new Set<number>()
let keyPort: Electron.MessagePortMain | null = null

export function startKeyboardListener(mainWindow: BrowserWindow, initialHoldRepeat: boolean): boolean {
  if (isListening) return true
  holdRepeatEnabled = initialHoldRepeat

  // Create MessagePort (renderer needs this even before listener starts)
  if (!keyPort) {
    const { port1, port2 } = new MessageChannelMain()
    keyPort = port1
    mainWindow.webContents.postMessage('key-port', null, [port2])
    port1.start()
  }

  // Register uIOhook events only once — they persist across start/stop
  if (!eventsRegistered) {
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

    uIOhook.on('keyup', (event: any) => {
      activeKeys.delete(event.keycode)
      keyPort?.postMessage([event.keycode, 0])
    })

    eventsRegistered = true
  }

  try {
    uIOhook.start()
  } catch {
    return false
  }

  isListening = true
  console.log('[Pekko] Keyboard listener started')
  return true
}

export function stopKeyboardListener(): void {
  if (!isListening) return
  try {
    uIOhook.stop()
    keyPort?.close()
    keyPort = null
    isListening = false
    activeKeys.clear()
  } catch (err) { console.error('[Pekko] Stop error:', err) }
}

// Sleep/wake pair. Unlike stopKeyboardListener, we keep the MessagePort alive
// so the renderer's port reference stays valid across power cycles — there's
// no way to re-deliver a port to an existing renderer. On wake, uIOhook is
// re-started which re-registers the CGEventTap that macOS tears down on sleep.
export function pauseForSleep(): void {
  if (!isListening) return
  try { uIOhook.stop() } catch {}
  isListening = false
  activeKeys.clear()  // drop any held keys so we don't leak ghost keyups post-wake
  console.log('[Pekko] Keyboard paused for sleep')
}

export function resumeAfterWake(): void {
  if (isListening) return
  try {
    uIOhook.start()
    isListening = true
    console.log('[Pekko] Keyboard re-registered after wake')
  } catch (err) {
    console.error('[Pekko] Keyboard restart failed, retrying in 1s:', err)
    setTimeout(() => {
      if (isListening) return
      try {
        uIOhook.start()
        isListening = true
        console.log('[Pekko] Keyboard re-registered (retry ok)')
      } catch (err2) {
        console.error('[Pekko] Keyboard restart retry failed:', err2)
      }
    }, 1000)
  }
}
