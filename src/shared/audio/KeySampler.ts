// KeySampler — 纯函数层。把一次键事件（kc + type）翻译成"该播哪个 buffer、
// 音量 / pitch / duration 各是多少"。
//
// 设计约束：
// 1. 纯函数（无副作用）；所有状态从调用方传入，通过 PickState 维护跨调用记忆
// 2. 不真正播放音频——只返回 PickResult，副作用（创建 source / 连接 node / 调度）
//    由 AudioGraph 完成
// 3. KeyBuffer 是 opaque handle，这里只依赖 `.duration` 字段（renderer AudioBuffer 和
//    main DecodedAudio 都满足）

import type { TypingSnapshot } from './TypingAnalytics.ts'

export interface KeyBufferLike {
  readonly duration: number
}

// KeyBuffer 只约束 .duration 字段，其余由实现自由扩展（DecodedAudio / AudioBuffer /
// SpriteSlice 都合法）
export type KeyBuffer = KeyBufferLike

export interface SpriteKeySound {
  down?: KeyBuffer
  up?: KeyBuffer
}

export interface SpritePack {
  type: 'sprite'
  keys: Map<number, SpriteKeySound>
  fallbackDown: KeyBuffer | null
  fallbackUp: KeyBuffer | null
}

export interface MultiPackData {
  press: {
    generic: KeyBuffer[]
    special: Record<string, KeyBuffer>
  }
  release: {
    generic: KeyBuffer | null
    special: Record<string, KeyBuffer>
  }
}

export interface MultiPack {
  type: 'multi'
  data: MultiPackData
}

export type SamplerPack = SpritePack | MultiPack

// 只需要 intensityLocked / pitchJitter / volumeJitter — 其他 mode.style 字段
// 是 DSP filter 级别，和采样选择无关
export interface ModeStyleInput {
  intensityLocked: boolean
  pitchJitter: number
  volumeJitter: number
}

// KeySampler 只关心 topDownBalanceDb 和 decayScale；其他 DSP 字段是 filter 参数
export interface SwitchDspInput {
  topDownBalanceDb: number
  decayScale: number
}

export interface PickResult {
  buffer: KeyBuffer
  volume: number
  pitch: number
  offsetJitterSec: number
  durationSec: number
}

// 跨调用状态：记住上一次的 variant index（避免连续重复）+ 每键 down→up 强度关联
export interface PickState {
  lastVariant?: number
  keyIntensity?: Map<number, number>
}

export const SAMPLER_SPECIAL_KEYS: Readonly<Record<number, string>> = Object.freeze({
  14: 'BACKSPACE',
  28: 'ENTER',
  41: 'ENTER',
  57: 'SPACE',
})

export const SAMPLER_MAX_DURATION_SEC = 0.40

function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

function pickVariant(variants: KeyBuffer[], state: PickState): KeyBuffer | undefined {
  if (!variants.length) return undefined
  if (variants.length === 1) return variants[0]
  let i: number
  do {
    i = Math.floor(Math.random() * variants.length)
  } while (i === state.lastVariant)
  state.lastVariant = i
  return variants[i]
}

function selectBuffer(
  pack: SamplerPack,
  keycode: number,
  type: 'down' | 'up' | 'repeat',
  state: PickState,
): KeyBuffer | null {
  if (pack.type === 'sprite') {
    const ks = pack.keys.get(keycode)
    if (type === 'up') return ks?.up ?? pack.fallbackUp ?? null
    return ks?.down ?? pack.fallbackDown ?? null
  }
  const special = SAMPLER_SPECIAL_KEYS[keycode]
  if (type === 'up') {
    return (special && pack.data.release.special[special]) || pack.data.release.generic || null
  }
  return (special && pack.data.press.special[special]) || pickVariant(pack.data.press.generic, state) || null
}

export function pickKeySound(
  pack: SamplerPack,
  keycode: number,
  type: 'down' | 'up' | 'repeat',
  snapshot: TypingSnapshot,
  style: ModeStyleInput,
  dsp: SwitchDspInput,
  activeVoices: number,
  state: PickState = {},
): PickResult | null {
  const buffer = selectBuffer(pack, keycode, type, state)
  if (!buffer) return null

  // --- repeat 路径：固定参数的"节拍器" ---
  if (type === 'repeat') {
    const vol = 0.75 * snapshot.adaptiveMul
    const durSec = Math.min(buffer.duration * dsp.decayScale, SAMPLER_MAX_DURATION_SEC)
    return {
      buffer,
      volume: vol,
      pitch: 1.0,
      offsetJitterSec: 0,
      durationSec: durSec,
    }
  }

  // --- down/up 路径：完整 intensity / pitch / volume 链 ---
  const effectiveIntensity = style.intensityLocked ? 0.7 : snapshot.intensity

  // down↔up 强度关联：heavy down → 安静 up (controlled release)，
  // light down → 响亮 up (loose bounce)。维持在 PickState
  const keyIntensityMap = state.keyIntensity ?? (state.keyIntensity = new Map<number, number>())
  let volIntensity: number
  if (type === 'down') {
    keyIntensityMap.set(keycode, effectiveIntensity)
    volIntensity = effectiveIntensity
  } else {
    const downIntensity = keyIntensityMap.get(keycode) ?? 0.7
    keyIntensityMap.delete(keycode)
    volIntensity = 1.15 - downIntensity * 0.3
  }

  // pitch：原 AudioEngine 在 !intensityLocked 时用 this.typingIntensity（不是 effectiveIntensity），
  // locked 时固定 1.0。重构必须等价，保留这个微妙差异。
  const pitchBase = style.intensityLocked
    ? 1.0
    : 1.0 + (1.0 - snapshot.intensity) * 0.03 - snapshot.intensity * 0.02
  const keyChar = (((keycode * 2654435761) >>> 0) % 200 - 100) / 10000
  const pitchJitter = (Math.random() - 0.5) * style.pitchJitter * 2
  const pitch = pitchBase + keyChar + pitchJitter

  // volume 链：intensity × adaptive × ducking × jitter × press/release balance
  const duckFactor = activeVoices > 8 ? 0.8 / Math.sqrt(activeVoices - 7) : 1.0
  const intensityVol = 0.5 + volIntensity * 0.5
  const volSpan = style.volumeJitter * 2
  const microRandom = (1 - style.volumeJitter) + Math.random() * volSpan
  const balanceFactor = type === 'up' ? dbToGain(dsp.topDownBalanceDb) : 1
  const finalVol = intensityVol * snapshot.adaptiveMul * duckFactor * microRandom * balanceFactor

  // offsetJitter 0–2ms：切入点轻微随机 → transient 微形变化
  const offsetJitterSec = Math.random() * 0.002
  const durSec = Math.min((buffer.duration - offsetJitterSec) * dsp.decayScale, SAMPLER_MAX_DURATION_SEC)

  return {
    buffer,
    volume: finalVol,
    pitch,
    offsetJitterSec,
    durationSec: durSec,
  }
}
