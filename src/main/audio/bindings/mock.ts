// MockBackend — AudioBackend 的非音频实现，用来单测/集成测 AudioCoreService 整条
// 生命周期（open/close/play 序列）而不依赖真实声卡。
//
// 也可以在 main 进程"挂起但不出声"的场景下当占位符（例如 PR-2 阶段挂 main lifecycle
// 但尚未选定真实 binding）。

import type { AudioBackend, BackendPlayParams, DecodedAudio } from './types.ts'

export interface MockPlayRecord {
  audio: DecodedAudio
  params: BackendPlayParams
  tsMs: number
}

export class MockBackend implements AudioBackend {
  private opened = false
  private nextId = 0
  private _masterGain = 1.0

  public playHistory: MockPlayRecord[] = []

  async open(_sampleRate: number): Promise<void> {
    this.opened = true
  }

  isOpen(): boolean {
    return this.opened
  }

  async decode(bytes: Uint8Array): Promise<DecodedAudio> {
    if (!this.opened) throw new Error('MockBackend: decode before open()')
    return {
      id: `mock-${this.nextId++}`,
      duration: Math.max(0.05, bytes.length / 44100),
      sampleRate: 44100,
      numberOfChannels: 2,
    }
  }

  play(audio: DecodedAudio, params: BackendPlayParams): void {
    if (!this.opened) throw new Error('MockBackend: play before open()')
    this.playHistory.push({ audio, params, tsMs: performance.now() })
  }

  setMasterGain(gain: number): void {
    this._masterGain = gain
  }

  get masterGain(): number {
    return this._masterGain
  }

  async close(): Promise<void> {
    this.opened = false
  }

  outputLatencyMs(): number {
    return 5
  }

  // 测试辅助：清空历史
  reset(): void {
    this.playHistory = []
  }
}
