// AudioBackend — main 进程原生音频库的抽象接口。
//
// 设计目的：把"具体用哪个 native binding"的决定从业务代码里解耦。业务代码（AudioGraph /
// SoundPackStore / AudioCoreService）只依赖这个接口，实现可以是 miniaudio-napi /
// naudiodon2 / MockBackend（测试用），互换不影响上游。
//
// 契约约束：
// 1. decode 返回的 DecodedAudio 是 opaque handle——调用方只能读 .duration 等元数据，
//    不能触碰内部 PCM
// 2. close() 之后 decoded 句柄是否仍有效是实现细节；上层 SoundPackStore 永远重新加载
//    或在 open() 后由 backend 自行处理重新 decode（close→open 周期）
// 3. play(audio, params) 必须在 open 状态下调用；调用方在 close 状态下调用是 bug，
//    实现应抛异常而不是静默

export interface BackendPlayParams {
  volume: number
  pitch: number        // playback rate；1.0 = 原速
  pan: number          // -1..+1（stereo pan）
  durationSec: number  // 上限；实际可能被 buffer 长度更早截断
  offsetSec?: number   // buffer 内部起播偏移（默认 0）
}

export interface DecodedAudio {
  readonly id: string                  // opaque handle
  readonly duration: number            // 秒
  readonly sampleRate: number
  readonly numberOfChannels: number
}

export interface AudioBackend {
  open(sampleRate: number): Promise<void>
  isOpen(): boolean
  decode(bytes: Uint8Array): Promise<DecodedAudio>
  play(audio: DecodedAudio, params: BackendPlayParams): void
  setMasterGain(gain: number): void
  close(): Promise<void>
  outputLatencyMs(): number
}
