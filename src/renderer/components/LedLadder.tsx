import { useEffect, useRef, useState } from 'react'

interface Props {
  wpm: number
  active: boolean
  muted: boolean
}

const SEGMENTS = 24
const PEAK_START = 21      // top 3 segments = peak zone
const PEAK_THRESHOLD_WPM = 90

// Ladder visualizes live typing intensity. See docs/design/CHASSIS.md §4.
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
        const on = i < level
        const peak = on && peakActive && i >= PEAK_START
        return (
          <span
            key={i}
            className={`ladder-seg ${on ? 'on' : ''} ${peak ? 'peak' : ''}`}
          />
        )
      })}
    </div>
  )
}
