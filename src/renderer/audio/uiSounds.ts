// ONYX v2.2 — UI Sound cues. Opt-in (default off).
//
// Spec calls for samples sourced from the active sound pack so each material's
// drawer-open click sounds like the loaded switch. v2.2 ships a synthesized
// version (filtered noise + sine click) — pleasant, lightweight, no engine
// integration. Active-pack borrowing is a v3 polish.

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
    ctx = new Ctx()
  }
  return ctx
}

// Drawer open: brief filtered-noise burst, low-passed, falling pitch — reads as
// a physical cover sliding back. ~30ms total perceived duration.
export function playDrawerOpen(): void {
  const c = getCtx()
  const now = c.currentTime
  const buf = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    // Pink-ish noise envelope tapering to silence
    const env = Math.exp(-i / (c.sampleRate * 0.020))
    data[i] = (Math.random() * 2 - 1) * env
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(2200, now)
  lp.frequency.exponentialRampToValueAtTime(900, now + 0.06)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.25, now)        // ~-12dB
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
  src.connect(lp).connect(gain).connect(c.destination)
  src.start(now)
  src.stop(now + 0.1)
}

// Drawer close: same envelope, slightly higher cutoff, faster decay.
export function playDrawerClose(): void {
  const c = getCtx()
  const now = c.currentTime
  const buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const env = Math.exp(-i / (c.sampleRate * 0.012))
    data[i] = (Math.random() * 2 - 1) * env
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1600, now)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.20, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
  src.connect(lp).connect(gain).connect(c.destination)
  src.start(now)
  src.stop(now + 0.07)
}

// Mute toggle: low-passed click — relay-flip feel. ~80ms.
export function playMuteToggle(): void {
  const c = getCtx()
  const now = c.currentTime
  const buf = c.createBuffer(1, c.sampleRate * 0.10, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const env = Math.exp(-i / (c.sampleRate * 0.030))
    data[i] = (Math.random() * 2 - 1) * env
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2000
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.13, now)        // ~-18dB
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10)
  src.connect(lp).connect(gain).connect(c.destination)
  src.start(now)
  src.stop(now + 0.12)
}
