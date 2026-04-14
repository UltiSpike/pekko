import { BedType, ModeStyle, CUSTOM_RANGE } from '@shared/modes'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="tune-row">
      <div className="tune-row-head">
        <span className="tune-label">{label}</span>
        <span className="tune-value">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

interface Props {
  bed: BedType
  bedGainDb: number
  style: ModeStyle
  onBedChange: (b: BedType) => void
  onBedGainChange: (db: number) => void
  onStyleChange: (style: ModeStyle) => void
  onReset: () => void
  onClose: () => void
}

const BED_OPTIONS: { id: BedType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'brown', label: 'Brown' },
  { id: 'pink', label: 'Pink' },
]

export default function TuneView({
  bed, bedGainDb, style,
  onBedChange, onBedGainChange, onStyleChange, onReset, onClose,
}: Props) {
  const patch = (partial: Partial<ModeStyle>) => onStyleChange({ ...style, ...partial })

  return (
    <div className="tune-view">
      <div className="tune-header">
        <button className="tune-back" onClick={onClose} aria-label="Back">{'\u2039'}</button>
        <h2 className="tune-title">Tune</h2>
        <button className="tune-reset" onClick={onReset}>Reset</button>
      </div>

      <div className="tune-body">
        <div className="tune-section">
          <div className="tune-section-label">Bed</div>
          <div className="tune-bed-options">
            {BED_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`tune-bed-chip${o.id === bed ? ' on' : ''}`}
                onClick={() => onBedChange(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {bed !== 'none' && (
          <SliderRow
            label="Bed level"
            value={bedGainDb}
            min={CUSTOM_RANGE.bedGainDb.min}
            max={CUSTOM_RANGE.bedGainDb.max}
            step={CUSTOM_RANGE.bedGainDb.step}
            format={(v) => `${v.toFixed(0)} dB`}
            onChange={onBedGainChange}
          />
        )}

        <SliderRow
          label="Low shelf"
          value={style.lowShelfDb}
          min={CUSTOM_RANGE.lowShelfDb.min}
          max={CUSTOM_RANGE.lowShelfDb.max}
          step={CUSTOM_RANGE.lowShelfDb.step}
          format={(v) => `+${v.toFixed(1)} dB`}
          onChange={(v) => patch({ lowShelfDb: v })}
        />

        <SliderRow
          label="Wet mix"
          value={style.wetMix}
          min={CUSTOM_RANGE.wetMix.min}
          max={CUSTOM_RANGE.wetMix.max}
          step={CUSTOM_RANGE.wetMix.step}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => patch({ wetMix: v })}
        />

        <SliderRow
          label="Air LPF"
          value={style.airLpfHz}
          min={CUSTOM_RANGE.airLpfHz.min}
          max={CUSTOM_RANGE.airLpfHz.max}
          step={CUSTOM_RANGE.airLpfHz.step}
          format={(v) => `${(v / 1000).toFixed(1)} kHz`}
          onChange={(v) => patch({ airLpfHz: v })}
        />

        <SliderRow
          label="High shelf"
          value={style.highShelfDb}
          min={CUSTOM_RANGE.highShelfDb.min}
          max={CUSTOM_RANGE.highShelfDb.max}
          step={CUSTOM_RANGE.highShelfDb.step}
          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} dB`}
          onChange={(v) => patch({ highShelfDb: v })}
        />

        <SliderRow
          label="Pitch jitter"
          value={style.pitchJitter}
          min={CUSTOM_RANGE.pitchJitter.min}
          max={CUSTOM_RANGE.pitchJitter.max}
          step={CUSTOM_RANGE.pitchJitter.step}
          format={(v) => `±${(v * 100).toFixed(1)}%`}
          onChange={(v) => patch({ pitchJitter: v })}
        />

        <SliderRow
          label="Volume jitter"
          value={style.volumeJitter}
          min={CUSTOM_RANGE.volumeJitter.min}
          max={CUSTOM_RANGE.volumeJitter.max}
          step={CUSTOM_RANGE.volumeJitter.step}
          format={(v) => `±${Math.round(v * 100)}%`}
          onChange={(v) => patch({ volumeJitter: v })}
        />
      </div>

      <div className="tune-footer">Type anywhere to preview — changes are live.</div>
    </div>
  )
}
