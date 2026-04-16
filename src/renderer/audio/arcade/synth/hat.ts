import { HAT_DURATION_S, SAMPLE_RATE } from './constants.ts'

/**
 * White noise HPF→LPF bandpass (8k–12k) with exponential decay envelope.
 * Closed-hat character.
 */
export async function generateHat(): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, Math.ceil(HAT_DURATION_S * SAMPLE_RATE), SAMPLE_RATE)

  const bufferSize = Math.ceil(HAT_DURATION_S * SAMPLE_RATE)
  const noiseBuf = offline.createBuffer(1, bufferSize, SAMPLE_RATE)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const src = offline.createBufferSource()
  src.buffer = noiseBuf

  const hpf = offline.createBiquadFilter()
  hpf.type = 'highpass'
  hpf.frequency.value = 8000

  const lpf = offline.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.value = 12000

  const gain = offline.createGain()
  gain.gain.setValueAtTime(1.0, 0)
  gain.gain.exponentialRampToValueAtTime(0.0001, HAT_DURATION_S)

  src.connect(hpf).connect(lpf).connect(gain).connect(offline.destination)
  src.start(0)

  return offline.startRendering()
}
