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

type Tab = 'switch' | 'mode'

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
    <div className={`slider-row${disabled ? ' disabled' : ''}`}>
      <span className="slider-label">{label}</span>
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
      <span className="slider-value">{format(value)}</span>
    </div>
  )
}

interface Props {
  presetDsp: SwitchDsp
  effectiveDsp: SwitchDsp
  dspOverride: SwitchDspOverride
  onSwitchDspChange: (override: SwitchDspOverride) => void
  onResetSwitchDsp: () => void

  modeName: string
  isCustomMode: boolean
  bed: BedType
  bedGainDb: number
  style: ModeStyle
  onBedChange: (b: BedType) => void
  onBedGainChange: (db: number) => void
  onStyleChange: (style: ModeStyle) => void
  arcadeEnabled: boolean
  onArcadeEnabledChange: (v: boolean) => void
  onResetMode: () => void

  onClose: () => void
}

const BED_OPTIONS: { id: BedType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'brown', label: 'Brown' },
  { id: 'pink', label: 'Pink' },
]

export default function TuneView({
  presetDsp, effectiveDsp, dspOverride, onSwitchDspChange, onResetSwitchDsp,
  modeName, isCustomMode,
  bed, bedGainDb, style,
  onBedChange, onBedGainChange, onStyleChange,
  arcadeEnabled, onArcadeEnabledChange,
  onResetMode,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('switch')

  const patchStyle = (partial: Partial<ModeStyle>) => onStyleChange({ ...style, ...partial })

  const patchDsp = (field: keyof SwitchDspOverride, value: number) => {
    const next: SwitchDspOverride = { ...dspOverride }
    if (Math.abs(value - (presetDsp[field] as number)) < 1e-6) delete next[field]
    else next[field] = value
    onSwitchDspChange(next)
  }

  const currentFlavorId = getCurrentFlavorId(dspOverride, presetDsp)
  const overrideDirty = Object.keys(dspOverride).length > 0
  const pickFlavor = (flavorId: string) => {
    const flavor = FLAVORS.find((f) => f.id === flavorId)
    if (!flavor) return
    onSwitchDspChange(flavor.apply(presetDsp))
  }

  const activeResetFn = tab === 'switch' ? onResetSwitchDsp : onResetMode
  const resetDisabled = tab === 'switch' ? !overrideDirty : !isCustomMode

  return (
    <div className="tune-drawer">
      <div className="drawer-header">
        <span className="drawer-title">Tune</span>
        <div
          className="drawer-tabs"
          role="tablist"
          aria-label="Tune sections"
          onKeyDown={(e) => {
            // Arrow keys cycle tabs when focus is on a tab — App's ←/→ profile
            // listener defers to us because the active element matches [role="tab"].
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault()
              setTab(tab === 'switch' ? 'mode' : 'switch')
            }
          }}
        >
          <button
            role="tab"
            tabIndex={tab === 'switch' ? 0 : -1}
            aria-selected={tab === 'switch'}
            aria-controls="tune-tabpanel"
            className={`drawer-tab${tab === 'switch' ? ' on' : ''}`}
            onClick={() => setTab('switch')}
          >
            Switch
          </button>
          <button
            role="tab"
            tabIndex={tab === 'mode' ? 0 : -1}
            aria-selected={tab === 'mode'}
            aria-controls="tune-tabpanel"
            className={`drawer-tab${tab === 'mode' ? ' on' : ''}`}
            onClick={() => setTab('mode')}
          >
            Mode
          </button>
        </div>
      </div>
      <div className="drawer-tab-sub" aria-hidden="true">
        {tab === 'switch' ? 'Sample + DSP' : 'Soundscape'}
      </div>

      <div className="drawer-body" id="tune-tabpanel" role="tabpanel">
        {tab === 'switch' ? (
          <>
            <div className="preset-chips">
              {FLAVORS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`preset-chip${f.id === currentFlavorId ? ' on' : ''}`}
                  onClick={() => pickFlavor(f.id)}
                  title={f.description}
                >
                  {f.name}
                </button>
              ))}
              {currentFlavorId === 'custom' && (
                <span className="preset-chip on" style={{ pointerEvents: 'none' }}>Custom</span>
              )}
            </div>

            <SliderRow
              label="Body"
              value={effectiveDsp.bodyPeakDb}
              min={SWITCH_DSP_RANGE.bodyPeakDb.min}
              max={SWITCH_DSP_RANGE.bodyPeakDb.max}
              step={SWITCH_DSP_RANGE.bodyPeakDb.step}
              format={(v) => `+${v.toFixed(1)} dB`}
              onChange={(v) => patchDsp('bodyPeakDb', v)}
            />
            <SliderRow
              label="Spring"
              value={effectiveDsp.springNotchDb}
              min={SWITCH_DSP_RANGE.springNotchDb.min}
              max={SWITCH_DSP_RANGE.springNotchDb.max}
              step={SWITCH_DSP_RANGE.springNotchDb.step}
              format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
              onChange={(v) => patchDsp('springNotchDb', v)}
            />
            <SliderRow
              label="Transient"
              value={effectiveDsp.transientDb}
              min={SWITCH_DSP_RANGE.transientDb.min}
              max={SWITCH_DSP_RANGE.transientDb.max}
              step={SWITCH_DSP_RANGE.transientDb.step}
              format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
              onChange={(v) => patchDsp('transientDb', v)}
            />
            <SliderRow
              label="Release"
              value={effectiveDsp.topDownBalanceDb}
              min={SWITCH_DSP_RANGE.topDownBalanceDb.min}
              max={SWITCH_DSP_RANGE.topDownBalanceDb.max}
              step={SWITCH_DSP_RANGE.topDownBalanceDb.step}
              format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
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
          </>
        ) : (
          <>
            {!isCustomMode && (
              <div className="mode-hint">
                Mode preset <strong>{modeName}</strong> is curated. Switch to <strong>Custom</strong> mode to edit bed &amp; EQ.
              </div>
            )}

            <div className="slider-row">
              <span className="slider-label">Bed</span>
              <div className="bed-chips" style={{ gridColumn: '2 / span 2' }}>
                {BED_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`bed-chip${o.id === bed ? ' on' : ''}`}
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
              format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} dB`}
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
              label="Vol jitter"
              value={style.volumeJitter}
              min={CUSTOM_RANGE.volumeJitter.min}
              max={CUSTOM_RANGE.volumeJitter.max}
              step={CUSTOM_RANGE.volumeJitter.step}
              format={(v) => `±${Math.round(v * 100)}%`}
              disabled={!isCustomMode}
              onChange={(v) => patchStyle({ volumeJitter: v })}
            />

            <div className={`slider-row${!isCustomMode ? ' disabled' : ''}`}>
              <span className="slider-label">Arcade feedback</span>
              <div style={{ gridColumn: '2 / span 2', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={arcadeEnabled}
                  disabled={!isCustomMode}
                  onChange={(e) => onArcadeEnabledChange(e.target.checked)}
                />
                <span className="slider-value" style={{ fontSize: '0.72rem', opacity: 0.6 }}>
                  Combo-driven overlay · tray pulse · built for sprints
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="drawer-footer">
        <button
          type="button"
          className="drawer-btn"
          disabled={resetDisabled}
          onClick={activeResetFn}
          style={{ opacity: resetDisabled ? 0.35 : 1 }}
        >
          Reset
        </button>
        <button type="button" className="drawer-btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
