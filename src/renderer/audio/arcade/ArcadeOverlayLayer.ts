import { generateKick } from './synth/kick.ts'
import { generateHat } from './synth/hat.ts'
import { generateClap } from './synth/clap.ts'
import { generateSwell } from './synth/swell.ts'
import {
  ComboState,
  createComboState,
  recordKeydown,
  checkPerfect,
  getStage,
  resetComboState,
  ComboStage,
} from './combo.ts'

const OVERLAY_POOL_SIZE = 12
const OVERLAY_MASTER_GAIN_DB = -6
const LAYER_GAIN_DB = {
  kick:  -15,
  clap:  -12,
  hat:   -18,
  swell: -20,
}
const LAYER_FADE_IN_MS = {
  kick:  300,
  clap:  300,
  hat:   400,
  swell: 1000,
}
const SWELL_FADE_OUT_MS = 500

export interface OverlayCallbacks {
  onStageChange?: (stage: ComboStage, combo: number) => void
  onPerfect?: () => void
  onReset?: () => void
}

interface OverlayVoice {
  gain: GainNode
  source: AudioBufferSourceNode | null
  busy: boolean
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

export class ArcadeOverlayLayer {
  private ctx: AudioContext | null = null
  private overlayBus: GainNode | null = null
  private kickBuf: AudioBuffer | null = null
  private hatBuf: AudioBuffer | null = null
  private clapBuf: AudioBuffer | null = null
  private swellBuf: AudioBuffer | null = null
  private pool: OverlayVoice[] = []
  private comboState: ComboState = createComboState()
  private swellSource: AudioBufferSourceNode | null = null
  private swellGain: GainNode | null = null
  private activeLayers = { kick: false, clap: false, hat: false, swell: false }
  private callbacks: OverlayCallbacks = {}
  private activated = false

  async activate(ctx: AudioContext, callbacks: OverlayCallbacks = {}): Promise<void> {
    if (this.activated) return
    this.ctx = ctx
    this.callbacks = callbacks

    this.overlayBus = ctx.createGain()
    this.overlayBus.gain.value = dbToGain(OVERLAY_MASTER_GAIN_DB)
    this.overlayBus.connect(ctx.destination)

    for (let i = 0; i < OVERLAY_POOL_SIZE; i++) {
      const g = ctx.createGain()
      g.connect(this.overlayBus)
      this.pool.push({ gain: g, source: null, busy: false })
    }

    const [kick, hat, clap, swell] = await Promise.all([
      generateKick(),
      generateHat(),
      generateClap(),
      generateSwell(),
    ])
    this.kickBuf = kick
    this.hatBuf = hat
    this.clapBuf = clap
    this.swellBuf = swell

    this.comboState = createComboState()
    this.activated = true
    console.log('[Arcade] overlay activated, pool=', OVERLAY_POOL_SIZE)
  }

  deactivate(): void {
    if (!this.activated || !this.ctx) return
    for (const slot of this.pool) {
      if (slot.source) {
        try { slot.source.stop(); slot.source.disconnect() } catch {}
        slot.source = null
        slot.busy = false
      }
    }
    this.stopSwell(0)
    if (this.overlayBus) {
      try { this.overlayBus.disconnect() } catch {}
      this.overlayBus = null
    }
    this.pool = []
    this.kickBuf = null
    this.hatBuf = null
    this.clapBuf = null
    this.swellBuf = null
    resetComboState(this.comboState)
    this.activeLayers = { kick: false, clap: false, hat: false, swell: false }
    this.activated = false
    console.log('[Arcade] overlay deactivated')
  }

  /**
   * Called from AudioEngine.playSound() 'down' branch only. `playTime` must be
   * the same value used to schedule the main switch sound — guarantees zero
   * perceived latency vs the axis click.
   */
  onKeydown(nowMs: number, playTime: number): void {
    if (!this.activated || !this.ctx) return
    const prevStage = getStage(this.comboState.combo)
    recordKeydown(this.comboState, nowMs)
    const stage = getStage(this.comboState.combo)

    this.triggerLayers(stage, playTime)

    if (stage !== prevStage) {
      this.callbacks.onStageChange?.(stage, this.comboState.combo)
    }

    if (checkPerfect(this.comboState, nowMs)) {
      this.callbacks.onPerfect?.()
    }
  }

  /**
   * Hold-repeat events (keyboard flag=2) — never called by AudioEngine
   * because the 'repeat' branch early-returns, but kept as explicit API.
   */
  onRepeat(_nowMs: number): void {
    // no-op
  }

  onReset(): void {
    resetComboState(this.comboState)
    this.stopAllPerPressLayers()
    this.stopSwell(SWELL_FADE_OUT_MS / 1000)
    this.activeLayers = { kick: false, clap: false, hat: false, swell: false }
    this.callbacks.onReset?.()
  }

  private triggerLayers(stage: ComboStage, playTime: number): void {
    if (!this.ctx) return
    const shouldHave = {
      kick:  stage !== 'idle',
      clap:  stage === 'stacking' || stage === 'flow' || stage === 'zone',
      hat:   stage === 'flow' || stage === 'zone',
      swell: stage === 'zone',
    }

    if (shouldHave.kick && this.kickBuf)
      this.playVoice(this.kickBuf, playTime, LAYER_GAIN_DB.kick, LAYER_FADE_IN_MS.kick, 'kick')
    if (shouldHave.clap && this.clapBuf)
      this.playVoice(this.clapBuf, playTime, LAYER_GAIN_DB.clap, LAYER_FADE_IN_MS.clap, 'clap')
    if (shouldHave.hat && this.hatBuf)
      this.playVoice(this.hatBuf, playTime, LAYER_GAIN_DB.hat, LAYER_FADE_IN_MS.hat, 'hat')

    if (shouldHave.swell && !this.activeLayers.swell) this.startSwell(playTime)
    if (!shouldHave.swell && this.activeLayers.swell) this.stopSwell(SWELL_FADE_OUT_MS / 1000)

    this.activeLayers = shouldHave
  }

  private playVoice(
    buf: AudioBuffer,
    playTime: number,
    gainDb: number,
    firstTimeFadeInMs: number,
    layer: 'kick' | 'clap' | 'hat',
  ): void {
    if (!this.ctx) return
    const slot = this.acquireSlot()
    const src = this.ctx.createBufferSource()
    src.buffer = buf

    const targetGain = dbToGain(gainDb)
    const fadeIn = this.activeLayers[layer] ? 0 : firstTimeFadeInMs / 1000
    if (fadeIn > 0) {
      slot.gain.gain.setValueAtTime(0, playTime)
      slot.gain.gain.linearRampToValueAtTime(targetGain, playTime + fadeIn)
    } else {
      slot.gain.gain.setValueAtTime(targetGain, playTime)
    }

    src.connect(slot.gain)
    slot.source = src

    const dur = buf.duration
    slot.gain.gain.setValueAtTime(targetGain, playTime + Math.max(0, dur - 0.005))
    slot.gain.gain.linearRampToValueAtTime(0, playTime + dur)

    src.start(playTime)
    src.stop(playTime + dur)
    src.onended = () => this.releaseSlot(slot)
  }

  private startSwell(playTime: number): void {
    if (!this.ctx || !this.swellBuf || !this.overlayBus) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.swellBuf
    src.loop = true

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, playTime)
    gain.gain.linearRampToValueAtTime(dbToGain(LAYER_GAIN_DB.swell), playTime + LAYER_FADE_IN_MS.swell / 1000)

    src.connect(gain)
    gain.connect(this.overlayBus)
    src.start(playTime)

    this.swellSource = src
    this.swellGain = gain
  }

  private stopSwell(fadeOutS: number): void {
    if (!this.ctx || !this.swellSource || !this.swellGain) return
    const now = this.ctx.currentTime
    const endTime = now + fadeOutS
    this.swellGain.gain.cancelScheduledValues(now)
    this.swellGain.gain.setValueAtTime(this.swellGain.gain.value, now)
    this.swellGain.gain.linearRampToValueAtTime(0, endTime)
    try { this.swellSource.stop(endTime + 0.01) } catch {}
    const s = this.swellSource
    const g = this.swellGain
    this.swellSource = null
    this.swellGain = null
    setTimeout(() => {
      try { s.disconnect() } catch {}
      try { g.disconnect() } catch {}
    }, fadeOutS * 1000 + 50)
  }

  private stopAllPerPressLayers(): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const slot of this.pool) {
      if (slot.source) {
        try {
          slot.gain.gain.cancelScheduledValues(now)
          slot.gain.gain.setValueAtTime(slot.gain.gain.value, now)
          slot.gain.gain.linearRampToValueAtTime(0, now + 0.008)
          slot.source.stop(now + 0.008)
        } catch {}
        slot.source = null
        slot.busy = false
      }
    }
  }

  private acquireSlot(): OverlayVoice {
    for (const s of this.pool) if (!s.busy) { s.busy = true; return s }
    const stolen = this.pool[0]
    if (stolen.source && this.ctx) {
      const now = this.ctx.currentTime
      try {
        stolen.gain.gain.setValueAtTime(stolen.gain.gain.value, now)
        stolen.gain.gain.linearRampToValueAtTime(0, now + 0.008)
        stolen.source.stop(now + 0.008)
      } catch {}
    }
    stolen.busy = true
    return stolen
  }

  private releaseSlot(slot: OverlayVoice): void {
    if (slot.source) { try { slot.source.disconnect() } catch {} slot.source = null }
    slot.busy = false
  }
}
