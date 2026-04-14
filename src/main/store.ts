import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { AppSettings } from '../shared/types'
import {
  DEFAULT_MODE_ID,
  DEFAULT_CUSTOM_STYLE,
  DEFAULT_CUSTOM_BED,
  DEFAULT_CUSTOM_BED_GAIN_DB,
  BedType,
  ModeStyle,
} from '../shared/modes'

const defaults: AppSettings = {
  activeProfile: 'cherrymx-black-abs',
  volume: 0.7,
  startAtLogin: false,
  theme: 'gruvbox',
  mode: DEFAULT_MODE_ID,
  customBed: DEFAULT_CUSTOM_BED,
  customBedGainDb: DEFAULT_CUSTOM_BED_GAIN_DB,
  customStyle: { ...DEFAULT_CUSTOM_STYLE },
}

function getStorePath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'settings.json')
}

function readStore(): AppSettings {
  try {
    const data = fs.readFileSync(getStorePath(), 'utf-8')
    return { ...defaults, ...JSON.parse(data) }
  } catch {
    return { ...defaults }
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

export function setTheme(theme: string): void {
  const s = readStore()
  s.theme = theme
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
