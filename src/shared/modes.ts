export type BedType = 'none' | 'brown' | 'pink'
export type StyleLevel = 'minimal' | 'soft' | 'full' | 'deep'

// === Per-switch DSP ===
// Each switch has a curated DSP preset (in profiles/index.json). Users can override
// 5 of the 7 fields via the Tune panel; bodyPeakHz/Q stay curator-locked because they
// are voicing decisions, not taste knobs.
export interface SwitchDsp {
  bodyPeakHz: number     // 150–800 Hz, curator-only
  bodyPeakQ: number      // 0.5–4, curator-only
  bodyPeakDb: number     // 0–6 dB, "thock body" intensity
  springNotchDb: number  // −12 to +3 dB at 2.5 kHz, suppress / emphasize spring ping
  transientDb: number    // −6 to +6 dB high-shelf at 5 kHz, attack sharpness
  topDownBalanceDb: number // −12 to +6 dB, release vs press relative gain
  decayScale: number     // 0.5–2.0, sample tail length multiplier
}

// Used when a profile has no `dsp` block — neutral pass-through.
export const DEFAULT_SWITCH_DSP: SwitchDsp = {
  bodyPeakHz: 350,
  bodyPeakQ: 1.5,
  bodyPeakDb: 0,
  springNotchDb: 0,
  transientDb: 0,
  topDownBalanceDb: 0,
  decayScale: 1.0,
}

// User-tunable subset (excludes bodyPeakHz/Q which are curator-locked).
export type SwitchDspOverride = Partial<Pick<SwitchDsp,
  'bodyPeakDb' | 'springNotchDb' | 'transientDb' | 'topDownBalanceDb' | 'decayScale'
>>

export const SWITCH_DSP_RANGE = {
  bodyPeakDb:       { min: 0,    max: 6,    step: 0.25 },
  springNotchDb:    { min: -12,  max: 3,    step: 0.5 },
  transientDb:      { min: -6,   max: 6,    step: 0.25 },
  topDownBalanceDb: { min: -12,  max: 6,    step: 0.5 },
  decayScale:       { min: 0.5,  max: 2.0,  step: 0.05 },
} as const

export function resolveSwitchDsp(preset: SwitchDsp | undefined, override: SwitchDspOverride | undefined): SwitchDsp {
  return { ...DEFAULT_SWITCH_DSP, ...(preset ?? {}), ...(override ?? {}) }
}

// === Flavors ===
// Universal voicing variants applied per-switch. Each transforms the curated preset
// into an override. "stock" returns {} (= drop override, fall back to preset).
// Designed so the same names mean the same thing across linear/tactile/clicky.
export interface Flavor {
  id: string
  name: string
  description: string
  apply: (preset: SwitchDsp) => SwitchDspOverride
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const FLAVORS: Flavor[] = [
  {
    id: 'stock',
    name: 'Stock',
    description: 'As designed',
    apply: () => ({}),
  },
  {
    id: 'deep',
    name: 'Deep',
    description: 'More body, longer tail',
    apply: (p) => ({
      bodyPeakDb:       clamp(p.bodyPeakDb + 1.5,       SWITCH_DSP_RANGE.bodyPeakDb.min,       SWITCH_DSP_RANGE.bodyPeakDb.max),
      transientDb:      clamp(p.transientDb - 1.5,      SWITCH_DSP_RANGE.transientDb.min,      SWITCH_DSP_RANGE.transientDb.max),
      decayScale:       clamp(p.decayScale + 0.15,      SWITCH_DSP_RANGE.decayScale.min,       SWITCH_DSP_RANGE.decayScale.max),
      topDownBalanceDb: clamp(p.topDownBalanceDb - 1,   SWITCH_DSP_RANGE.topDownBalanceDb.min, SWITCH_DSP_RANGE.topDownBalanceDb.max),
    }),
  },
  {
    id: 'bright',
    name: 'Bright',
    description: 'Crisp attack, lifted top',
    apply: (p) => ({
      bodyPeakDb:       clamp(p.bodyPeakDb - 0.5,       SWITCH_DSP_RANGE.bodyPeakDb.min,       SWITCH_DSP_RANGE.bodyPeakDb.max),
      transientDb:      clamp(p.transientDb + 2,        SWITCH_DSP_RANGE.transientDb.min,      SWITCH_DSP_RANGE.transientDb.max),
      springNotchDb:    clamp(p.springNotchDb + 1,      SWITCH_DSP_RANGE.springNotchDb.min,    SWITCH_DSP_RANGE.springNotchDb.max),
      decayScale:       clamp(p.decayScale - 0.1,       SWITCH_DSP_RANGE.decayScale.min,       SWITCH_DSP_RANGE.decayScale.max),
      topDownBalanceDb: clamp(p.topDownBalanceDb + 1,   SWITCH_DSP_RANGE.topDownBalanceDb.min, SWITCH_DSP_RANGE.topDownBalanceDb.max),
    }),
  },
  {
    id: 'smooth',
    name: 'Smooth',
    description: 'Polished, no edges',
    apply: (p) => ({
      springNotchDb:    clamp(p.springNotchDb - 3,      SWITCH_DSP_RANGE.springNotchDb.min,    SWITCH_DSP_RANGE.springNotchDb.max),
      transientDb:      clamp(p.transientDb - 0.5,      SWITCH_DSP_RANGE.transientDb.min,      SWITCH_DSP_RANGE.transientDb.max),
      topDownBalanceDb: clamp(p.topDownBalanceDb - 0.5, SWITCH_DSP_RANGE.topDownBalanceDb.min, SWITCH_DSP_RANGE.topDownBalanceDb.max),
      decayScale:       clamp(p.decayScale + 0.05,      SWITCH_DSP_RANGE.decayScale.min,       SWITCH_DSP_RANGE.decayScale.max),
    }),
  },
]

// Approximate equality — sliders snap to step values, so 1e-3 tolerance is plenty.
function overridesEqual(a: SwitchDspOverride, b: SwitchDspOverride): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof SwitchDspOverride>
  for (const k of keys) {
    const av = a[k]
    const bv = b[k]
    if (av === undefined && bv === undefined) continue
    if (av === undefined || bv === undefined) return false
    if (Math.abs(av - bv) > 1e-3) return false
  }
  return true
}

// Returns the matching flavor id, or 'custom' if the override doesn't line up with any.
export function getCurrentFlavorId(override: SwitchDspOverride, preset: SwitchDsp): string {
  for (const f of FLAVORS) {
    if (overridesEqual(override, f.apply(preset))) return f.id
  }
  return 'custom'
}

export interface ModeStyle {
  // Per-key jitter (low = predictable / flow, high = organic / realistic)
  pitchJitter: number    // fraction, e.g. 0.003 = ±0.3%
  volumeJitter: number   // fraction of ±
  intensityLocked: boolean // ignore inter-key timing when shaping volume/pitch
  // Spectral shape
  airLpfHz: number       // air LPF cutoff (lower = warmer)
  highShelfDb: number    // high-shelf gain at 9kHz (+ = crisper, - = softer)
  lowShelfDb: number     // low-shelf gain at 180Hz (higher = thicker thock)
  // Desk reflection mix (higher = more spacious/wet body)
  wetMix: number         // 0..1 — 0.12 is the default dry tilt
}

export interface Mode {
  id: string
  name: string
  subtitle: string       // compact UI label (tooltip fallback)
  description: string    // single-line experiential copy, shown under the mode pills
  bed: BedType
  bedGainDb: number
  style: ModeStyle
}

const STYLE: Record<StyleLevel, ModeStyle> = {
  minimal: {
    pitchJitter: 0.003,
    volumeJitter: 0.03,
    intensityLocked: true,
    airLpfHz: 8000,
    highShelfDb: 0,
    lowShelfDb: 2.5,
    wetMix: 0.12,
  },
  soft: {
    pitchJitter: 0.015,
    volumeJitter: 0.08,
    intensityLocked: true,
    airLpfHz: 10000,
    highShelfDb: 0.25,
    lowShelfDb: 3.0,
    wetMix: 0.15,
  },
  full: {
    pitchJitter: 0.025,
    volumeJitter: 0.15,
    intensityLocked: false,
    airLpfHz: 13000,
    highShelfDb: 0.5,
    lowShelfDb: 2.5,
    wetMix: 0.12,
  },
  // "Deep" — the thocky hit. Heavy low-end, warm ceiling, controlled decay, tight predictability.
  // wetMix kept under 0.20 so the 12ms desk reflection doesn't read as perceived latency.
  deep: {
    pitchJitter: 0.004,
    volumeJitter: 0.04,
    intensityLocked: true,
    airLpfHz: 6500,
    highShelfDb: -1.0,
    lowShelfDb: 5.0,
    wetMix: 0.18,
  },
}

// Custom mode starts as a copy of Thock. Users tune from there; values persisted in AppSettings.
export const DEFAULT_CUSTOM_STYLE: ModeStyle = { ...STYLE.deep }
export const DEFAULT_CUSTOM_BED: BedType = 'none'
export const DEFAULT_CUSTOM_BED_GAIN_DB = -40

// Parameter ranges — clamp sliders so no preset can make the engine misbehave
export const CUSTOM_RANGE = {
  lowShelfDb:   { min: 0,     max: 8,     step: 0.5 },
  wetMix:       { min: 0,     max: 0.30,  step: 0.01 },
  airLpfHz:     { min: 4000,  max: 15000, step: 250 },
  highShelfDb:  { min: -3,    max: 2,     step: 0.25 },
  pitchJitter:  { min: 0,     max: 0.04,  step: 0.001 },
  volumeJitter: { min: 0,     max: 0.20,  step: 0.01 },
  bedGainDb:    { min: -50,   max: -28,   step: 1 },
} as const

export function buildCustomMode(style: ModeStyle, bed: BedType, bedGainDb: number): Mode {
  return {
    id: 'custom',
    name: 'Custom',
    subtitle: 'Your engine',
    description: 'Your own blend — tune bed, EQ, and jitter to taste.',
    bed,
    bedGainDb,
    style,
  }
}

export const MODES: Mode[] = [
  {
    id: 'deep-focus',
    name: 'Deep Focus',
    subtitle: 'Brown bed · muted keys',
    description: 'Warm brown-noise bed and muted keys. Disappear into the work.',
    bed: 'brown',
    bedGainDb: -38,
    style: STYLE.minimal,
  },
  {
    id: 'cozy-writing',
    name: 'Cozy Writing',
    subtitle: 'Pink bed · soft keys',
    description: 'Pink-noise warmth, softer keys. Good company for long sessions.',
    bed: 'pink',
    bedGainDb: -40,
    style: STYLE.soft,
  },
  {
    id: 'thock',
    name: 'Thock',
    subtitle: 'Deep, roomy · no bed',
    description: 'Heavy low-end, warm decay. Satisfying weight on every keystroke.',
    bed: 'none',
    bedGainDb: -80,
    style: STYLE.deep,
  },
  {
    id: 'classic-mech',
    name: 'Classic Mech',
    subtitle: 'No bed · full fidelity',
    description: 'No bed, full mechanical fidelity. Every switch as recorded.',
    bed: 'none',
    bedGainDb: -80,
    style: STYLE.full,
  },
]

export const DEFAULT_MODE_ID = 'thock'

export function getMode(id: string): Mode {
  return MODES.find((m) => m.id === id) ?? MODES[0]
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}
