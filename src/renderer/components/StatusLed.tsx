import { useEffect, useState } from 'react'

interface Props {
  active: boolean             // currently typing
  muted: boolean              // sound disabled
  needsPermission: boolean    // shape-encoded as `!` glyph (panel handles inline error)
  finishName: string          // unused in v2.5.1 — kept for potential future readout
}

// ONYX v2.5.1 — Status LED is a PURE STATE INDICATOR. No tooltip, no click action.
// Like the pilot light on a real instrument: you don't poke it for a menu.
//
// State encoded in BOTH color and shape (color-blind safe):
//   idle    → solid disc, --led-dim (pilot-lit, always on)
//   active  → solid disc, --led-on, single 200ms pulse per keystroke
//   muted   → hollow ring, --led-mute, slow breathe
//   warn    → 12px disc with `!` glyph (no blink — seizure-adjacent)
//
// For full state / shortcut / finish info, open the help panel (/ or ⌘?).
export default function StatusLed({
  active, muted, needsPermission,
}: Props) {
  const hasWarning = needsPermission

  // Pulse on each typing activation. CSS animation is one-shot via key remount.
  const [pulseKey, setPulseKey] = useState(0)
  useEffect(() => {
    if (active) setPulseKey((k) => k + 1)
  }, [active])

  const cls = [
    'status-led',
    hasWarning ? 'warn' : muted ? 'muted' : active ? 'active' : '',
  ].filter(Boolean).join(' ')

  return (
    <span
      key={pulseKey}
      className={cls}
      role="status"
      aria-live="polite"
      aria-label={
        needsPermission ? 'Permission required (see panel)' :
        muted           ? 'Sound muted' :
        active          ? 'Sound active' : 'Idle'
      }
    />
  )
}
