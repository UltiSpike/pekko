import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { AppSettings, Finish, FINISH_MIGRATION } from '../shared/types'
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
  finish: 'auto',
  uiSounds: false,
  customBed: DEFAULT_CUSTOM_BED,
  customBedGainDb: DEFAULT_CUSTOM_BED_GAIN_DB,
  customStyle: { ...DEFAULT_CUSTOM_STYLE },
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

  return {
    ...defaults,
    ...stored,
    finish: finish ?? defaults.finish,
    customStyle: { ...defaults.customStyle, ...(stored.customStyle ?? {}) },
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

export function setCustomConfig(cfg: { bed: BedType; bedGainDb: number; style: ModeStyle }): void {
  const s = readStore()
  s.customBed = cfg.bed
  s.customBedGainDb = cfg.bedGainDb
  s.customStyle = cfg.style
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
