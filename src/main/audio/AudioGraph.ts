// AudioGraph — AudioBackend 上面薄薄一层，做三件事：
// 1. init / teardown 生命周期
// 2. playBuffer 统一入口（AudioCoreService 不直接触碰 backend）
// 3. 主音量控制（mute 走这里，不改 Lifecycle 状态）
//
// PR-2 阶段极简——DSP filter ramp 留到后续 PR（按 spec §4.2）。此时 mode/switchDsp
// 的状态由 AudioCoreService 记录但不真正作用到声音上。

import type { AudioBackend, BackendPlayParams, DecodedAudio } from './bindings/types'

export class AudioGraph {
  constructor(private backend: AudioBackend) {}

  async init(sampleRate = 44100): Promise<void> {
    if (this.backend.isOpen()) return
    await this.backend.open(sampleRate)
  }

  async teardown(): Promise<void> {
    if (this.backend.isOpen()) {
      await this.backend.close()
    }
  }

  isOpen(): boolean {
    return this.backend.isOpen()
  }

  async decode(bytes: Uint8Array): Promise<DecodedAudio> {
    return this.backend.decode(bytes)
  }

  playBuffer(audio: DecodedAudio, params: BackendPlayParams): void {
    if (!this.backend.isOpen()) return
    this.backend.play(audio, params)
  }

  setMasterGain(gain: number): void {
    this.backend.setMasterGain(gain)
  }

  outputLatencyMs(): number {
    return this.backend.outputLatencyMs()
  }
}
