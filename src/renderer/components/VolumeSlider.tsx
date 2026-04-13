interface Props {
  volume: number
  onChange: (v: number) => void
}

export default function VolumeSlider({ volume, onChange }: Props) {
  const pct = Math.round(volume * 100)

  return (
    <div className="volume-slider">
      <div className="volume-header">
        <span className="volume-label">VOL</span>
        <span className="volume-value">{pct}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={pct}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseInt(e.target.value) / 100)}
      />
    </div>
  )
}
