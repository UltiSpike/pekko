import type { BedType, ModeStyle } from './modes'

export interface Profile {
  id: string
  name: string
  description: string
  type: 'linear' | 'tactile' | 'clicky'
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
}

export interface KeyEvent {
  keycode: number
  type: 'down' | 'up'
}
