import { useEffect, useRef } from 'react'
import { Finish, FINISHES } from '@shared/types'
import type { OutputInfo } from '../hooks/useAudioEngine'

interface Props {
  finish: Finish
  onFinishChange: (f: Finish) => void
  outputInfo: OutputInfo | null
  onClose: () => void
}

const SHORTCUTS: { keys: string; use: string }[] = [
  { keys: '← →',     use: 'Switch'        },
  { keys: '[  ]',    use: 'Mode'          },
  { keys: 'T',       use: 'Tune drawer'   },
  { keys: '/',       use: 'This panel'    },
  { keys: '⌘?',      use: 'This panel'    },
  { keys: 'Esc',     use: 'Close drawer'  },
  { keys: '⇧⌘K',     use: 'Mute'          },
  { keys: '⌥⌘K',     use: 'Toggle window' },
]

// ONYX v2.2 — Help panel as "service mode" (no shadow / no blur — same chassis,
// same hairlines, just different content). Finish picker grouped Auto / Dark / Light
// to cut Hick's Law load.
export default function HelpPanel({ finish, onFinishChange, outputInfo, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<Element | null>(null)

  // Capture the element that had focus when the panel opened — restore on close
  useEffect(() => {
    triggerRef.current = document.activeElement
    // Move initial focus into the panel so keyboard users can act immediately
    const first = ref.current?.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')
    first?.focus()
    return () => {
      // Restore focus to the triggering button (typically .slash-key) on unmount
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus()
    }
  }, [])

  // Focus trap — Tab cycles within the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return
      const focusable = Array.from(
        ref.current.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Dismiss on outside click (but not on the help-button itself — its toggle handles that)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return
      if (ref.current.contains(e.target as Node)) return
      const target = e.target as HTMLElement
      if (target.closest('.slash-key')) return
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const auto = FINISHES.find((f) => f.id === 'auto')!
  const darks = FINISHES.filter((f) => f.tone === 'dark')
  const lights = FINISHES.filter((f) => f.tone === 'light')

  return (
    <div
      ref={ref}
      className="help-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Shortcuts and finish"
    >
      <div>
        <div className="help-section-title">Keyboard</div>
        <div className="help-kbd-list">
          {SHORTCUTS.map((s, i) => (
            <div key={`${s.keys}-${i}`} style={{ display: 'contents' }}>
              <span className="help-kbd">{s.keys}</span>
              <span className="help-kbd-use">{s.use}</span>
            </div>
          ))}
        </div>
      </div>

      <hr className="help-divider" />

      <div>
        <div className="help-section-title">Finish</div>

        <button
          type="button"
          className={`finish-auto${finish === 'auto' ? ' on' : ''}`}
          onClick={() => onFinishChange('auto')}
        >
          {auto.name.split(' · ')[0]}
          <span className="finish-auto-sub">Follows macOS appearance</span>
        </button>

        <div className="finish-group-title">Dark</div>
        <div className="finish-grid">
          {darks.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`finish-btn${finish === f.id ? ' on' : ''}`}
              onClick={() => onFinishChange(f.id)}
              title={f.name}
            >
              {f.name}
            </button>
          ))}
        </div>

        <div className="finish-group-title">Light</div>
        <div className="finish-grid">
          {lights.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`finish-btn${finish === f.id ? ' on' : ''}`}
              onClick={() => onFinishChange(f.id)}
              title={f.name}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      <hr className="help-divider" />

      {/* Instrument readout — diagnostic info, not actionable. Style mirrors a
          rack-unit front-panel status strip (Nagra: `IN 48k · OUT 48k`). */}
      <div className="help-readout">
        <div className="help-readout-row">
          <span className="help-readout-label">Output</span>
          <span className="help-readout-value">
            {outputInfo
              ? `${outputInfo.latencyMs}ms · ${outputInfo.isBluetooth ? 'BT' : 'WIRED'}`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
