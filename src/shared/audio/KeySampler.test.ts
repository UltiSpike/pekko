import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pickKeySound,
  type SamplerPack,
  type SpritePack,
  type MultiPack,
  type KeyBuffer,
  type PickState,
} from './KeySampler.ts'
import type { TypingSnapshot } from './TypingAnalytics.ts'

const buf = (tag: string, duration = 0.1): KeyBuffer => ({ tag, duration } as any)

const snapshot: TypingSnapshot = {
  intensity: 0.7,
  adaptiveMul: 1.0,
  wpm: 60,
  typingActive: true,
}

const style = {
  intensityLocked: false,
  pitchJitter: 0.0, // 0 让 pitch 可预测
  volumeJitter: 0.0, // 0 让 volume 可预测
}

const styleLocked = { ...style, intensityLocked: true }

const dsp = {
  topDownBalanceDb: 0,
  decayScale: 1.0,
}

const spritePack = (keys: Map<number, { down?: KeyBuffer; up?: KeyBuffer }>, fd?: KeyBuffer | null, fu?: KeyBuffer | null): SpritePack => ({
  type: 'sprite',
  keys,
  fallbackDown: fd ?? null,
  fallbackUp: fu ?? null,
})

test('sprite pack 命中 keycode 返回对应 down buffer', () => {
  const b = buf('A-down')
  const pack = spritePack(new Map([[30, { down: b }]]))
  const r = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  assert.equal((r!.buffer as any).tag, 'A-down')
})

test('sprite pack 未命中 keycode 回退到 fallback', () => {
  const pack = spritePack(new Map(), buf('fb-d'), buf('fb-u'))
  const r = pickKeySound(pack, 99, 'down', snapshot, style, dsp, 0)
  assert.equal((r!.buffer as any).tag, 'fb-d')
})

test('sprite pack 无 buffer 且无 fallback 返回 null', () => {
  const pack = spritePack(new Map())
  const r = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  assert.equal(r, null)
})

test('up 事件回退到 fallbackUp', () => {
  const pack = spritePack(new Map(), buf('fb-d'), buf('fb-u'))
  const r = pickKeySound(pack, 99, 'up', snapshot, style, dsp, 0)
  assert.equal((r!.buffer as any).tag, 'fb-u')
})

test('duck factor：activeVoices > 8 开始降音量', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  const r0 = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  const r12 = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 12)
  assert.ok(r12!.volume < r0!.volume, `r12.volume=${r12!.volume} r0.volume=${r0!.volume}`)
})

test('activeVoices = 8 刚好不触发 duck', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  const r8 = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 8)
  const r0 = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  assert.ok(Math.abs(r8!.volume - r0!.volume) < 1e-9, `${r8!.volume} vs ${r0!.volume}`)
})

test('intensityLocked 模式 volume 用固定 0.7', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  // locked: volIntensity = 0.7 → intensityVol = 0.85
  const locked = pickKeySound(pack, 30, 'down', snapshot, styleLocked, dsp, 0)
  // unlocked + snapshot.intensity=0.7: same value but via different code path
  const unlocked = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  // 两条路径在 snapshot.intensity=0.7 时数值应相同（都是 0.85）
  assert.ok(Math.abs(locked!.volume - unlocked!.volume) < 1e-9)
})

test('intensityLocked 模式 pitch 固定基线 1.0（仅 keyChar 偏移）', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  const r = pickKeySound(pack, 30, 'down', snapshot, styleLocked, dsp, 0)
  // pitchJitter=0, 所以只有 keyChar 成分；keyChar ∈ [-0.01, 0.01]
  assert.ok(Math.abs(r!.pitch - 1.0) < 0.015, `pitch=${r!.pitch}`)
})

test('unlocked 模式 pitch 随 intensity 变化（低 intensity → 略高 pitch）', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  const lowI = pickKeySound(pack, 30, 'down', { ...snapshot, intensity: 0.3 }, style, dsp, 0)
  const highI = pickKeySound(pack, 30, 'down', { ...snapshot, intensity: 1.0 }, style, dsp, 0)
  // pitchBase(0.3) = 1.0 + 0.7*0.03 - 0.3*0.02 = 1.015
  // pitchBase(1.0) = 1.0 + 0 - 0.02 = 0.98
  // 扣掉相同 keyChar，相差 ~0.035
  assert.ok(lowI!.pitch > highI!.pitch, `low=${lowI!.pitch} high=${highI!.pitch}`)
})

test('repeat 路径 volume 固定 0.75 * adaptiveMul，pitch 1.0，无 offset jitter', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  const r = pickKeySound(pack, 30, 'repeat', snapshot, style, dsp, 0)
  assert.equal(r!.volume, 0.75)
  assert.equal(r!.pitch, 1.0)
  assert.equal(r!.offsetJitterSec, 0)
})

test('repeat 路径忽略 activeVoices duck 和 volumeJitter', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  const r = pickKeySound(pack, 30, 'repeat', snapshot, { ...style, volumeJitter: 0.2 }, dsp, 20)
  assert.equal(r!.volume, 0.75) // 稳定
})

test('up 事件应用 topDownBalanceDb (dB→gain)', () => {
  const pack = spritePack(new Map([[30, { down: buf('d'), up: buf('u') }]]))
  const zero = pickKeySound(pack, 30, 'up', snapshot, style, { ...dsp, topDownBalanceDb: 0 }, 0)
  const lift = pickKeySound(pack, 30, 'up', snapshot, style, { ...dsp, topDownBalanceDb: 6 }, 0)
  // 6dB → 2x gain；up 也要 keyIntensity 映射，这里两次都没先 down 所以值用默认 0.7
  assert.ok(lift!.volume > zero!.volume)
  assert.ok(lift!.volume / zero!.volume > 1.5, `ratio=${lift!.volume / zero!.volume}`)
})

test('down → up 强度关联：heavy down 导致 quiet up', () => {
  const pack = spritePack(
    new Map([
      [30, { down: buf('d30'), up: buf('u30') }],
      [31, { down: buf('d31'), up: buf('u31') }],
    ]),
    buf('fd'),
    buf('fu'),
  )
  const state: PickState = {}
  // heavy down (intensity=1.0) 然后 up
  pickKeySound(pack, 30, 'down', { ...snapshot, intensity: 1.0 }, style, dsp, 0, state)
  const heavyUp = pickKeySound(pack, 30, 'up', snapshot, style, dsp, 0, state)
  // light down (intensity=0.3) 然后 up
  pickKeySound(pack, 31, 'down', { ...snapshot, intensity: 0.3 }, style, dsp, 0, state)
  const lightUp = pickKeySound(pack, 31, 'up', snapshot, style, dsp, 0, state)
  assert.ok(lightUp!.volume > heavyUp!.volume, `heavy-up=${heavyUp!.volume} light-up=${lightUp!.volume}`)
})

test('multi pack SPACE (57) 命中 special', () => {
  const pack: MultiPack = {
    type: 'multi',
    data: {
      press: {
        generic: [buf('g1'), buf('g2')],
        special: { SPACE: buf('space-d') },
      },
      release: { generic: buf('g-up'), special: {} },
    },
  }
  const r = pickKeySound(pack, 57, 'down', snapshot, style, dsp, 0)
  assert.equal((r!.buffer as any).tag, 'space-d')
})

test('multi pack keydown 无 special 回退到 generic 变体', () => {
  const pack: MultiPack = {
    type: 'multi',
    data: {
      press: { generic: [buf('g1'), buf('g2')], special: {} },
      release: { generic: null, special: {} },
    },
  }
  const r = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  assert.ok(['g1', 'g2'].includes((r!.buffer as any).tag))
})

test('multi pack 空 generic 返回 null', () => {
  const pack: MultiPack = {
    type: 'multi',
    data: {
      press: { generic: [], special: {} },
      release: { generic: null, special: {} },
    },
  }
  const r = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  assert.equal(r, null)
})

test('multi pack 同一 PickState 连续轮选不重复', () => {
  const pack: MultiPack = {
    type: 'multi',
    data: {
      press: { generic: [buf('g1'), buf('g2'), buf('g3')], special: {} },
      release: { generic: null, special: {} },
    },
  }
  const state: PickState = {}
  const picks: string[] = []
  for (let i = 0; i < 20; i++) {
    const r = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0, state)
    picks.push((r!.buffer as any).tag)
  }
  // 相邻不重复
  for (let i = 1; i < picks.length; i++) {
    assert.notEqual(picks[i], picks[i - 1], `position ${i} repeated: ${picks[i]}`)
  }
})

test('decayScale 拉伸 durationSec，被 MAX 封顶', () => {
  const pack = spritePack(new Map([[30, { down: buf('x', 0.3) }]]))
  const shortR = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  const longR = pickKeySound(pack, 30, 'down', snapshot, style, { ...dsp, decayScale: 2.0 }, 0)
  assert.ok(longR!.durationSec > shortR!.durationSec)
  // 封顶
  const capped = pickKeySound(pack, 30, 'down', snapshot, style, { ...dsp, decayScale: 10.0 }, 0)
  assert.ok(capped!.durationSec <= 0.4001)
})

test('offsetJitterSec 在 [0, 0.002] 范围内，repeat 路径为 0', () => {
  const pack = spritePack(new Map([[30, { down: buf('x') }]]))
  const down = pickKeySound(pack, 30, 'down', snapshot, style, dsp, 0)
  assert.ok(down!.offsetJitterSec >= 0 && down!.offsetJitterSec <= 0.002)
  const rpt = pickKeySound(pack, 30, 'repeat', snapshot, style, dsp, 0)
  assert.equal(rpt!.offsetJitterSec, 0)
})
