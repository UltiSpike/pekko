// Lifecycle — 音频引擎的显式有限状态机。
//
// 设计目的：替代目前 AudioEngine 里由 5 维布尔（ctx.state × _enabled × pack loaded ×
// masterGain × 等）组合出的 32 种隐式组合状态。所有允许的转移一次性列出，非法转移
// 抛异常而不是静默出错。
//
// 契约：
// - 任何状态都可以转到 Shutdown（终态，不可回）
// - Recovering 累计 3 次 recover-fail 后进 Failed
// - Failed 只能通过 manual-retry 走出（用户点托盘菜单 / HelpPanel 按钮）

export type LifecycleState =
  | 'Cold'
  | 'Booting'
  | 'Ready'
  | 'Suspended'
  | 'Recovering'
  | 'Failed'
  | 'Shutdown'

export type LifecycleEvent =
  | 'start'
  | 'boot-ok'
  | 'boot-fail'
  | 'suspend'
  | 'wake'
  | 'recover-ok'
  | 'recover-fail'
  | 'manual-retry'
  | 'shutdown'

export type SuspendReason = 'sleep' | 'lock' | 'manual'

export interface TransitionMeta {
  reason?: string
}

export type StateChangeListener = (
  from: LifecycleState,
  to: LifecycleState,
  meta?: TransitionMeta,
) => void

const MAX_RECOVER_ATTEMPTS = 3

export class Lifecycle {
  private _state: LifecycleState = 'Cold'
  private _recoverAttempt = 0
  private _failureReason: string | null = null
  private _suspendReason: SuspendReason | null = null
  private listeners: StateChangeListener[] = []

  get state(): LifecycleState {
    return this._state
  }
  get recoverAttempt(): number {
    return this._recoverAttempt
  }
  get failureReason(): string | null {
    return this._failureReason
  }
  get suspendReason(): SuspendReason | null {
    return this._suspendReason
  }

  on(event: 'state-change', cb: StateChangeListener): void {
    if (event === 'state-change') this.listeners.push(cb)
  }

  transition(event: LifecycleEvent, meta: TransitionMeta = {}): void {
    const next = this.nextState(event, meta)
    if (!next) {
      throw new Error(`Lifecycle: illegal transition "${event}" from "${this._state}"`)
    }
    const from = this._state
    this._state = next
    for (const cb of this.listeners) cb(from, next, meta)
  }

  private nextState(event: LifecycleEvent, meta: TransitionMeta): LifecycleState | null {
    // Shutdown 是终态，拒绝一切
    if (this._state === 'Shutdown') return null

    // 全局：shutdown 从任何非终态进 Shutdown
    if (event === 'shutdown') return 'Shutdown'

    switch (this._state) {
      case 'Cold':
        if (event === 'start') return 'Booting'
        return null

      case 'Booting':
        if (event === 'boot-ok') {
          this._recoverAttempt = 0
          this._failureReason = null
          return 'Ready'
        }
        if (event === 'boot-fail') {
          this._failureReason = meta.reason ?? 'unknown'
          return 'Failed'
        }
        return null

      case 'Ready':
        if (event === 'suspend') {
          this._suspendReason = (meta.reason as SuspendReason | undefined) ?? 'manual'
          return 'Suspended'
        }
        return null

      case 'Suspended':
        if (event === 'wake') {
          this._recoverAttempt = 1
          return 'Recovering'
        }
        return null

      case 'Recovering':
        if (event === 'recover-ok') {
          this._recoverAttempt = 0
          this._failureReason = null
          return 'Ready'
        }
        if (event === 'recover-fail') {
          if (this._recoverAttempt >= MAX_RECOVER_ATTEMPTS) {
            this._failureReason = `recover exhausted after ${MAX_RECOVER_ATTEMPTS} attempts`
            return 'Failed'
          }
          this._recoverAttempt += 1
          return 'Recovering'
        }
        return null

      case 'Failed':
        if (event === 'manual-retry') {
          this._recoverAttempt = 1
          return 'Recovering'
        }
        return null
    }
    return null
  }
}
