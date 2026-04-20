// SoundPackStore — 主进程侧的 sound pack 加载 / 缓存 / 查询。
//
// 设计要点：
// 1. 不依赖 fs——bytes + config 从外部传入。调用方（AudioCoreService / ipc-handlers）
//    负责读文件，store 只负责 decode 和组装成 SamplerPack
// 2. Sprite 格式用"共享 DecodedAudio + 每键 {offsetSec, duration}"而不是预切片成 N
//    个独立 buffer——省内存，也避免 AudioBackend 需要 slice API
// 3. KeyBuffer 的结构契约：必须有 .duration 字段。SpriteSlice / DecodedAudio 都满足
//
// 使用时：AudioCoreService.onKey 里 pickKeySound 返回 PickResult.buffer（实际是
// SpriteSlice 或 DecodedAudio），然后 AudioGraph.playBuffer(buffer.audio 或 buffer
// 本身, {..., offsetSec: buffer.offsetSec ?? 0, durationSec: ...})

import type { AudioBackend, DecodedAudio } from './bindings/types.ts'
import type {
  SamplerPack,
  SpritePack,
  MultiPack,
  MultiPackData,
} from '../../shared/audio/KeySampler.ts'

export interface SpriteSlice {
  readonly audio: DecodedAudio  // 共享的全量 buffer
  readonly offsetSec: number    // 相对 audio 起点
  readonly duration: number     // 切片长度（秒）；满足 KeyBufferLike 约束
}

export type PackedBuffer = SpriteSlice | DecodedAudio

export class SoundPackStore {
  private packs = new Map<string, SamplerPack>()

  constructor(private backend: AudioBackend) {}

  // Sprite: 一个大 ogg + config.defines = { keycode: [offsetMs, durMs] }
  async loadSprite(profileId: string, bytes: Uint8Array, config: { defines: Record<string, [number, number]> }): Promise<void> {
    const full = await this.backend.decode(bytes)
    const keys = new Map<number, { down?: SpriteSlice; up?: SpriteSlice }>()
    const entries = Object.entries(config.defines)

    for (const [key, [offsetMs, durMs]] of entries) {
      const isUp = key.endsWith('-up')
      const kc = parseInt(isUp ? key.replace('-up', '') : key, 10)
      if (Number.isNaN(kc)) continue
      const slice: SpriteSlice = {
        audio: full,
        offsetSec: offsetMs / 1000,
        duration: durMs / 1000,
      }
      const existing = keys.get(kc) ?? {}
      if (isUp) existing.up = slice
      else existing.down = slice
      keys.set(kc, existing)
    }

    // Fallback：优先 keycode 30 (A)，否则第一个命中的
    let fallbackDown: SpriteSlice | null = keys.get(30)?.down ?? null
    let fallbackUp: SpriteSlice | null = keys.get(30)?.up ?? null
    if (!fallbackDown) {
      for (const [, v] of keys) {
        if (v.down) { fallbackDown = v.down; break }
      }
    }
    if (!fallbackUp) {
      for (const [, v] of keys) {
        if (v.up) { fallbackUp = v.up; break }
      }
    }

    const pack: SpritePack = { type: 'sprite', keys, fallbackDown, fallbackUp }
    this.packs.set(profileId, pack)
  }

  // Multi: config.defines = { keycode: 'filename.wav' } + files map (bytes per filename)
  async loadMulti(
    profileId: string,
    config: { defines: Record<string, string> },
    files: Record<string, Uint8Array>,
  ): Promise<void> {
    const keys = new Map<number, { down?: DecodedAudio; up?: DecodedAudio }>()
    for (const [key, fname] of Object.entries(config.defines)) {
      const bytes = files[fname]
      if (!bytes) continue
      const isUp = key.endsWith('-up')
      const kc = parseInt(isUp ? key.replace('-up', '') : key, 10)
      if (Number.isNaN(kc)) continue
      const decoded = await this.backend.decode(bytes)
      const existing = keys.get(kc) ?? {}
      if (isUp) existing.up = decoded
      else existing.down = decoded
      keys.set(kc, existing)
    }

    let fd: DecodedAudio | null = null
    let fu: DecodedAudio | null = null
    for (const [, v] of keys) {
      if (!fd && v.down) fd = v.down
      if (!fu && v.up) fu = v.up
    }

    const pack: SpritePack = { type: 'sprite', keys, fallbackDown: fd, fallbackUp: fu }
    this.packs.set(profileId, pack)
  }

  // Kbsim: files 以 'press/...' / 'release/...' 为键
  async loadKbsim(profileId: string, files: Record<string, Uint8Array>): Promise<void> {
    const data: MultiPackData = {
      press: { generic: [], special: {} },
      release: { generic: null, special: {} },
    }
    const releaseGenericCandidates: DecodedAudio[] = []

    for (const [name, bytes] of Object.entries(files)) {
      const decoded = await this.backend.decode(bytes)
      if (name.startsWith('press/GENERIC_R')) {
        data.press.generic.push(decoded)
      } else if (name.startsWith('press/GENERIC')) {
        // 单 generic 也归入变体池
        data.press.generic.push(decoded)
      } else if (name.startsWith('press/')) {
        const key = name.replace('press/', '').replace(/\.\w+$/, '')
        data.press.special[key] = decoded
      } else if (name.startsWith('release/GENERIC')) {
        releaseGenericCandidates.push(decoded)
      } else if (name.startsWith('release/')) {
        const key = name.replace('release/', '').replace(/\.\w+$/, '')
        data.release.special[key] = decoded
      }
    }

    data.release.generic = releaseGenericCandidates[0] ?? null

    const pack: MultiPack = { type: 'multi', data }
    this.packs.set(profileId, pack)
  }

  get(profileId: string): SamplerPack | undefined {
    return this.packs.get(profileId)
  }

  has(profileId: string): boolean {
    return this.packs.has(profileId)
  }

  clear(): void {
    this.packs.clear()
  }
}
