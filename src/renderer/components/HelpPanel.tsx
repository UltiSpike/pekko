import { useEffect, useRef } from 'react'
import { Finish, FINISHES } from '@shared/types'

interface Props {
  finish: Finish
  onFinishChange: (f: Finish) => void
  onClose: () => void
}

const SHORTCUTS: { keys: string; use: string }[] = [
  { keys: '← →',   use: 'Switch' },
  { keys: '[  ]',  use: 'Mode' },
  { keys: 'T',     use: 'Tune drawer' },
  { keys: 'Esc',   use: 'Close drawer' },
  { keys: '⇧⌘K',   use: 'Mute' },
  { keys: '⌥⌘K',   use: 'Toggle window' },
  { keys: '/',     use: 'This panel' },
]

export default function HelpPanel({ finish, onFinishChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Dismiss on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return
      if (ref.current.contains(e.target as Node)) return
      // Also ignore clicks on the help-button itself (handled by parent toggle)
      const target = e.target as HTMLElement
      if (target.closest('.help-button')) return
      onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const pinned = FINISHES.filter((f) => f.id !== 'auto')

  return (
    <div ref={ref} className="help-panel" role="dialog" aria-label="Shortcuts and finish">
      <div>
        <div className="help-section-title">Keyboard</div>
        <div className="help-kbd-list">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} style={{ display: 'contents' }}>
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
          Auto · Follow system
        </button>
        <div className="finish-grid">
          {pinned.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`finish-btn${finish === f.id ? ' on' : ''}`}
              onClick={() => onFinishChange(f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
