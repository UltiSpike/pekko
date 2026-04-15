import { contextBridge, ipcRenderer } from 'electron'

// Key event callback — wired via MessagePort for lowest latency
let keyCallback: ((keycode: number, type: 'down' | 'up' | 'repeat') => void) | null = null

// Receive the MessagePort from main process (one-time setup)
ipcRenderer.on('key-port', (event) => {
  const port = event.ports[0]
  port.onmessage = (e: MessageEvent) => {
    const d = e.data
    if (!Array.isArray(d) || d.length !== 2 || typeof d[0] !== 'number' || typeof d[1] !== 'number') return
    const [keycode, flag] = d
    if (!keyCallback) return
    const type = flag === 1 ? 'down' : flag === 2 ? 'repeat' : 'up'
    keyCallback(keycode, type)
  }
  port.start()
})

// Sound toggle from main process (Cmd+Shift+K) or tray menu
let soundToggleCallback: ((enabled: boolean) => void) | null = null
ipcRenderer.on('sound-toggle', (_e, enabled: boolean) => {
  if (soundToggleCallback) soundToggleCallback(enabled)
})

// Profile changed from tray menu
let profileChangedCallback: ((id: string) => void) | null = null
ipcRenderer.on('profile-changed', (_e, id: string) => {
  if (profileChangedCallback) profileChangedCallback(id)
})

// Volume changed from tray menu
let volumeChangedCallback: ((v: number) => void) | null = null
ipcRenderer.on('volume-changed', (_e, v: number) => {
  if (volumeChangedCallback) volumeChangedCallback(v)
})

// Finish changed from tray menu
let finishChangedCallback: ((finish: string) => void) | null = null
ipcRenderer.on('finish-changed', (_e, finish: string) => {
  if (finishChangedCallback) finishChangedCallback(finish)
})

// ONYX v2.2 — main signals 'about to hide window' so renderer can play the
// shutdown fade animation in the ~400ms grace before window.hide() fires.
let beforeHideCallback: (() => void) | null = null
ipcRenderer.on('before-hide', () => {
  if (beforeHideCallback) beforeHideCallback()
})

let uiSoundsChangedCallback: ((enabled: boolean) => void) | null = null
ipcRenderer.on('ui-sounds-changed', (_e, enabled: boolean) => {
  if (uiSoundsChangedCallback) uiSoundsChangedCallback(enabled)
})

let holdRepeatChangedCallback: ((enabled: boolean) => void) | null = null
ipcRenderer.on('hold-repeat-changed', (_e, enabled: boolean) => {
  if (holdRepeatChangedCallback) holdRepeatChangedCallback(enabled)
})

// Main broadcasts 'power-resume' after sleep/unlock/user-active events so the
// renderer's AudioEngine can self-heal (resume ctx, or rebuild the audio graph
// if ctx is closed / unresponsive).
let powerResumeCallback: (() => void) | null = null
ipcRenderer.on('power-resume', () => {
  if (powerResumeCallback) powerResumeCallback()
})

contextBridge.exposeInMainWorld('api', {
  onKeyEvent: (cb: (keycode: number, type: 'down' | 'up' | 'repeat') => void) => { keyCallback = cb },
  onSoundToggle: (cb: (enabled: boolean) => void) => { soundToggleCallback = cb },
  onProfileChanged: (cb: (id: string) => void) => { profileChangedCallback = cb },
  onVolumeChanged: (cb: (v: number) => void) => { volumeChangedCallback = cb },
  onFinishChanged: (cb: (finish: string) => void) => { finishChangedCallback = cb },
  onBeforeHide:    (cb: () => void) => { beforeHideCallback = cb },
  onUiSoundsChanged: (cb: (enabled: boolean) => void) => { uiSoundsChangedCallback = cb },
  onHoldRepeatChanged: (cb: (enabled: boolean) => void) => { holdRepeatChangedCallback = cb },
  onPowerResume:   (cb: () => void) => { powerResumeCallback = cb },
  setUiSounds:     (enabled: boolean) => ipcRenderer.invoke('set-ui-sounds', enabled),
  setMode:         (m: string)  => ipcRenderer.invoke('set-mode', m),
  setIsTuning:     (t: boolean) => ipcRenderer.invoke('set-is-tuning', t),
  setFinish:       (f: string)  => ipcRenderer.invoke('set-finish', f),
  setCustomConfig: (cfg: any)   => ipcRenderer.invoke('set-custom-config', cfg),
  setSwitchDspOverride: (profileId: string, override: any) =>
    ipcRenderer.invoke('set-switch-dsp-override', { profileId, override }),
  resizeWindow:    (h: number)  => ipcRenderer.invoke('resize-window', h),
  setHelpOpen:     (open: boolean) => ipcRenderer.invoke('set-help-open', open),
  setHoldRepeat:   (enabled: boolean) => ipcRenderer.invoke('set-hold-repeat', enabled),
  getSettings:       ()            => ipcRenderer.invoke('get-settings'),
  getProfiles:       ()            => ipcRenderer.invoke('get-profiles'),
  loadSoundPack:     (id: string)  => ipcRenderer.invoke('load-sound-pack', id),
  setProfile:        (id: string)  => ipcRenderer.invoke('set-profile', id),
  setVolume:         (v: number)   => ipcRenderer.invoke('set-volume', v),
  checkPermissions:  ()            => ipcRenderer.invoke('check-permissions'),
  requestPermissions:()            => ipcRenderer.invoke('request-permissions')
})
