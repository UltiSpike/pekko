import { ComboStage } from './combo.ts'

type HudStage = 'engaged' | 'stacking' | 'flow' | 'zone'
type HudState =
  | { kind: 'idle' }
  | { kind: 'active'; stage: HudStage; perfect: boolean }

function stageToHud(stage: ComboStage): HudState {
  if (stage === 'idle') return { kind: 'idle' }
  return { kind: 'active', stage, perfect: false }
}

// Uses window.api type from existing ambient declaration. If not present,
// cast at call sites with `(window.api as any).updateArcadeHud?.(state)`.

export class ArcadeHudController {
  private activated = false
  private pending: HudState | null = null
  private lastSent: string = ''
  private rafHandle: number | null = null

  activate(): void {
    if (this.activated) return
    this.activated = true
    this.pushState({ kind: 'idle' })
  }

  deactivate(): void {
    if (!this.activated) return
    this.activated = false
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
    this.pending = null
    // bypass rAF batch — idle must land instantly so tray resets to template
    this.sendImmediate({ kind: 'idle' })
  }

  onStageChange(stage: ComboStage, _combo: number): void {
    if (!this.activated) return
    this.pushState(stageToHud(stage))
  }

  onPerfect(): void {
    if (!this.activated) return
    const base = this.pending ?? this.parseLastSent() ?? { kind: 'idle' }
    if (base.kind !== 'active') return
    this.pushState({ kind: 'active', stage: base.stage, perfect: true })
  }

  onReset(): void {
    if (!this.activated) return
    this.pushState({ kind: 'idle' })
  }

  private pushState(state: HudState): void {
    this.pending = state
    if (this.rafHandle !== null) return
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null
      // If deactivate() ran while this rAF was queued, do nothing — deactivate
      // already sent the final idle state synchronously.
      if (!this.activated) return
      if (this.pending === null) return
      const key = JSON.stringify(this.pending)
      if (key !== this.lastSent) {
        this.sendImmediate(this.pending)
        this.lastSent = key
      }
      this.pending = null
    })
  }

  private sendImmediate(state: HudState): void {
    this.lastSent = JSON.stringify(state)
    ;(window.api as any)?.updateArcadeHud?.(state)
  }

  private parseLastSent(): HudState | null {
    if (!this.lastSent) return null
    try { return JSON.parse(this.lastSent) } catch { return null }
  }
}
