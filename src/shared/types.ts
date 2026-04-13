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
}

export interface KeyEvent {
  keycode: number
  type: 'down' | 'up'
}
