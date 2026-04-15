import type { BedType, ModeStyle, SwitchDsp, SwitchDspOverride } from './modes'

export interface Profile {
  id: string
  name: string
  description: string
  type: 'linear' | 'tactile' | 'clicky'
  dsp?: SwitchDsp
}

// ONYX v2 — Materials replace v1 Finishes. Renamed from color names to material names
// to commit the "carved chassis" metaphor. Each material is a chassis + ink + accent
// + engraving recipe + texture pairing, not just a palette swap.
export type Finish = 'auto' | 'basalt' | 'bone' | 'verdigris' | 'patina' | 'shellac' | 'indigo-linen'

// Display order: Auto first, then dark materials, then light materials.
// Help panel groups by tone (Dark / Light) for Hick's-Law-friendly scanning.
export const FINISHES: { id: Finish; name: string; tone: 'auto' | 'dark' | 'light' }[] = [
  { id: 'auto',         name: 'Auto · System',  tone: 'auto'  },
  { id: 'basalt',       name: 'Basalt',         tone: 'dark'  },
  { id: 'verdigris',    name: 'Verdigris',      tone: 'dark'  },
  { id: 'patina',       name: 'Patina',         tone: 'dark'  },
  { id: 'shellac',      name: 'Shellac',        tone: 'dark'  },
  { id: 'bone',         name: 'Bone',           tone: 'light' },
  { id: 'indigo-linen', name: 'Indigo Linen',   tone: 'light' },
]

// One-time migration from v1 finish names. Saved settings with old names land
// on the equivalent material on first launch after upgrade.
export const FINISH_MIGRATION: Record<string, Finish> = {
  graphite: 'basalt',
  ivory:    'bone',
  phosphor: 'verdigris',
  cyan:     'patina',
  ember:    'shellac',
  slate:    'indigo-linen',
}

export interface AppSettings {
  activeProfile: string
  volume: number
  startAtLogin: boolean
  mode: string
  isTuning: boolean
  finish: Finish
  // Opt-in UI sound cues for drawer open/close + mute toggle. Default off —
  // a menu-bar tool shouldn't make sound of its own without permission.
  uiSounds: boolean
  // Three-tier hold-repeat. 'off' = silent on hold for every key (default);
  // 'edit' = repeat only ⌫ ⌦ ←→↑↓ (prior boolean-true behavior); 'global' =
  // repeat every key's OS auto-repeat stream.
  holdRepeat: HoldRepeatMode
  // Timestamp (ms epoch) of the last window close. Used by the v2.2 isTuning
  // stale guard — if reopen happens > 1 hour later, drawer state is cleared.
  lastCloseAt?: number
  customBed: BedType
  customBedGainDb: number
  customStyle: ModeStyle
  // Opt-in arcade overlay inside Custom Mode
  customArcadeEnabled: boolean
  // Per-switch DSP overrides keyed by profileId. Stored as Partial so that if the
  // curated preset evolves, untouched fields keep tracking the new defaults.
  switchDspOverrides: Record<string, SwitchDspOverride>
}

export interface KeyEvent {
  keycode: number
  type: 'down' | 'up' | 'repeat'
}

export type HoldRepeatMode = 'off' | 'edit' | 'global'

// UI cycle order (used by ⇧⌘R) — ascending intensity.
export const HOLD_REPEAT_CYCLE: HoldRepeatMode[] = ['off', 'edit', 'global']
