import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { getSettings, setProfile, setVolume, setMode, setIsTuning, setFinish, setCustomConfig, setSwitchDspOverride } from './store'
import type { BedType, ModeStyle, SwitchDspOverride } from '../shared/modes'
import type { Finish } from '../shared/types'
import { checkAccessibilityPermission, requestAccessibilityPermission } from './permissions'
import { rebuildTrayMenu } from './tray'

const ROOT = path.join(__dirname, '..', '..')

// Read valid profile IDs from profiles/index.json
function getValidProfileIds(): Set<string> {
  try {
    const data = fs.readFileSync(path.join(ROOT, 'profiles', 'index.json'), 'utf-8')
    const { profiles } = JSON.parse(data) as { profiles: { id: string }[] }
    return new Set(profiles.map((p) => p.id))
  } catch {
    return new Set()
  }
}

// Load a Mechvibes-style sound pack (sprite or multi)
function loadSoundPack(profileId: string): { config: any; spriteData?: Uint8Array; files?: Record<string, Uint8Array> } | null {
  // Security: reject path traversal attempts
  if (/[/\\]|\.\./.test(profileId)) {
    console.error(`[Pekko] Rejected profileId with path separators: ${profileId}`)
    return null
  }

  // Security: only allow whitelisted profile IDs
  const validIds = getValidProfileIds()
  if (!validIds.has(profileId)) {
    console.error(`[Pekko] Unknown profileId: ${profileId}`)
    return null
  }

  // Try HQ sprite first, then legacy kbsim structure
  const hqDir = path.join(ROOT, 'assets', 'sounds-hq', profileId)
  const legacyDir = path.join(ROOT, 'assets', 'sounds', profileId)

  const dir = fs.existsSync(hqDir) ? hqDir : fs.existsSync(legacyDir) ? legacyDir : null
  if (!dir) return null

  const configPath = path.join(dir, 'config.json')

  // HQ sprite format (Mechvibes)
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    if (config.key_define_type === 'single') {
      // Sprite format: one big .ogg file
      const soundFile = path.join(dir, config.sound || 'sound.ogg')
      if (fs.existsSync(soundFile)) {
        const buf = fs.readFileSync(soundFile)
        const clean = new Uint8Array(buf.length)
        clean.set(buf)
        return { config, spriteData: clean }
      }
    } else if (config.key_define_type === 'multi') {
      // Multi-file format (nk-cream WAVs)
      const files: Record<string, Uint8Array> = {}
      const entries = fs.readdirSync(dir)
      for (const entry of entries) {
        if (entry.endsWith('.wav') || entry.endsWith('.mp3') || entry.endsWith('.ogg')) {
          const buf = fs.readFileSync(path.join(dir, entry))
          const clean = new Uint8Array(buf.length)
          clean.set(buf)
          files[entry] = clean
        }
      }
      return { config, files }
    }
  }

  // Legacy kbsim format (press/release directories)
  if (fs.existsSync(path.join(dir, 'press'))) {
    const files: Record<string, Uint8Array> = {}
    for (const subdir of ['press', 'release']) {
      const subPath = path.join(dir, subdir)
      if (!fs.existsSync(subPath)) continue
      for (const file of fs.readdirSync(subPath)) {
        if (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg')) {
          if (fs.statSync(path.join(subPath, file)).size < 100) continue // skip corrupted
          const buf = fs.readFileSync(path.join(subPath, file))
          const clean = new Uint8Array(buf.length)
          clean.set(buf)
          files[`${subdir}/${file}`] = clean
        }
      }
    }
    return { config: { key_define_type: 'kbsim' }, files }
  }

  return null
}

type Hooks = {
  onTuningChange?: (isTuning: boolean) => void
}

export function registerIpcHandlers(hooks: Hooks = {}): void {
  ipcMain.handle('get-settings', () => getSettings())

  ipcMain.handle('get-profiles', () => {
    try {
      const data = fs.readFileSync(path.join(ROOT, 'profiles', 'index.json'), 'utf-8')
      return JSON.parse(data)
    } catch (err) {
      console.error('[Pekko] Failed to read profiles:', err)
      return { profiles: [] }
    }
  })

  ipcMain.handle('load-sound-pack', (_event, profileId: string) => {
    try {
      const pack = loadSoundPack(profileId)
      if (!pack) {
        console.error(`[Pekko] No sound pack found for: ${profileId}`)
        return null
      }

      const type = pack.config.key_define_type
      const size = pack.spriteData
        ? (pack.spriteData.length / 1024).toFixed(0)
        : pack.files
          ? (Object.values(pack.files).reduce((s, u) => s + u.length, 0) / 1024).toFixed(0)
          : '0'

      console.log(`[Pekko] Loaded ${profileId}: type=${type}, ${size} KB`)
      return pack
    } catch (err) {
      console.error('[Pekko] Failed to load sound pack:', profileId, err)
      return null
    }
  })

  ipcMain.handle('set-profile', (_event, id: string) => { setProfile(id); rebuildTrayMenu(); return true })
  ipcMain.handle('set-volume', (_event, v: number) => { setVolume(v); rebuildTrayMenu(); return true })
  ipcMain.handle('set-mode', (_event, m: string) => { setMode(m); return true })
  ipcMain.handle('set-is-tuning', (_event, t: boolean) => { setIsTuning(t); hooks.onTuningChange?.(t); return true })
  ipcMain.handle('set-finish', (_event, f: Finish) => { setFinish(f); rebuildTrayMenu(); return true })
  ipcMain.handle('set-custom-config', (_event, cfg: { bed: BedType; bedGainDb: number; style: ModeStyle }) => {
    setCustomConfig(cfg)
    return true
  })
  ipcMain.handle('set-switch-dsp-override', (_event, payload: { profileId: string; override: SwitchDspOverride }) => {
    setSwitchDspOverride(payload.profileId, payload.override)
    return true
  })
  ipcMain.handle('check-permissions', () => checkAccessibilityPermission())
  ipcMain.handle('request-permissions', () => { requestAccessibilityPermission(); return true })
}
