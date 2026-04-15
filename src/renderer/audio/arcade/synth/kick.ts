import { KICK_DURATION_S, SAMPLE_RATE } from './constants.ts'

/**
 * 60 → 45 Hz downslope sine kick, no attack click.
 * Exponential amp envelope 5ms attack / full decay.
 */
export async function generateKick(): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, Math.ceil(KICK_DURATION_S * SAMPLE_RATE), SAMPLE_RATE)
  const osc = offline.createOscillator()
  const gain = offline.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(60, 0)
  osc.frequency.exponentialRampToValueAtTime(45, KICK_DURATION_S)

  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(1.0, 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, KICK_DURATION_S)

  osc.connect(gain)
  gain.connect(offline.destination)

  osc.start(0)
  osc.stop(KICK_DURATION_S)

  return offline.startRendering()
}
