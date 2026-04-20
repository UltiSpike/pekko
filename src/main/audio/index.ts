// AudioCoreService — 主进程音频子系统的对外门面。
//
// 职责：编排 AudioBackend / AudioGraph / SoundPackStore / TypingAnalytics / KeySampler
// / Lifecycle。外界（main/index.ts、IPC handlers）只依赖这个类。
//
// 契约：
// - onKey 在 Lifecycle 非 Ready 状态下直接 drop，不触发恢复（恢复由 pause/resume/
//   manualRetry 驱动；键事件不做反射弧）
// - pause/resume 按 spec §5.4 的"每次 wake 强制 close→open"——不信任 resume 能活
// - setEnabled 只调 masterGain=0，不改 Lifecycle（unmute 零代价）
//
// PR-2 阶段：combo 状态机 (Task 4.1) 和 DSP filter ramp (Task 4.2) 尚未接入。
// setMode / applySwitchDsp 只记状态不真正作用到音色上。

import { EventEmitter } from 'node:events'
import type { AudioBackend, BackendPlayParams, DecodedAudio } from './bindings/types.ts'
import { AudioGraph } from './AudioGraph.ts'
import { Lifecycle, type LifecycleState, type SuspendReason } from './Lifecycle.ts'
import { SoundPackStore, type SpriteSlice } from './SoundPackStore.ts'
import { TypingAnalytics } from '../../shared/audio/TypingAnalytics.ts'
import { pickKeySound, type PickState, type KeyBuffer } from '../../shared/audio/KeySampler.ts'
import {
  getMode,
  DEFAULT_MODE_ID,
  DEFAULT_SWITCH_DSP,
  type Mode,
  type SwitchDsp,
} from '../../shared/modes.ts'

export type AudioHealth =
  | { phase: 'cold' }
  | { phase: 'booting' }
  | { phase: 'ready'; enabled: boolean; activeProfile: string }
  | { phase: 'suspended'; reason: SuspendReason }
  | { phase: 'recovering'; attempt: number }
  | { phase: 'failed'; reason: string; canRetry: boolean }
  | { phase: 'shutdown' }

export type PackSource =
  | { kind: 'sprite'; config: { defines: Record<string, [number, number]> }; bytes: Uint8Array }
  | { kind: 'multi'; config: { defines: Record<string, string> }; files: Record<string, Uint8Array> }
  | { kind: 'kbsim'; files: Record<string, Uint8Array> }

export interface AudioCoreServiceOpts {
  backend: AudioBackend
}

// 解析 KeyBuffer 里藏着的真实 DecodedAudio + 可选 offsetSec
// SpriteSlice 有 .audio 字段，普通 DecodedAudio 没有
function resolvePlay(buffer: KeyBuffer): { audio: DecodedAudio; offsetSec: number } {
  const b = buffer as Partial<SpriteSlice> & Partial<DecodedAudio>
  if (b.audio && typeof b.offsetSec === 'number') {
    return { audio: b.audio, offsetSec: b.offsetSec }
  }
  return { audio: buffer as unknown as DecodedAudio, offsetSec: 0 }
}

export class AudioCoreService extends EventEmitter {
  private backend: AudioBackend
  private graph: AudioGraph
  private store: SoundPackStore
  private lifecycle = new Lifecycle()
  private analytics = new TypingAnalytics()
  private pickState: PickState = {}

  private currentMode: Mode = getMode(DEFAULT_MODE_ID)
  private currentDsp: SwitchDsp = { ...DEFAULT_SWITCH_DSP }
  private activeProfile = ''
  private _enabled = true
  private baseVolume = 1.0
  private activeVoices = 0

  constructor(opts: AudioCoreServiceOpts) {
    super()
    this.backend = opts.backend
    this.graph = new AudioGraph(this.backend)
    this.store = new SoundPackStore(this.backend)
    this.lifecycle.on('state-change', () => this.emit('health-change', this.getState()))
  }

  // --- 生命周期 ---

  async start(): Promise<void> {
    if (this.lifecycle.state !== 'Cold') return
    this.lifecycle.transition('start')
    try {
      await this.graph.init()
      this.lifecycle.transition('boot-ok')
    } catch (err) {
      this.lifecycle.transition('boot-fail', { reason: String(err) })
    }
  }

  async pause(reason: SuspendReason = 'manual'): Promise<void> {
    if (this.lifecycle.state !== 'Ready') return
    this.lifecycle.transition('suspend', { reason })
    await this.graph.teardown()
  }

  async resume(): Promise<void> {
    const s = this.lifecycle.state
    if (s !== 'Suspended' && s !== 'Failed') return
    if (s === 'Failed') this.lifecycle.transition('manual-retry')
    else this.lifecycle.transition('wake')

    // 每次 wake 强制 close→open（backend 已在 pause 时 close）+ retry backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.graph.init()
        this.lifecycle.transition('recover-ok')
        return
      } catch (err) {
        this.lifecycle.transition('recover-fail', { reason: String(err) })
        if (this.lifecycle.state === 'Failed') return
        await new Promise(r => setTimeout(r, 250))
      }
    }
  }

  async manualRetry(): Promise<void> {
    if (this.lifecycle.state !== 'Failed') return
    await this.resume()
  }

  async stop(): Promise<void> {
    if (this.lifecycle.state === 'Shutdown') return
    try {
      this.lifecycle.transition('shutdown')
    } catch {
      // 已在 Shutdown
    }
    await this.graph.teardown()
  }

  // --- 配置 ---

  setVolume(v: number): void {
    this.baseVolume = Math.max(0, Math.min(1, v))
    this.graph.setMasterGain(this._enabled ? this.baseVolume : 0)
  }

  setEnabled(v: boolean): void {
    this._enabled = v
    this.graph.setMasterGain(v ? this.baseVolume : 0)
    this.emit('health-change', this.getState())
  }

  setMode(modeIdOrMode: string | Mode): void {
    this.currentMode = typeof modeIdOrMode === 'string' ? getMode(modeIdOrMode) : modeIdOrMode
    this.analytics.setArcadeEnabled(this.currentMode.arcadeEnabled)
    // DSP filter ramp 由后续 PR 接入——此处仅记录状态
    this.emit('health-change', this.getState())
  }

  applySwitchDsp(dsp: SwitchDsp): void {
    this.currentDsp = dsp
    // 同 setMode：DSP filter ramp 是后续 PR 的工作
  }

  async setProfile(profileId: string, source: PackSource): Promise<boolean> {
    if (this.lifecycle.state !== 'Ready' && this.lifecycle.state !== 'Suspended') return false
    if (this.store.has(profileId)) {
      this.activeProfile = profileId
      return true
    }
    try {
      if (source.kind === 'sprite') await this.store.loadSprite(profileId, source.bytes, source.config)
      else if (source.kind === 'multi') await this.store.loadMulti(profileId, source.config, source.files)
      else if (source.kind === 'kbsim') await this.store.loadKbsim(profileId, source.files)
      this.activeProfile = profileId
      this.emit('health-change', this.getState())
      return true
    } catch (err) {
      console.error('[AudioCore] setProfile failed:', err)
      return false
    }
  }

  // --- 键事件入口 ---

  onKey(keycode: number, type: 'down' | 'up' | 'repeat', tsMs: number): void {
    if (this.lifecycle.state !== 'Ready') return
    if (!this._enabled) return

    const pack = this.store.get(this.activeProfile)
    if (!pack) return

    this.analytics.recordKey(tsMs, keycode, type)
    const snapshot = this.analytics.snapshot()

    const picked = pickKeySound(
      pack,
      keycode,
      type,
      snapshot,
      this.currentMode.style,
      this.currentDsp,
      this.activeVoices,
      this.pickState,
    )
    if (!picked) return

    const { audio, offsetSec } = resolvePlay(picked.buffer)
    const params: BackendPlayParams = {
      volume: picked.volume,
      pitch: picked.pitch,
      pan: picked.pan, // TODO(PR-2): KeySampler 目前 pan 返回 0；需要在 onKey 里调 getKeyPan(keycode)
      durationSec: picked.durationSec,
      offsetSec: offsetSec + picked.offsetJitterSec,
    }

    this.activeVoices++
    this.graph.playBuffer(audio, params)
    // 按声音时长衰减计数；不精准但对 duck factor 够用
    setTimeout(() => {
      this.activeVoices = Math.max(0, this.activeVoices - 1)
    }, picked.durationSec * 1000)
  }

  // --- 查询 ---

  getState(): AudioHealth {
    const s: LifecycleState = this.lifecycle.state
    switch (s) {
      case 'Cold': return { phase: 'cold' }
      case 'Booting': return { phase: 'booting' }
      case 'Ready': return { phase: 'ready', enabled: this._enabled, activeProfile: this.activeProfile }
      case 'Suspended': return { phase: 'suspended', reason: this.lifecycle.suspendReason ?? 'manual' }
      case 'Recovering': return { phase: 'recovering', attempt: this.lifecycle.recoverAttempt }
      case 'Failed': return { phase: 'failed', reason: this.lifecycle.failureReason ?? 'unknown', canRetry: true }
      case 'Shutdown': return { phase: 'shutdown' }
    }
  }

  get wpm(): number { return this.analytics.snapshot().wpm }
  get typingActive(): boolean { return this.analytics.snapshot().typingActive }
  get mode(): Mode { return this.currentMode }
}
