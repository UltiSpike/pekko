import { useEffect, useState } from 'react'

interface Props {
  active: boolean             // currently typing
  muted: boolean              // sound disabled
  needsPermission: boolean    // shape-encoded as `!` glyph (panel handles inline error)
  finishName: string
}

// ONYX v2.5 — Status LED. Always pilot-lit (--led-dim @ idle).
// State encoded in BOTH color and shape (color-blind safe):
//   idle    → solid disc, --led-dim
//   active  → solid disc, --led-on, single 200ms pulse
//   muted   → hollow ring, --led-mute, slow breathe
//   warn    → 12px disc with `!` glyph (no blink — seizure-adjacent)
//
// Warn = permission only. Bluetooth latency is an info readout in the help
// panel (v2.5 — previously also triggered warn, felt paternalistic).
export default function StatusLed({
  active, muted, needsPermission, finishName,
}: Props) {
  const [open, setOpen] = useState(false)
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
    <div style={{ position: 'relative' }}>
      <button
        key={pulseKey}
        className={cls}
        onClick={() => setOpen((o) => !o)}
        aria-label={
          needsPermission ? 'Permission required (see panel)' :
          muted           ? 'Sound muted' :
          active          ? 'Sound active' : 'Idle'
        }
      />
      {open && !hasWarning && (
        <div className="status-tooltip" role="tooltip">
          <div>{muted ? 'Muted — press ⇧⌘K to unmute' : 'Sound on — ⇧⌘K to mute'}</div>
          <div style={{ marginTop: 4, opacity: 0.7 }}>Finish · {finishName}</div>
        </div>
      )}
    </div>
  )
}
