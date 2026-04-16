import { useEffect, useRef, useState } from 'react'

interface Props {
  wpm: number
  active: boolean
  muted: boolean
}

// Geometry — 120×60 SVG, semicircle arc (180° → 360°, bottom half of a circle).
// Stroke length ≈ π·r where r = 56 (room for stroke-width up to 3px without clipping).
const SVG_W = 120
const SVG_H = 60
const RADIUS = 56
const ARC_LENGTH = Math.PI * RADIUS    // ≈ 175.93
const CX = SVG_W / 2
const CY = SVG_H

// Adaptive volume model (mirrors the audio engine's behavior — see DESIGN.md).
// We can't read the engine's internal state from the renderer, so we model the
// same curve here from the typingActive transitions we already observe.
//
//   0–5 s typing  → fill 0 → 25 %
//   5–30 s typing → fill 25 → 100 %
//   3 s idle      → drain to 0 over 900 ms
function curve(activeMs: number): number {
  if (activeMs <= 0) return 0
  if (activeMs <= 5_000) return (activeMs / 5_000) * 0.25
  if (activeMs <= 30_000) return 0.25 + ((activeMs - 5_000) / 25_000) * 0.75
  return 1.0
}

// ONYX v2 — DSP Warmth Arc. Visualizes the audio engine's adaptive-volume decay
// state (warmth, the "instrument is settling into the performance" signal).
// Secondary signal: instantaneous WPM modulates stroke width 1.5–3 px on a
// 1 s smoothing window — even when fill saturates at 100 %, the line keeps
// breathing so 30 s+ sessions don't lock visually.
export default function DspWarmthArc({ wpm, active, muted }: Props) {
  const [fill, setFill] = useState(0)         // 0..1 — warmth level
  const [strokeWidth, setStrokeWidth] = useState(1.5)
  const activeStartRef = useRef<number | null>(null)
  const lastActiveRef = useRef<number>(0)
  const drainStartRef = useRef<number | null>(null)
  const drainStartFillRef = useRef<number>(0)
  const smoothedWpmRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

  // Update active timing on transitions
  useEffect(() => {
    if (active) {
      lastActiveRef.current = performance.now()
      drainStartRef.current = null
      if (activeStartRef.current === null) {
        activeStartRef.current = performance.now()
      }
    }
  }, [active])

  // Animation loop — drives both fill and stroke-width
  useEffect(() => {
    let mounted = true
    const tick = () => {
      if (!mounted) return
      const now = performance.now()
      const idleMs = now - lastActiveRef.current

      // Fill — primary drive
      if (idleMs < 3_000 && activeStartRef.current !== null) {
        const elapsed = now - activeStartRef.current
        setFill(curve(elapsed))
      } else if (activeStartRef.current !== null) {
        // 3s idle reached — start draining (900ms over current fill value)
        if (drainStartRef.current === null) {
          drainStartRef.current = now
          drainStartFillRef.current = fill
          activeStartRef.current = null
        }
        const drainElapsed = now - drainStartRef.current
        const drainProgress = Math.min(1, drainElapsed / 900)
        setFill(drainStartFillRef.current * (1 - drainProgress))
      }

      // Stroke width — secondary drive (1s smoothed WPM)
      // Exponential moving average with α = 0.05 per frame ≈ 1s window at 60fps
      smoothedWpmRef.current = smoothedWpmRef.current * 0.95 + (active ? wpm : 0) * 0.05
      const w = 1.5 + Math.min(1.5, smoothedWpmRef.current / 80)
      setStrokeWidth(w)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      mounted = false
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, wpm])

  // Path: semicircle from left to right, bottom half.
  // M (CX-RADIUS, CY) A RADIUS RADIUS 0 0 1 (CX+RADIUS, CY) — top half (above CY).
  // We want the bottom half visually (concave-down arc), so flip CY.
  // Use the upper semicircle of a circle centered at (CX, CY): drawn from
  // (4, 60) to (116, 60) via the top.
  const arcPath = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`

  // Fill driven via stroke-dashoffset
  const drawn = ARC_LENGTH * fill
  const offset = ARC_LENGTH - drawn

  const peakWpm = wpm > 90 && active
  const ladderColor = muted ? 'var(--led-mute)' : 'var(--ink-2)'

  return (
    <div className="warmth-arc" aria-hidden="true">
      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="warmth-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="var(--ink-2)" stopOpacity="0.4" />
            <stop offset="80%" stopColor="var(--led-on)" stopOpacity="1" />
            <stop offset="100%" stopColor={peakWpm ? 'var(--led-peak)' : 'var(--led-on)'} stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* Background rail — always visible at very low contrast */}
        <path
          d={arcPath}
          stroke={ladderColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          fill="none"
          opacity={0.18}
        />
        {/* Active fill */}
        {!muted && fill > 0.01 && (
          <path
            d={arcPath}
            stroke={active ? 'url(#warmth-gradient)' : 'var(--ink-2)'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 220ms ease-out, stroke-width 200ms ease' }}
          />
        )}
      </svg>
    </div>
  )
}
