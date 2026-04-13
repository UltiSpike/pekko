import { BrowserWindow, MessageChannelMain } from 'electron'
import { uIOhook } from 'uiohook-napi'

let isListening = false
let eventsRegistered = false
const activeKeys = new Set<number>()
let keyPort: Electron.MessagePortMain | null = null

export function startKeyboardListener(mainWindow: BrowserWindow): boolean {
  if (isListening) return true

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
      if (activeKeys.has(event.keycode)) return
      activeKeys.add(event.keycode)
      keyPort?.postMessage([event.keycode, 1])
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
