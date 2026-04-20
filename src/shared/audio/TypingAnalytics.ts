// TypingAnalytics — 纯状态 + 纯查询模块。
//
// 职责：从按键时间流里算出四个实时指标，供 KeySampler 调音量 / pitch，
// 以及 UI 显示 WPM / typing 活跃态。
//
// 设计约束：
// 1. `recordKey` 之外无任何副作用，不读全局时钟——所有时间点由调用方传入
// 2. `snapshot` 是 pull 模式；调用方决定何时采样
// 3. `arcadeEnabled=true` 时禁用疲劳衰减，adaptiveMul 永远是 1.0（spec §7 Rush 是冲刺模式）

export interface TypingSnapshot {
  intensity: number
  adaptiveMul: number
  wpm: number
  typingActive: boolean
}

export interface TypingAnalyticsOptions {
  arcadeEnabled?: boolean
}

export class TypingAnalytics {
  private lastKeyTime = 0
  private intensity = 0.7
  private adaptiveMul = 1.0
  private typingStartTime = 0
  private keyTimestamps: number[] = []
  private arcadeEnabled: boolean

  constructor(opts: TypingAnalyticsOptions = {}) {
    this.arcadeEnabled = opts.arcadeEnabled ?? false
  }

  setArcadeEnabled(v: boolean): void {
    this.arcadeEnabled = v
  }

  recordKey(tsMs: number, _keycode: number, type: 'down' | 'up' | 'repeat'): void {
    if (type !== 'down') return

    // Intensity model — 从 inter-key 间隔推断敲击力度
    const interval = tsMs - this.lastKeyTime
    if (this.lastKeyTime === 0 || interval > 2000) {
      this.intensity = 0.80
    } else if (interval < 80) {
      this.intensity = Math.max(0.35, this.intensity - 0.08)
    } else if (interval < 150) {
      this.intensity = 0.5 + ((interval - 80) / 140) * 0.3
    } else {
      this.intensity = Math.min(1.0, 0.7 + ((interval - 150) / 500) * 0.3)
    }

    // Adaptive volume — 持续打字时衰减防耳疲劳；arcade 模式关掉
    if (this.arcadeEnabled) {
      this.adaptiveMul = 1.0
      this.typingStartTime = 0
    } else if (tsMs - this.lastKeyTime > 3000) {
      this.adaptiveMul = 1.0
      this.typingStartTime = tsMs
    } else if (this.typingStartTime === 0) {
      this.typingStartTime = tsMs
    } else {
      const durSec = (tsMs - this.typingStartTime) / 1000
      if (durSec < 5) this.adaptiveMul = 1.0
      else if (durSec < 30) this.adaptiveMul = 1.0 - ((durSec - 5) / 25) * 0.25
      else this.adaptiveMul = Math.max(0.65, this.adaptiveMul)
    }

    // WPM — 滑动 5s 窗口
    this.keyTimestamps.push(tsMs)
    const cutoff = tsMs - 5000
    this.keyTimestamps = this.keyTimestamps.filter(t => t > cutoff)

    this.lastKeyTime = tsMs
  }

  // nowMsFn 注入让单测可用假时钟验证 typingActive 的时间边界
  snapshot(nowMsFn: () => number = () => performance.now()): TypingSnapshot {
    const now = nowMsFn()
    const rawWpm = Math.round((this.keyTimestamps.length / 5) * 12)
    const typingActive = this.lastKeyTime > 0 && now - this.lastKeyTime < 2000
    return {
      intensity: this.intensity,
      adaptiveMul: this.adaptiveMul,
      wpm: typingActive ? rawWpm : 0,
      typingActive,
    }
  }
}
