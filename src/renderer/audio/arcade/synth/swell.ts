import { SWELL_DURATION_S, SAMPLE_RATE } from './constants.ts'

/**
 * Loop-safe shimmer pad: bandpass noise 4-6kHz with slow LFO modulating
 * bpf cutoff to produce "breathing" shimmer. Constant gain — caller handles
 * fade-in / fade-out via its own gain node.
 */
export async function generateSwell(): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, Math.ceil(SWELL_DURATION_S * SAMPLE_RATE), SAMPLE_RATE)

  const bufferSize = Math.ceil(SWELL_DURATION_S * SAMPLE_RATE)
  const noiseBuf = offline.createBuffer(1, bufferSize, SAMPLE_RATE)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const src = offline.createBufferSource()
  src.buffer = noiseBuf

  const bpf = offline.createBiquadFilter()
  bpf.type = 'bandpass'
  bpf.frequency.value = 5000
  bpf.Q.value = 1.5

  const lfo = offline.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.6
  const lfoGain = offline.createGain()
  lfoGain.gain.value = 800
  lfo.connect(lfoGain).connect(bpf.frequency)

  const gain = offline.createGain()
  gain.gain.value = 0.5

  src.connect(bpf).connect(gain).connect(offline.destination)
  src.start(0)
  lfo.start(0)

  return offline.startRendering()
}
