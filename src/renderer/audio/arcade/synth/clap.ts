import { CLAP_DURATION_S, SAMPLE_RATE } from './constants.ts'

/**
 * Three short noise bursts at 0 / 12ms / 24ms simulating "Da-da-DA" hand clap.
 * Bandpass 2kHz Q=1.2 for vocal-ish character, then main tail fade.
 */
export async function generateClap(): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, Math.ceil(CLAP_DURATION_S * SAMPLE_RATE), SAMPLE_RATE)

  const bufferSize = Math.ceil(CLAP_DURATION_S * SAMPLE_RATE)
  const noiseBuf = offline.createBuffer(1, bufferSize, SAMPLE_RATE)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const src = offline.createBufferSource()
  src.buffer = noiseBuf

  const bpf = offline.createBiquadFilter()
  bpf.type = 'bandpass'
  bpf.frequency.value = 2000
  bpf.Q.value = 1.2

  const gain = offline.createGain()
  gain.gain.setValueAtTime(0, 0)
  const bursts = [0, 0.012, 0.024]
  for (const t of bursts) {
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(1.0, t + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.012)
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, CLAP_DURATION_S)

  src.connect(bpf).connect(gain).connect(offline.destination)
  src.start(0)

  return offline.startRendering()
}
