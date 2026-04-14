import type { BedType, ModeStyle, SwitchDsp, SwitchDspOverride } from './modes'

export interface Profile {
  id: string
  name: string
  description: string
  type: 'linear' | 'tactile' | 'clicky'
  dsp?: SwitchDsp
}

export interface AppSettings {
  activeProfile: string
  volume: number
  startAtLogin: boolean
  theme: string
  mode: string
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
