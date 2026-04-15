import { useEffect, useState } from 'react'

interface Props {
  active: boolean             // currently typing
  muted: boolean              // sound disabled
  needsPermission: boolean
  bluetoothWarning: boolean
  finishName: string
  onRequestPermission: () => void
}

export default function StatusLed({
  active, muted, needsPermission, bluetoothWarning, finishName, onRequestPermission,
}: Props) {
  const [open, setOpen] = useState(false)
  const hasWarning = needsPermission || bluetoothWarning

  // Pulse on each typing activation. The LED gets the 'active' class for 200ms
  // then falls back to idle — the CSS animation is one-shot.
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
        onMouseEnter={() => hasWarning && setOpen(true)}
        onMouseLeave={() => !needsPermission && setOpen(false)}
        aria-label={
          needsPermission ? 'Permission required' :
          bluetoothWarning ? 'Bluetooth output detected' :
          muted ? 'Sound muted' :
          active ? 'Sound active' : 'Idle'
        }
      />
      {open && (
        <div className="status-tooltip" role="status">
          {needsPermission && (
            <>
              <div>Accessibility permission required to hear keystrokes.</div>
              <div
                className="status-action"
                onClick={(e) => { e.stopPropagation(); onRequestPermission() }}
              >
                Grant access
              </div>
            </>
          )}
          {!needsPermission && bluetoothWarning && (
            <div>Bluetooth output detected. Wired output is recommended for lowest latency.</div>
          )}
          {!needsPermission && !bluetoothWarning && (
            <>
              <div>{muted ? 'Muted · ⇧⌘K' : 'Sound on · ⇧⌘K to mute'}</div>
              <div style={{ marginTop: 4, opacity: 0.7 }}>Finish · {finishName}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
