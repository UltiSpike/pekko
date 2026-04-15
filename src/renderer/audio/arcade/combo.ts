export type ComboStage = 'idle' | 'engaged' | 'stacking' | 'flow' | 'zone'

export interface ComboState {
  combo: number
  lastKeydownMs: number
  recentKeydownMs: number[]
  lastPerfectMs: number
}

export const COMBO_RESET_INTERVAL_MS = 600
export const PERFECT_WINDOW_SIZE = 8        // number of intervals, so need 9 keydowns
export const PERFECT_THRESHOLD = 0.15
export const PERFECT_COOLDOWN_MS = 2000

const STAGE_THRESHOLDS = {
  engaged: 2,
  stacking: 10,
  flow: 25,
  zone: 50,
} as const

export function createComboState(): ComboState {
  return {
    combo: 0,
    lastKeydownMs: 0,
    recentKeydownMs: [],
    lastPerfectMs: -Infinity,
  }
}

export function recordKeydown(s: ComboState, nowMs: number): void {
  const interval = s.lastKeydownMs === 0 ? 0 : nowMs - s.lastKeydownMs
  if (interval > COMBO_RESET_INTERVAL_MS) {
    s.combo = 0
    s.recentKeydownMs = []
  }
  s.combo += 1
  s.lastKeydownMs = nowMs
  s.recentKeydownMs.push(nowMs)
  // Keep at most PERFECT_WINDOW_SIZE + 1 timestamps (for 8 intervals need 9 points)
  const keep = PERFECT_WINDOW_SIZE + 1
  if (s.recentKeydownMs.length > keep) {
    s.recentKeydownMs.splice(0, s.recentKeydownMs.length - keep)
  }
}

/**
 * Hold-repeat (keyboard flag=2) — must NOT touch combo state.
 * Exists as an explicit API so call sites can be typed and grep-able.
 */
export function recordRepeat(_s: ComboState, _nowMs: number): void {
  // no-op
}

export function checkPerfect(s: ComboState, nowMs: number): boolean {
  if (s.recentKeydownMs.length < PERFECT_WINDOW_SIZE + 1) return false
  if (nowMs - s.lastPerfectMs < PERFECT_COOLDOWN_MS) return false

  const ts = s.recentKeydownMs.slice(-PERFECT_WINDOW_SIZE - 1)
  const intervals: number[] = []
  for (let i = 1; i < ts.length; i++) intervals.push(ts[i] - ts[i - 1])

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
  if (mean === 0) return false
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
  const stddev = Math.sqrt(variance)

  if (stddev / mean < PERFECT_THRESHOLD) {
    s.lastPerfectMs = nowMs
    return true
  }
  return false
}

export function getStage(combo: number): ComboStage {
  if (combo >= STAGE_THRESHOLDS.zone) return 'zone'
  if (combo >= STAGE_THRESHOLDS.flow) return 'flow'
  if (combo >= STAGE_THRESHOLDS.stacking) return 'stacking'
  if (combo >= STAGE_THRESHOLDS.engaged) return 'engaged'
  return 'idle'
}

export function resetComboState(s: ComboState): void {
  s.combo = 0
  s.lastKeydownMs = 0
  s.recentKeydownMs = []
  s.lastPerfectMs = -Infinity
}
