import { useEffect, useRef, useState } from 'react'

interface Props {
  wpm: number
  active: boolean
  muted: boolean
}

const SEGMENTS = 24
const PEAK_START = 21      // top 3 segments = peak zone
const PEAK_THRESHOLD_WPM = 90

// ONYX v2.1 — Ladder visualizes typing intensity. Demoted from v1's always-accent
// to ink-2 ghosted at rest; --led-on only on currently-firing segments; --led-dim
// on the trailing tail. Brightness encodes engine activity, not decoration.
export default function LedLadder({ wpm, active, muted }: Props) {
  const [level, setLevel] = useState(0)
  const lastActiveRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (active) {
      lastActiveRef.current = performance.now()
      // wpm / 5 → ~0-24 segments at 120wpm
      setLevel(Math.min(SEGMENTS, Math.max(2, Math.round(wpm / 5) || 4)))
    }
  }, [wpm, active])

  // Tail: decay one segment every 60ms after idle
  useEffect(() => {
    const tick = () => {
      const idle = performance.now() - lastActiveRef.current
      if (idle > 200 && level > 0) {
        setLevel((l) => Math.max(0, l - 1))
      }
      rafRef.current = window.setTimeout(tick, 60) as unknown as number
    }
    rafRef.current = window.setTimeout(tick, 60) as unknown as number
    return () => clearTimeout(rafRef.current)
  }, [level])

  const peakActive = wpm > PEAK_THRESHOLD_WPM && active

  return (
    <div className={`ladder ${muted ? 'muted' : ''}`} aria-hidden="true">
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const lit = i < level
        const peak = lit && peakActive && i >= PEAK_START
        // Currently-firing edge (most-recently-lit segment) = bright on
        // Trailing segments below it = dim tail
        // Future segments = ghost (default style)
        const cls = peak
          ? 'peak'
          : lit && i === level - 1
            ? 'on'        // leading edge — brightest
            : lit
              ? 'tail'    // trailing — --led-dim
              : ''        // ghost (default ink-2 @ 0.18)
        return <span key={i} className={`ladder-seg ${cls}`} />
      })}
    </div>
  )
}
