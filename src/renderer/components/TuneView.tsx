import { useState } from 'react'
import {
  BedType,
  ModeStyle,
  CUSTOM_RANGE,
  SwitchDsp,
  SwitchDspOverride,
  SWITCH_DSP_RANGE,
  FLAVORS,
  getCurrentFlavorId,
} from '@shared/modes'

type Tab = 'flavor' | 'pro'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
}

function SliderRow({ label, value, min, max, step, format, onChange, disabled }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={`tune-row${disabled ? ' disabled' : ''}`}>
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
        disabled={disabled}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

interface Props {
  // Switch character (always editable)
  profileName: string
  presetDsp: SwitchDsp
  effectiveDsp: SwitchDsp
  dspOverride: SwitchDspOverride
  onSwitchDspChange: (override: SwitchDspOverride) => void
  onResetSwitchDsp: () => void

  // Mode style (editable only when in custom mode)
  modeName: string
  isCustomMode: boolean
  bed: BedType
  bedGainDb: number
  style: ModeStyle
  onBedChange: (b: BedType) => void
  onBedGainChange: (db: number) => void
  onStyleChange: (style: ModeStyle) => void
  onResetMode: () => void

  onClose: () => void
}

const BED_OPTIONS: { id: BedType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'brown', label: 'Brown' },
  { id: 'pink', label: 'Pink' },
]

export default function TuneView({
  profileName, presetDsp, effectiveDsp, dspOverride, onSwitchDspChange, onResetSwitchDsp,
  modeName, isCustomMode,
  bed, bedGainDb, style,
  onBedChange, onBedGainChange, onStyleChange, onResetMode,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('flavor')

  const patchStyle = (partial: Partial<ModeStyle>) => onStyleChange({ ...style, ...partial })

  // Patch a single DSP field (Pro view). Drop the field if user lands on the preset value
  // so the saved override stays minimal and tracks future preset evolution.
  const patchDsp = (field: keyof SwitchDspOverride, value: number) => {
    const next: SwitchDspOverride = { ...dspOverride }
    if (Math.abs(value - (presetDsp[field] as number)) < 1e-6) delete next[field]
    else next[field] = value
    onSwitchDspChange(next)
  }

  const currentFlavorId = getCurrentFlavorId(dspOverride, presetDsp)

  const pickFlavor = (flavorId: string) => {
    const flavor = FLAVORS.find((f) => f.id === flavorId)
    if (!flavor) return
    onSwitchDspChange(flavor.apply(presetDsp))
  }

  return (
    <div className="tune-view">
      <div className="tune-header">
        <button className="tune-back" onClick={onClose} aria-label="Back">{'\u2039'}</button>
        <h2 className="tune-title">{profileName}</h2>
        <span className="tune-header-spacer" />
      </div>

      <div className="tune-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'flavor'}
          className={`tune-tab${tab === 'flavor' ? ' on' : ''}`}
          onClick={() => setTab('flavor')}
        >
          Flavor
        </button>
        <button
          role="tab"
          aria-selected={tab === 'pro'}
          className={`tune-tab${tab === 'pro' ? ' on' : ''}`}
          onClick={() => setTab('pro')}
        >
          Pro
        </button>
      </div>

      <div className="tune-body">
        {tab === 'flavor' ? (
          <div className="flavor-grid">
            {FLAVORS.map((f) => {
              const active = f.id === currentFlavorId
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`flavor-card${active ? ' on' : ''}`}
                  onClick={() => pickFlavor(f.id)}
                >
                  <div className="flavor-card-name">{f.name}</div>
                  <div className="flavor-card-desc">{f.description}</div>
                  {active && <span className="flavor-card-dot" aria-hidden="true" />}
                </button>
              )
            })}
            {currentFlavorId === 'custom' && (
              <div className="flavor-custom-note">
                <span>Custom voicing</span>
                <button className="flavor-revert" onClick={onResetSwitchDsp}>Revert to Stock</button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* === Switch character — Pro sliders === */}
            <div className="tune-section">
              <div className="tune-section-head">
                <div className="tune-section-label">Switch DSP</div>
                {Object.keys(dspOverride).length > 0 && (
                  <button className="tune-section-reset" onClick={onResetSwitchDsp}>Reset switch</button>
                )}
              </div>

              <SliderRow
                label="Body"
                value={effectiveDsp.bodyPeakDb}
                min={SWITCH_DSP_RANGE.bodyPeakDb.min}
                max={SWITCH_DSP_RANGE.bodyPeakDb.max}
                step={SWITCH_DSP_RANGE.bodyPeakDb.step}
                format={(v) => `+${v.toFixed(2)} dB @ ${Math.round(presetDsp.bodyPeakHz)}Hz`}
                onChange={(v) => patchDsp('bodyPeakDb', v)}
              />
              <SliderRow
                label="Spring"
                value={effectiveDsp.springNotchDb}
                min={SWITCH_DSP_RANGE.springNotchDb.min}
                max={SWITCH_DSP_RANGE.springNotchDb.max}
                step={SWITCH_DSP_RANGE.springNotchDb.step}
                format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB @ 2.5kHz`}
                onChange={(v) => patchDsp('springNotchDb', v)}
              />
              <SliderRow
                label="Transient"
                value={effectiveDsp.transientDb}
                min={SWITCH_DSP_RANGE.transientDb.min}
                max={SWITCH_DSP_RANGE.transientDb.max}
                step={SWITCH_DSP_RANGE.transientDb.step}
                format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} dB`}
                onChange={(v) => patchDsp('transientDb', v)}
              />
              <SliderRow
                label="Top / down"
                value={effectiveDsp.topDownBalanceDb}
                min={SWITCH_DSP_RANGE.topDownBalanceDb.min}
                max={SWITCH_DSP_RANGE.topDownBalanceDb.max}
                step={SWITCH_DSP_RANGE.topDownBalanceDb.step}
                format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB release`}
                onChange={(v) => patchDsp('topDownBalanceDb', v)}
              />
              <SliderRow
                label="Decay"
                value={effectiveDsp.decayScale}
                min={SWITCH_DSP_RANGE.decayScale.min}
                max={SWITCH_DSP_RANGE.decayScale.max}
                step={SWITCH_DSP_RANGE.decayScale.step}
                format={(v) => `${v.toFixed(2)}×`}
                onChange={(v) => patchDsp('decayScale', v)}
              />
            </div>

            {/* === Mode style — only meaningful in Custom mode === */}
            <div className="tune-section">
              <div className="tune-section-head">
                <div className="tune-section-label">Mode · {modeName}</div>
                {isCustomMode && (
                  <button className="tune-section-reset" onClick={onResetMode}>Reset mode</button>
                )}
              </div>

              {!isCustomMode && (
                <div className="tune-mode-hint">
                  Switch to <strong>Custom</strong> mode to tune bed &amp; EQ.
                </div>
              )}

              <div className={isCustomMode ? '' : 'tune-locked'}>
                <div className="tune-row">
                  <div className="tune-row-head">
                    <span className="tune-label">Bed</span>
                  </div>
                  <div className="tune-bed-options">
                    {BED_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`tune-bed-chip${o.id === bed ? ' on' : ''}`}
                        disabled={!isCustomMode}
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
                    disabled={!isCustomMode}
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
                  disabled={!isCustomMode}
                  onChange={(v) => patchStyle({ lowShelfDb: v })}
                />
                <SliderRow
                  label="Wet mix"
                  value={style.wetMix}
                  min={CUSTOM_RANGE.wetMix.min}
                  max={CUSTOM_RANGE.wetMix.max}
                  step={CUSTOM_RANGE.wetMix.step}
                  format={(v) => `${Math.round(v * 100)}%`}
                  disabled={!isCustomMode}
                  onChange={(v) => patchStyle({ wetMix: v })}
                />
                <SliderRow
                  label="Air LPF"
                  value={style.airLpfHz}
                  min={CUSTOM_RANGE.airLpfHz.min}
                  max={CUSTOM_RANGE.airLpfHz.max}
                  step={CUSTOM_RANGE.airLpfHz.step}
                  format={(v) => `${(v / 1000).toFixed(1)} kHz`}
                  disabled={!isCustomMode}
                  onChange={(v) => patchStyle({ airLpfHz: v })}
                />
                <SliderRow
                  label="High shelf"
                  value={style.highShelfDb}
                  min={CUSTOM_RANGE.highShelfDb.min}
                  max={CUSTOM_RANGE.highShelfDb.max}
                  step={CUSTOM_RANGE.highShelfDb.step}
                  format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} dB`}
                  disabled={!isCustomMode}
                  onChange={(v) => patchStyle({ highShelfDb: v })}
                />
                <SliderRow
                  label="Pitch jitter"
                  value={style.pitchJitter}
                  min={CUSTOM_RANGE.pitchJitter.min}
                  max={CUSTOM_RANGE.pitchJitter.max}
                  step={CUSTOM_RANGE.pitchJitter.step}
                  format={(v) => `±${(v * 100).toFixed(1)}%`}
                  disabled={!isCustomMode}
                  onChange={(v) => patchStyle({ pitchJitter: v })}
                />
                <SliderRow
                  label="Volume jitter"
                  value={style.volumeJitter}
                  min={CUSTOM_RANGE.volumeJitter.min}
                  max={CUSTOM_RANGE.volumeJitter.max}
                  step={CUSTOM_RANGE.volumeJitter.step}
                  format={(v) => `±${Math.round(v * 100)}%`}
                  disabled={!isCustomMode}
                  onChange={(v) => patchStyle({ volumeJitter: v })}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="tune-footer">Type anywhere to preview — changes are live.</div>
    </div>
  )
}
