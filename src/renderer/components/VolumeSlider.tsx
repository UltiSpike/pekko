interface Props {
  volume: number
  onChange: (v: number) => void
}

const TICKS = [0, 25, 50, 75, 100]

export default function VolumeSlider({ volume, onChange }: Props) {
  const pct = Math.round(volume * 100)

  return (
    <div className="fader">
      <span className="fader-label">Vol</span>
      <div className="fader-track">
        <div className="fader-ticks" aria-hidden="true">
          {TICKS.map((t) => (
            <span
              key={t}
              className={`fader-tick ${t === 0 || t === 50 || t === 100 ? 'major' : ''}`}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          style={{ '--fill': `${pct}%` } as React.CSSProperties}
          onChange={(e) => onChange(parseInt(e.target.value) / 100)}
          aria-label="Volume"
          aria-valuetext={`${pct} percent`}
        />
      </div>
      <span className="fader-value">{pct}</span>
    </div>
  )
}
