import { getKeyPan } from '@shared/key-positions'
import { Mode, ModeStyle, getMode, DEFAULT_MODE_ID, SwitchDsp, DEFAULT_SWITCH_DSP, dbToGain } from '@shared/modes'
import { ArcadeOverlayLayer } from './arcade/ArcadeOverlayLayer.ts'
import { ArcadeHudController } from './arcade/ArcadeHudController.ts'

interface SpriteKeySound { down?: AudioBuffer; up?: AudioBuffer }
interface MultiPack {
  press: { generic: AudioBuffer[]; special: Record<string, AudioBuffer> }
  release: { generic: AudioBuffer | null; special: Record<string, AudioBuffer> }
}
type LoadedPack =
  | { type: 'sprite'; keys: Map<number, SpriteKeySound>; fallbackDown: AudioBuffer | null; fallbackUp: AudioBuffer | null }
  | { type: 'multi'; data: MultiPack }

interface VoiceSlot {
  gain: GainNode; panner: StereoPannerNode; source: AudioBufferSourceNode | null; busy: boolean
}

const POOL_SIZE = 24
const FADE_MS = 0.008
const MAX_DUR = 0.40
const SCHEDULE_OFFSET = 0.002 // #2: 2ms fixed scheduling offset — jitter-safe at modern latencyHint='interactive'
const SPECIAL_KEYS: Record<number, string> = { 14: 'BACKSPACE', 28: 'ENTER', 41: 'ENTER', 57: 'SPACE' }

export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private packs: Map<string, LoadedPack> = new Map()
  private activeProfile = ''
  private lastVariant = -1
  private pool: VoiceSlot[] = []
  private activeVoices = 0

  private overlayLayer = new ArcadeOverlayLayer()
  private hudController = new ArcadeHudController()

  // #3: Typing intensity model
  private lastKeyTime = 0
  private typingIntensity = 0.7  // 0.3 (gentle) → 1.0 (forceful)
  private keyIntensityMap = new Map<number, number>() // keycode → keydown intensity for keyup correlation

  // Filter / mix refs — style morph changes these per-mode
  private airLPF: BiquadFilterNode | null = null
  private highShelf: BiquadFilterNode | null = null
  private lowShelf: BiquadFilterNode | null = null
  private wetGain: GainNode | null = null

  // Per-switch DSP nodes — ramped on profile change
  private bodyPeak: BiquadFilterNode | null = null      // peaking, freq+gain controlled
  private springNotch: BiquadFilterNode | null = null   // peaking @2.5kHz Q=4, gain controlled
  private transient: BiquadFilterNode | null = null     // highshelf @5kHz, gain controlled

  // Current mode & style — read on every playSound
  private currentMode: Mode = getMode(DEFAULT_MODE_ID)
  private get style(): ModeStyle { return this.currentMode.style }

  // Current switch DSP — applied when profile loads. topDownBalance & decayScale read in playSound.
  private currentDsp: SwitchDsp = { ...DEFAULT_SWITCH_DSP }

  // #5: Adaptive volume decay
  private baseVolume = 1.0         // user-set volume
  private adaptiveMultiplier = 1.0 // decays during sustained typing
  private typingStartTime = 0
  private lastAdaptiveUpdate = 0
  private adaptiveTimer: ReturnType<typeof setTimeout> | null = null

  // WPM tracking (keydown timestamps from last 5 seconds)
  private keyTimestamps: number[] = []
  private _wpm = 0
  private _typingActive = false
  private typingTimeout: ReturnType<typeof setTimeout> | null = null

  async init(): Promise<void> {
    if (this.ctx) return
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 })

    // === Psychoacoustic audio chain ===
    // dest ← compressor(atk=35ms) ← airLPF(13k) ← highShelf(9k) ← midScoop(3.8k) ← lowShelf(180) ← [dry + deskLPF wet] ← master

    this.compressor = this.ctx.createDynamicsCompressor()
    this.compressor.threshold.value = -18; this.compressor.knee.value = 12
    this.compressor.ratio.value = 2.5; this.compressor.attack.value = 0.035; this.compressor.release.value = 0.2
    this.compressor.connect(this.ctx.destination)

    // High shelf: mode-controlled, default +0.5dB at 9kHz
    const highShelf = this.ctx.createBiquadFilter()
    highShelf.type = 'highshelf'
    highShelf.frequency.value = 9000
    highShelf.gain.value = this.style.highShelfDb
    this.highShelf = highShelf

    // Air LPF: mode-controlled, default 13kHz (Classic) / 8kHz (Focus)
    const airLPF = this.ctx.createBiquadFilter()
    airLPF.type = 'lowpass'
    airLPF.frequency.value = this.style.airLpfHz
    airLPF.Q.value = 0.5
    this.airLPF = airLPF
    highShelf.connect(airLPF)
    airLPF.connect(this.compressor)

    // Mid scoop: -3dB at 3.8kHz Q=1.5 — targets ear canal resonance harshness (3.5-5kHz)
    const midScoop = this.ctx.createBiquadFilter()
    midScoop.type = 'peaking'
    midScoop.frequency.value = 3800
    midScoop.Q.value = 1.5
    midScoop.gain.value = -3
    midScoop.connect(highShelf)

    // Low shelf: mode-controlled, default +2.5dB below 180Hz. Thock pushes this to +6dB for heavy bottom.
    const lowShelf = this.ctx.createBiquadFilter()
    lowShelf.type = 'lowshelf'
    lowShelf.frequency.value = 180
    lowShelf.gain.value = this.style.lowShelfDb
    this.lowShelf = lowShelf
    lowShelf.connect(midScoop)

    // Dry/wet desk reflection
    const dryGain = this.ctx.createGain()
    dryGain.gain.value = 0.88
    dryGain.connect(lowShelf)

    const delay = this.ctx.createDelay(0.1)
    delay.delayTime.value = 0.004
    // Desk surface LPF: wood/plastic absorbs >3.5kHz — warm reflection
    const deskLPF = this.ctx.createBiquadFilter()
    deskLPF.type = 'lowpass'
    deskLPF.frequency.value = 3500
    deskLPF.Q.value = 0.7
    const wetGain = this.ctx.createGain()
    wetGain.gain.value = this.style.wetMix
    this.wetGain = wetGain
    delay.connect(deskLPF)
    deskLPF.connect(wetGain)
    wetGain.connect(lowShelf)

    // === Per-switch DSP chain ===
    // Inserted post-masterGain, pre-(dry+wet split). Default values are neutral
    // (0 dB) so an unloaded profile sounds identical to before this change.
    const transient = this.ctx.createBiquadFilter()
    transient.type = 'highshelf'
    transient.frequency.value = 5000
    transient.gain.value = this.currentDsp.transientDb
    this.transient = transient
    transient.connect(dryGain)
    transient.connect(delay)

    const springNotch = this.ctx.createBiquadFilter()
    springNotch.type = 'peaking'
    springNotch.frequency.value = 2500
    springNotch.Q.value = 4
    springNotch.gain.value = this.currentDsp.springNotchDb
    this.springNotch = springNotch
    springNotch.connect(transient)

    const bodyPeak = this.ctx.createBiquadFilter()
    bodyPeak.type = 'peaking'
    bodyPeak.frequency.value = this.currentDsp.bodyPeakHz
    bodyPeak.Q.value = this.currentDsp.bodyPeakQ
    bodyPeak.gain.value = this.currentDsp.bodyPeakDb
    this.bodyPeak = bodyPeak
    bodyPeak.connect(springNotch)

    this.masterGain = this.ctx.createGain()
    this.masterGain.connect(bodyPeak)

    this.initPool()
    this.keepAlive()

    // Latency telemetry — useful when users report "slower"
    const baseMs = ((this.ctx.baseLatency ?? 0) * 1000).toFixed(1)
    const outMs = ((this.ctx.outputLatency ?? 0) * 1000).toFixed(1)
    console.log(`[Audio] init: mode-driven engine · baseLatency=${baseMs}ms outputLatency=${outMs}ms schedOffset=${SCHEDULE_OFFSET * 1000}ms`)
  }

  // === Per-switch DSP — applies the switch's character (body / spring / transient).
  // Ramps over 250ms so profile switches don't click. topDown & decay are read live in playSound.
  applySwitchDsp(dsp: SwitchDsp) {
    this.currentDsp = dsp
    if (!this.ctx || !this.bodyPeak || !this.springNotch || !this.transient) return
    const now = this.ctx.currentTime
    const rampEnd = now + 0.25
    const ramp = (p: AudioParam, target: number) => {
      p.cancelScheduledValues(now)
      p.setValueAtTime(p.value, now)
      p.linearRampToValueAtTime(target, rampEnd)
    }
    // bodyPeak Hz/Q would zipper if ramped while a voice is mid-flight; setTargetAtTime is smoother.
    this.bodyPeak.frequency.cancelScheduledValues(now)
    this.bodyPeak.frequency.setTargetAtTime(dsp.bodyPeakHz, now, 0.05)
    this.bodyPeak.Q.cancelScheduledValues(now)
    this.bodyPeak.Q.setTargetAtTime(dsp.bodyPeakQ, now, 0.05)
    ramp(this.bodyPeak.gain, dsp.bodyPeakDb)
    ramp(this.springNotch.gain, dsp.springNotchDb)
    ramp(this.transient.gain, dsp.transientDb)
  }

  // === Mode switching — applies style atomically (no bed) ===
  setMode(modeOrId: string | Mode) {
    const mode = typeof modeOrId === 'string' ? getMode(modeOrId) : modeOrId
    const prevArcade = this.currentMode.arcadeEnabled
    const prevModeId = this.currentMode.id
    this.currentMode = mode

    if (this.ctx && this.airLPF && this.highShelf && this.lowShelf && this.wetGain) {
      const now = this.ctx.currentTime
      const rampEnd = now + 0.3
      const rampParam = (p: AudioParam, target: number) => {
        p.cancelScheduledValues(now)
        p.setValueAtTime(p.value, now)
        p.linearRampToValueAtTime(target, rampEnd)
      }
      rampParam(this.airLPF.frequency, mode.style.airLpfHz)
      rampParam(this.highShelf.gain, mode.style.highShelfDb)
      rampParam(this.lowShelf.gain, mode.style.lowShelfDb)
      rampParam(this.wetGain.gain, mode.style.wetMix)
    }

    // Arcade overlay + HUD activation based on arcadeEnabled flip
    if (mode.arcadeEnabled && !prevArcade) {
      this.activateArcade()
    } else if (!mode.arcadeEnabled && prevArcade) {
      this.deactivateArcade()
    } else if (prevArcade && mode.arcadeEnabled && prevModeId !== mode.id) {
      // Same arcade=true, different mode — per spec §4 "Mode 切换即新会话".
      // Reset combo / per-press layers / swell so the new mode starts clean.
      this.overlayLayer.onReset()
    }

    console.log(`[Audio] mode=${mode.id} arcade=${mode.arcadeEnabled}`)
  }

  private async activateArcade(): Promise<void> {
    if (!this.ctx) return
    await this.overlayLayer.activate(this.ctx, {
      onStageChange: (stage, combo) => this.hudController.onStageChange(stage, combo),
      onPerfect:     () => this.hudController.onPerfect(),
      onReset:       () => this.hudController.onReset(),
    })
    this.hudController.activate()
  }

  private deactivateArcade(): void {
    this.overlayLayer.deactivate()
    this.hudController.deactivate()
  }

  // === #3: Typing intensity model ===
  private updateIntensity() {
    const now = performance.now()
    const interval = now - this.lastKeyTime
    this.lastKeyTime = now

    if (interval > 2000) {
      // Fresh start — neutral-warm, not a hammer blow
      this.typingIntensity = 0.80
    } else if (interval < 80) {
      // Very fast typing — light touch
      this.typingIntensity = Math.max(0.35, this.typingIntensity - 0.08)
    } else if (interval < 150) {
      // Normal fast typing
      this.typingIntensity = 0.5 + (interval - 80) / 140 * 0.3 // 0.5-0.8
    } else {
      // Slow/deliberate — heavier
      this.typingIntensity = Math.min(1.0, 0.7 + (interval - 150) / 500 * 0.3)
    }
  }

  // === #5: Adaptive volume — decays during sustained typing ===
  private updateAdaptiveVolume() {
    const now = performance.now()

    // Rush / Custom+arcade: fatigue decay is dropped per spec §7 (sprint mode).
    if (this.currentMode.arcadeEnabled) {
      this.adaptiveMultiplier = 1.0
      this.typingStartTime = 0
      this.lastAdaptiveUpdate = now
      return
    }

    if (now - this.lastKeyTime > 3000) {
      // Pause > 3 seconds — reset to full volume
      this.adaptiveMultiplier = 1.0
      this.typingStartTime = now
    } else if (this.typingStartTime === 0) {
      this.typingStartTime = now
    } else {
      const typingDuration = (now - this.typingStartTime) / 1000 // seconds

      if (typingDuration < 5) {
        // First 5 seconds: full volume (novelty phase)
        this.adaptiveMultiplier = 1.0
      } else if (typingDuration < 30) {
        // 5-30 seconds: gentle decay to 0.75
        this.adaptiveMultiplier = 1.0 - (typingDuration - 5) / 25 * 0.25
      } else {
        // 30+ seconds: stable at 0.65 (flow state)
        this.adaptiveMultiplier = Math.max(0.65, this.adaptiveMultiplier)
      }
    }

    this.lastAdaptiveUpdate = now
  }

  // === Voice pool ===
  private initPool() {
    for (let i = 0; i < POOL_SIZE; i++) {
      const gain = this.ctx!.createGain()
      const panner = new StereoPannerNode(this.ctx!, { pan: 0 })
      panner.connect(this.masterGain!); gain.connect(panner)
      this.pool.push({ gain, panner, source: null, busy: false })
    }
  }

  private acquireSlot(): VoiceSlot {
    for (const s of this.pool) if (!s.busy) { s.busy = true; this.activeVoices++; return s }
    const v = this.pool[0]; this.stealSlot(v); v.busy = true; return v
  }

  private stealSlot(slot: VoiceSlot) {
    if (slot.source && this.ctx) {
      try {
        const now = this.ctx.currentTime
        slot.gain.gain.setValueAtTime(slot.gain.gain.value, now)
        slot.gain.gain.linearRampToValueAtTime(0, now + FADE_MS)
        slot.source.stop(now + FADE_MS)
      } catch {}
      slot.source = null
    }
  }

  private releaseSlot(slot: VoiceSlot) {
    if (slot.source) { try { slot.source.disconnect() } catch {} slot.source = null }
    slot.busy = false; this.activeVoices = Math.max(0, this.activeVoices - 1)
  }

  private keepAlive() {
    const buf = this.ctx!.createBuffer(1, 1, 44100)
    const tick = () => { if (!this.ctx) return; const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.ctx.destination); s.start(); setTimeout(tick, 15000) }
    tick()
  }

  // === Decode / slice ===
  private async decodeData(data: Uint8Array | Record<string, number>): Promise<AudioBuffer | null> {
    try {
      let ab: ArrayBuffer
      if (data instanceof Uint8Array) ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      else { const v = Object.keys(data).sort((a, b) => +a - +b).map(k => (data as any)[k]); ab = new Uint8Array(v).buffer }
      return await this.ctx!.decodeAudioData(ab)
    } catch { return null }
  }

  private sliceBuffer(source: AudioBuffer, offsetMs: number, durationMs: number): AudioBuffer {
    const sr = source.sampleRate
    const start = Math.floor((offsetMs / 1000) * sr)
    const len = Math.floor((durationMs / 1000) * sr)
    const end = Math.min(start + len, source.length)
    const sliced = new AudioBuffer({ numberOfChannels: source.numberOfChannels, length: end - start, sampleRate: sr })
    for (let ch = 0; ch < source.numberOfChannels; ch++) sliced.copyToChannel(source.getChannelData(ch).subarray(start, end), ch)
    return sliced
  }

  private trimSilence(buf: AudioBuffer): AudioBuffer {
    const d = buf.getChannelData(0); const thr = 0.003; const lim = Math.min(2048, d.length)
    let s = 0; for (let i = 0; i < lim; i++) { if (Math.abs(d[i]) > thr) { s = Math.max(0, i - 10); break } }
    if (s === 0) return buf
    const n = buf.length - s
    const t = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: n, sampleRate: buf.sampleRate })
    for (let ch = 0; ch < buf.numberOfChannels; ch++) t.copyToChannel(buf.getChannelData(ch).subarray(s), ch)
    return t
  }

  // === Profile loading ===
  async loadProfile(profileId: string): Promise<void> {
    if (!this.ctx) await this.init()
    if (this.packs.has(profileId)) { this.activeProfile = profileId; return }

    const raw = await window.api.loadSoundPack(profileId)
    if (!raw) return

    const type = raw.config.key_define_type
    if (type === 'single' && raw.spriteData) await this.loadSpritePack(profileId, raw.config, raw.spriteData)
    else if (type === 'multi' && raw.files) await this.loadMultiFilePack(profileId, raw.config, raw.files)
    else if (type === 'kbsim' && raw.files) await this.loadKbsimPack(profileId, raw.files)

    this.activeProfile = profileId
  }

  private async loadSpritePack(id: string, config: any, spriteData: any) {
    const fullBuffer = await this.decodeData(spriteData)
    if (!fullBuffer) return

    const keys = new Map<number, SpriteKeySound>()
    const entries = Object.entries(config.defines as Record<string, [number, number]>)
    let fallbackDown: AudioBuffer | null = null, fallbackUp: AudioBuffer | null = null

    // Fallback from key 30 (A)
    for (const [key, [o, d]] of entries) {
      const kc = parseInt(key.replace('-up', ''))
      if (kc !== 30) continue
      const s = this.sliceBuffer(fullBuffer, o, d)
      if (key.endsWith('-up')) fallbackUp = s; else fallbackDown = s
    }

    const pack: LoadedPack = { type: 'sprite', keys, fallbackDown, fallbackUp }
    this.packs.set(id, pack)

    // Batch slice
    const BATCH = 30
    for (let i = 0; i < entries.length; i += BATCH) {
      for (const [key, [o, d]] of entries.slice(i, i + BATCH)) {
        const s = this.sliceBuffer(fullBuffer, o, d)
        const isUp = key.endsWith('-up')
        const kc = parseInt(isUp ? key.replace('-up', '') : key)
        if (!keys.has(kc)) keys.set(kc, {})
        if (isUp) keys.get(kc)!.up = s; else keys.get(kc)!.down = s
      }
      if (i + BATCH < entries.length) await new Promise(r => setTimeout(r, 0))
    }

    if (!fallbackDown) for (const [, v] of keys) { if (v.down) { fallbackDown = v.down; break } }
    if (!fallbackUp) for (const [, v] of keys) { if (v.up) { fallbackUp = v.up; break } }
    pack.fallbackDown = fallbackDown; pack.fallbackUp = fallbackUp
    console.log(`[Audio] ${id}: sprite ${keys.size} keys`)
  }

  private async loadMultiFilePack(id: string, config: any, files: Record<string, any>) {
    const keys = new Map<number, SpriteKeySound>()
    for (const [k, fn] of Object.entries(config.defines || {})) {
      const isUp = k.endsWith('-up')
      const kc = parseInt(isUp ? k.replace('-up', '') : k)
      const buf = files[fn as string] ? await this.decodeData(files[fn as string]) : null
      if (!buf) continue
      if (!keys.has(kc)) keys.set(kc, {})
      if (isUp) keys.get(kc)!.up = buf; else keys.get(kc)!.down = buf
    }
    let fd: AudioBuffer | null = null, fu: AudioBuffer | null = null
    for (const [, v] of keys) { if (v.down && !fd) fd = v.down; if (v.up && !fu) fu = v.up }
    this.packs.set(id, { type: 'sprite', keys, fallbackDown: fd, fallbackUp: fu })
    console.log(`[Audio] ${id}: multi ${keys.size} keys`)
  }

  private async loadKbsimPack(id: string, files: Record<string, any>) {
    const pack: MultiPack = { press: { generic: [], special: {} }, release: { generic: null, special: {} } }
    await Promise.all(Object.entries(files).map(async ([name, data]) => {
      const buf = await this.decodeData(data as any)
      if (!buf) return
      const trimmed = this.trimSilence(buf)
      if (name.startsWith('press/GENERIC_R')) pack.press.generic.push(trimmed)
      else if (name.startsWith('press/')) pack.press.special[name.replace('press/', '').replace(/\.\w+$/, '')] = trimmed
      else if (name.startsWith('release/GENERIC')) pack.release.generic = trimmed
      else if (name.startsWith('release/')) pack.release.special[name.replace('release/', '').replace(/\.\w+$/, '')] = trimmed
    }))
    this.packs.set(id, { type: 'multi', data: pack })
    console.log(`[Audio] ${id}: kbsim ${pack.press.generic.length} variants`)
  }

  // === Playback (all optimizations converge here) ===
  playSound(keycode: number, type: 'down' | 'up' | 'repeat'): void {
    if (!this._enabled || !this.ctx || !this.masterGain) return
    const pack = this.packs.get(this.activeProfile)
    if (!pack) return

    // Repeat path: OS auto-repeat for whitelisted keys (⌫ ⌦ ← → ↑ ↓). Plays
    // the down sound at fixed intensity 0.50 — deterministic "metronome tick"
    // that bypasses interval-based intensity, per-key history, WPM, jitter,
    // and per-switch top/down balance. Adaptive volume still applies so a
    // sustained hold gets quieter alongside other typing, and spatial pan is
    // preserved so arrow keys still land on their side.
    if (type === 'repeat') {
      let buffer: AudioBuffer | null | undefined
      if (pack.type === 'sprite') {
        buffer = pack.keys.get(keycode)?.down ?? pack.fallbackDown
      } else {
        const special = SPECIAL_KEYS[keycode]
        buffer = (special && pack.data.press.special[special]) || this.pickVariant(pack.data.press.generic)
      }
      if (!buffer) return
      const now = this.ctx.currentTime
      const playTime = now + SCHEDULE_OFFSET
      const slot = this.acquireSlot()
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = 1.0
      const intensityVol = 0.5 + 0.50 * 0.5 // fixed intensity 0.50 → 0.75
      const finalVol = intensityVol * this.adaptiveMultiplier
      slot.gain.gain.setValueAtTime(finalVol, playTime)
      slot.panner.pan.setValueAtTime(getKeyPan(keycode), playTime)
      source.connect(slot.gain)
      slot.source = source
      const dur = Math.min(buffer.duration * this.currentDsp.decayScale, MAX_DUR)
      const fadeStart = Math.max(0, dur - 0.025)
      slot.gain.gain.setValueAtTime(finalVol, playTime + fadeStart)
      slot.gain.gain.linearRampToValueAtTime(0, playTime + dur)
      source.start(playTime)
      source.stop(playTime + dur)
      source.onended = () => this.releaseSlot(slot)
      // Hold-repeat must not trigger arcade overlay / combo (spec §4).
      // This `return` prevents fall-through to the overlay hook at method end.
      return
    }

    // WPM tracking (keydown only)
    if (type === 'down') this.updateWpm()

    // #3: Update typing intensity from inter-key interval
    this.updateIntensity()
    // #5: Update adaptive volume
    this.updateAdaptiveVolume()

    let buffer: AudioBuffer | null | undefined

    if (pack.type === 'sprite') {
      const keySound = pack.keys.get(keycode)
      if (type === 'down') buffer = keySound?.down ?? pack.fallbackDown
      else buffer = keySound?.up ?? pack.fallbackUp
    } else {
      const special = SPECIAL_KEYS[keycode]
      if (type === 'down') buffer = (special && pack.data.press.special[special]) || this.pickVariant(pack.data.press.generic)
      else buffer = (special && pack.data.release.special[special]) || pack.data.release.generic
    }
    if (!buffer) return

    const now = this.ctx.currentTime

    // #2: Fixed scheduling offset — eliminates jitter
    const playTime = now + SCHEDULE_OFFSET

    const slot = this.acquireSlot()
    const source = this.ctx.createBufferSource()
    source.buffer = buffer

    // Mode-aware intensity. When locked (Focus / Cozy), keystrokes don't track inter-key timing.
    const effectiveIntensity = this.style.intensityLocked ? 0.7 : this.typingIntensity
    let volIntensity = effectiveIntensity
    if (type === 'down') {
      this.keyIntensityMap.set(keycode, effectiveIntensity)
    } else {
      // Heavy keydown → controlled release (quieter), light → loose bounce (louder)
      const downIntensity = this.keyIntensityMap.get(keycode) ?? 0.7
      this.keyIntensityMap.delete(keycode)
      volIntensity = 1.15 - downIntensity * 0.3
    }

    // Pitch: only vary with intensity when NOT locked; always apply per-key character + mode-scoped jitter
    const pitchBase = this.style.intensityLocked
      ? 1.0
      : 1.0 + (1.0 - this.typingIntensity) * 0.03 - this.typingIntensity * 0.02
    const keyChar = ((keycode * 2654435761 >>> 0) % 200 - 100) / 10000
    const pitchJitter = (Math.random() - 0.5) * this.style.pitchJitter * 2 // symmetric ±
    source.playbackRate.value = pitchBase + keyChar + pitchJitter

    // Volume: intensity × adaptive × ducking × mode-scoped jitter × per-switch top/down balance
    const duckFactor = this.activeVoices > 8 ? 0.8 / Math.sqrt(this.activeVoices - 7) : 1.0
    const intensityVol = 0.5 + volIntensity * 0.5
    const volSpan = this.style.volumeJitter * 2
    const microRandom = (1 - this.style.volumeJitter) + Math.random() * volSpan
    // topDownBalanceDb shapes release relative to press: heavy click bars (Box Navy, Buckling) lift release;
    // soft Topre / Inks pull release down. Press path is unaffected.
    const balanceFactor = type === 'up' ? dbToGain(this.currentDsp.topDownBalanceDb) : 1
    const finalVol = intensityVol * this.adaptiveMultiplier * duckFactor * microRandom * balanceFactor

    slot.gain.gain.setValueAtTime(finalVol, playTime)
    slot.panner.pan.setValueAtTime(getKeyPan(keycode), playTime)

    source.connect(slot.gain)
    slot.source = source

    // Sample offset jitter: 0-2ms varies transient micro-shape
    const offsetJitter = Math.random() * 0.002
    // decayScale stretches/shortens the perceived tail. Capped by MAX_DUR for the voice budget.
    const dur = Math.min((buffer.duration - offsetJitter) * this.currentDsp.decayScale, MAX_DUR)
    const fadeStart = Math.max(0, dur - 0.025)
    slot.gain.gain.setValueAtTime(finalVol, playTime + fadeStart)
    slot.gain.gain.linearRampToValueAtTime(0, playTime + dur)
    source.start(playTime, offsetJitter)
    source.stop(playTime + dur)
    source.onended = () => this.releaseSlot(slot)

    // === Arcade overlay hook ===
    // Only on keydown (not keyup). playTime identical to main source's — zero
    // perceived latency offset vs the axis click.
    if (type === 'down' && this.currentMode.arcadeEnabled) {
      const nowMs = performance.now()
      this.overlayLayer.onKeydown(nowMs, playTime)
    }
  }

  private pickVariant(variants: AudioBuffer[]): AudioBuffer | undefined {
    if (!variants.length) return undefined
    let i: number; do { i = Math.floor(Math.random() * variants.length) } while (i === this.lastVariant && variants.length > 1)
    this.lastVariant = i; return variants[i]
  }

  setVolume(v: number) {
    this.baseVolume = Math.max(0, Math.min(1, v))
    if (this.masterGain) this.masterGain.gain.value = this.baseVolume
  }

  // --- WPM tracking ---
  private updateWpm() {
    const now = performance.now()
    this.keyTimestamps.push(now)
    // Keep only last 5 seconds
    const cutoff = now - 5000
    this.keyTimestamps = this.keyTimestamps.filter(t => t > cutoff)
    // WPM = (keys in 5s / 5) × 60 / 5 (avg word = 5 chars)
    this._wpm = Math.round((this.keyTimestamps.length / 5) * 12)
    this._typingActive = true
    // Reset typing active after 2s idle
    if (this.typingTimeout) clearTimeout(this.typingTimeout)
    this.typingTimeout = setTimeout(() => { this._typingActive = false; this._wpm = 0 }, 2000)
  }

  get wpm() { return this._wpm }
  get typingActive() { return this._typingActive }

  // --- Sound toggle (Cmd+Shift+K) ---
  private _enabled = true
  get enabled() { return this._enabled }
  setEnabled(v: boolean) { this._enabled = v }

  get mode() { return this.currentMode }

  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume() }

  // Called by the power-resume IPC after the system wakes / unlocks. Three-
  // tier fallback: running → no-op; suspended → ctx.resume() with 500ms
  // verify; closed / resume ineffective → tear down and rebuild the entire
  // audio graph, restoring profile / mode / dsp from saved state.
  async wake(): Promise<void> {
    if (!this.ctx || !this.activeProfile) return  // not initialized yet — boot path will handle it

    const state = this.ctx.state
    console.log(`[Audio] wake: state=${state}`)

    if (state === 'running') return

    if (state === 'suspended') {
      try { await this.ctx.resume() } catch (err) { console.warn('[Audio] wake: resume() threw', err) }
      await new Promise(r => setTimeout(r, 500))
      if (this.ctx?.state === 'running') {
        console.log('[Audio] wake: soft recovery ok')
        return
      }
      // fall through → hard rebuild
    }

    // state === 'closed' | resume() ineffective → hard rebuild
    const savedProfile = this.activeProfile
    const savedMode = this.currentMode
    const savedDsp = this.currentDsp
    this.destroy()
    await this.init()
    await this.loadProfile(savedProfile)
    this.setMode(savedMode)
    this.applySwitchDsp(savedDsp)
    console.log('[Audio] wake: hard rebuild ok')
  }

  // --- Cleanup (prevents memory leaks) ---
  destroy() {
    // Tear down arcade first so overlay voices / swell don't linger when main pool releases
    this.deactivateArcade()

    // Stop all active sources
    for (const slot of this.pool) {
      if (slot.source) {
        try { slot.source.stop(); slot.source.disconnect() } catch {}
        slot.source = null
      }
      slot.busy = false
    }
    this.activeVoices = 0

    if (this.adaptiveTimer) clearTimeout(this.adaptiveTimer)
    if (this.typingTimeout) clearTimeout(this.typingTimeout)

    // Close AudioContext
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }

    this.masterGain = null
    this.compressor = null
    this.airLPF = null
    this.highShelf = null
    this.lowShelf = null
    this.wetGain = null
    this.bodyPeak = null
    this.springNotch = null
    this.transient = null
    this.pool = []
    this.packs.clear()
    this.keyIntensityMap.clear()
    console.log('[Audio] destroyed')
  }

  // --- Bluetooth latency detection ---
  checkOutputLatency(): { latencyMs: number; isBluetooth: boolean } {
    if (!this.ctx) return { latencyMs: 0, isBluetooth: false }
    const latencyMs = (this.ctx.outputLatency ?? this.ctx.baseLatency) * 1000
    // Bluetooth typically adds 40-200ms; wired/speakers are <15ms
    const isBluetooth = latencyMs > 30
    return { latencyMs: Math.round(latencyMs), isBluetooth }
  }
}

export const audioEngine = new AudioEngine()
