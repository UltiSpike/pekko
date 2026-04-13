import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { AppSettings } from '../shared/types'

const defaults: AppSettings = {
  activeProfile: 'cherrymx-black-abs',
  volume: 0.7,
  startAtLogin: false,
  theme: 'gruvbox'
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
