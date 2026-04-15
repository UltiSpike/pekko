import type { BedType, ModeStyle, SwitchDsp, SwitchDspOverride } from './modes'

export interface Profile {
  id: string
  name: string
  description: string
  type: 'linear' | 'tactile' | 'clicky'
  dsp?: SwitchDsp
}

export type Finish = 'auto' | 'graphite' | 'ivory' | 'phosphor' | 'cyan' | 'ember' | 'slate'

export const FINISHES: { id: Finish; name: string }[] = [
  { id: 'auto',     name: 'Auto · System' },
  { id: 'graphite', name: 'Graphite' },
  { id: 'ivory',    name: 'Ivory' },
  { id: 'phosphor', name: 'Phosphor' },
  { id: 'cyan',     name: 'Cyan' },
  { id: 'ember',    name: 'Ember' },
  { id: 'slate',    name: 'Slate' },
]

export interface AppSettings {
  activeProfile: string
  volume: number
  startAtLogin: boolean
  mode: string
  isTuning: boolean
  finish: Finish
  customBed: BedType
  customBedGainDb: number
  customStyle: ModeStyle
  // Per-switch DSP overrides keyed by profileId. Stored as Partial so that if the
  // curated preset evolves, untouched fields keep tracking the new defaults.
  switchDspOverrides: Record<string, SwitchDspOverride>
}

export interface KeyEvent {
  keycode: number
  type: 'down' | 'up'
}
