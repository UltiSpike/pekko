import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { AppSettings, Finish, FINISH_MIGRATION, HoldRepeatMode } from '../shared/types'
import {
  DEFAULT_MODE_ID,
  DEFAULT_CUSTOM_STYLE,
  DEFAULT_CUSTOM_BED,
  DEFAULT_CUSTOM_BED_GAIN_DB,
  BedType,
  ModeStyle,
  SwitchDspOverride,
} from '../shared/modes'

const defaults: AppSettings = {
  activeProfile: 'cherrymx-black-abs',
  volume: 0.7,
  startAtLogin: false,
  mode: DEFAULT_MODE_ID,
  isTuning: false,
  finish: 'indigo-linen',
  uiSounds: false,
  holdRepeat: 'off',
  customBed: DEFAULT_CUSTOM_BED,
  customBedGainDb: DEFAULT_CUSTOM_BED_GAIN_DB,
  customStyle: { ...DEFAULT_CUSTOM_STYLE },
  customArcadeEnabled: false,
  switchDspOverrides: {},
}

function getStorePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'settings.json')
}

// Merge stored settings into defaults, deep-merging the nested objects so that
// adding fields to ModeStyle / SwitchDspOverride later doesn't strand old users
// with `undefined` for the new fields.
function mergeSettings(stored: Partial<AppSettings>): AppSettings {
  // ONYX migration: v1 finish names → v2 material names.
  // Stored value is `string` at the JSON layer; cast intentionally for the lookup.
  const storedFinish = stored.finish as string | undefined
  const finish: Finish | undefined = storedFinish && FINISH_MIGRATION[storedFinish]
    ? FINISH_MIGRATION[storedFinish]
    : (stored.finish as Finish | undefined)

  // Hold-repeat migration: v1 boolean → v2 tri-state.
  //   true  → 'edit'  (preserve old 6-key whitelist behavior)
  //   false → 'off'
  //   string values 'off' | 'edit' | 'global' pass through; anything else → default.
  const rawHr = stored.holdRepeat as unknown
  let holdRepeat: HoldRepeatMode
  if (typeof rawHr === 'boolean') {
    holdRepeat = rawHr ? 'edit' : 'off'
  } else if (rawHr === 'off' || rawHr === 'edit' || rawHr === 'global') {
    holdRepeat = rawHr
  } else {
    holdRepeat = defaults.holdRepeat
  }

  return {
    ...defaults,
    ...stored,
    finish: finish ?? defaults.finish,
    holdRepeat,
    customStyle: { ...defaults.customStyle, ...(stored.customStyle ?? {}) },
    customArcadeEnabled: typeof stored.customArcadeEnabled === 'boolean' ? stored.customArcadeEnabled : defaults.customArcadeEnabled,
    switchDspOverrides: { ...defaults.switchDspOverrides, ...(stored.switchDspOverrides ?? {}) },
  }
}

function readStore(): AppSettings {
  try {
    const data = fs.readFileSync(getStorePath(), 'utf-8')
    return mergeSettings(JSON.parse(data))
  } catch {
    return { ...defaults, customStyle: { ...defaults.customStyle }, switchDspOverrides: {} }
  }
}

function writeStore(settings: AppSettings): void {
  const dir = path.dirname(getStorePath())
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(getStorePath(), JSON.stringify(settings, null, 2))
}

export function getSettings(): AppSettings {
  return readStore()
}

export function setProfile(profileId: string): void {
  const s = readStore()
  s.activeProfile = profileId
  writeStore(s)
}

export function setVolume(volume: number): void {
  const s = readStore()
  s.volume = Math.max(0, Math.min(1, volume))
  writeStore(s)
}

export function setStartAtLogin(enabled: boolean): void {
  const s = readStore()
  s.startAtLogin = enabled
  writeStore(s)
}

export function setMode(modeId: string): void {
  const s = readStore()
  s.mode = modeId
  writeStore(s)
}

export function setCustomConfig(cfg: { bed: BedType; bedGainDb: number; style: ModeStyle; arcadeEnabled: boolean }): void {
  const s = readStore()
  s.customBed = cfg.bed
  s.customBedGainDb = cfg.bedGainDb
  s.customStyle = cfg.style
  s.customArcadeEnabled = cfg.arcadeEnabled
  writeStore(s)
}

export function setIsTuning(isTuning: boolean): void {
  const s = readStore()
  s.isTuning = isTuning
  writeStore(s)
}

// ONYX v2.2 — write a close timestamp so the next open can detect "stale" state.
// Used by the isTuning guard: if the user closes with the drawer open and reopens
// hours later, we don't surprise them with a tune session restored from limbo.
export function recordClose(): void {
  const s = readStore()
  s.lastCloseAt = Date.now()
  writeStore(s)
}

// On read, if last close > 1 hour ago, force-clear the drawer state.
export function getSettingsWithStaleGuard(): AppSettings {
  const s = readStore()
  const STALE_MS = 60 * 60 * 1000   // 1 hour
  if (s.isTuning && s.lastCloseAt && Date.now() - s.lastCloseAt > STALE_MS) {
    s.isTuning = false
    writeStore(s)
  }
  return s
}

export function setFinish(finish: Finish): void {
  const s = readStore()
  s.finish = finish
  writeStore(s)
}

export function setUiSounds(enabled: boolean): void {
  const s = readStore()
  s.uiSounds = enabled
  writeStore(s)
}

export function setHoldRepeat(mode: HoldRepeatMode): void {
  const s = getSettings()
  s.holdRepeat = mode
  writeStore(s)
}

// Replace the override block for one switch. Pass an empty object to clear (= revert to preset).
export function setSwitchDspOverride(profileId: string, override: SwitchDspOverride): void {
  const s = readStore()
  if (Object.keys(override).length === 0) {
    delete s.switchDspOverrides[profileId]
  } else {
    s.switchDspOverrides[profileId] = override
  }
  writeStore(s)
}
