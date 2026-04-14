export type BedType = 'none' | 'brown' | 'pink'
export type StyleLevel = 'minimal' | 'soft' | 'full' | 'deep'

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
