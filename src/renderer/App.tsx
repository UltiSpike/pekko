import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useProfiles } from './hooks/useProfiles'
import VolumeSlider from './components/VolumeSlider'
import LedLadder from './components/LedLadder'
import DspWarmthArc from './components/DspWarmthArc'
import StatusLed from './components/StatusLed'
import HelpPanel from './components/HelpPanel'
import TuneView from './components/TuneView'
import {
  MODES,
  DEFAULT_MODE_ID,
  DEFAULT_CUSTOM_STYLE,
  DEFAULT_CUSTOM_BED,
  DEFAULT_CUSTOM_BED_GAIN_DB,
  DEFAULT_SWITCH_DSP,
  buildCustomMode,
  resolveSwitchDsp,
  BedType,
  ModeStyle,
  SwitchDspOverride,
} from '@shared/modes'
import { Finish, FINISHES } from '@shared/types'
import { playDrawerOpen, playDrawerClose, playMuteToggle } from './audio/uiSounds'
import './App.css'

const hasApi = typeof window !== 'undefined' && !!window.api
const MODE_IDS = [...MODES.map(m => m.id), 'custom']
const META_REVEAL_MS = 1500

export default function App() {
  const { profiles, loading } = useProfiles()
  const [activeProfile, setActiveProfile] = useState('cherrymx-black-abs')
  const [volume, setVolume] = useState(0.7)
  const [hasPermission, setHasPermission] = useState(true)
  const [mode, setMode] = useState<string>(DEFAULT_MODE_ID)

  const [customBed, setCustomBed] = useState<BedType>(DEFAULT_CUSTOM_BED)
  const [customBedGainDb, setCustomBedGainDb] = useState<number>(DEFAULT_CUSTOM_BED_GAIN_DB)
  const [customStyle, setCustomStyle] = useState<ModeStyle>({ ...DEFAULT_CUSTOM_STYLE })

  const [switchDspOverrides, setSwitchDspOverrides] = useState<Record<string, SwitchDspOverride>>({})

  const [isTuning, setIsTuning] = useState(false)
  const [finish, setFinish] = useState<Finish>('auto')
  const [helpOpen, setHelpOpen] = useState(false)
  const [metaVisible, setMetaVisible] = useState(false)
  // Warmup state machine: 'pending' = waiting for permission; 'running' = animation in flight;
  // 'idle' = done. On first launch with no permission, stays pending until grant; on subsequent
  // launches with permission, plays once on mount.
  const [warmupPhase, setWarmupPhase] = useState<'pending' | 'running' | 'idle'>('pending')
  const [shuttingDown, setShuttingDown] = useState(false)
  const warmupPlayedRef = useRef(false)
  const [uiSounds, setUiSounds] = useState(false)
  const lastSoundEnabledRef = useRef(true)
  const metaTimerRef = useRef<number | null>(null)

  const activeMode = useMemo(() => {
    if (mode === 'custom') return buildCustomMode(customStyle, customBed, customBedGainDb)
    return MODES.find(m => m.id === mode) ?? MODES[0]
  }, [mode, customStyle, customBed, customBedGainDb])

  const activeProfileObj = profiles.find(p => p.id === activeProfile)
  const presetDsp = activeProfileObj?.dsp ?? DEFAULT_SWITCH_DSP
  const overrideForActive = switchDspOverrides[activeProfile]
  const effectiveDsp = useMemo(
    () => resolveSwitchDsp(activeProfileObj?.dsp, overrideForActive),
    [activeProfileObj, overrideForActive]
  )

  const { bluetoothWarning, soundEnabled, wpm, typingActive } = useAudioEngine(activeProfile, volume, activeMode, effectiveDsp)

  // Reveal meta line briefly after keyboard navigation
  const flashMeta = useCallback(() => {
    setMetaVisible(true)
    if (metaTimerRef.current) window.clearTimeout(metaTimerRef.current)
    metaTimerRef.current = window.setTimeout(() => setMetaVisible(false), META_REVEAL_MS)
  }, [])

  useEffect(() => {
    if (!hasApi) return
    window.api.getSettings().then((s) => {
      setActiveProfile(s.activeProfile)
      setVolume(s.volume)
      if (s.mode) setMode(s.mode)
      if (typeof s.isTuning === 'boolean') setIsTuning(s.isTuning)
      if (s.finish) setFinish(s.finish)
      if (typeof s.uiSounds === 'boolean') setUiSounds(s.uiSounds)
      if (s.customBed) setCustomBed(s.customBed)
      if (typeof s.customBedGainDb === 'number') setCustomBedGainDb(s.customBedGainDb)
      if (s.customStyle) setCustomStyle(s.customStyle)
      if (s.switchDspOverrides) setSwitchDspOverrides(s.switchDspOverrides)
    }).catch(console.error)
  }, [])

  // Apply finish to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-finish', finish)
  }, [finish])

  // Warmup gate — play once when permission is OK. On first launch with no
  // permission this defers until grant; on subsequent launches it fires immediately.
  useEffect(() => {
    if (warmupPlayedRef.current) return
    if (warmupPhase !== 'pending') return
    if (!hasPermission) return
    warmupPlayedRef.current = true
    setWarmupPhase('running')
    const t = window.setTimeout(() => setWarmupPhase('idle'), 920)
    return () => clearTimeout(t)
  }, [hasPermission, warmupPhase])

  // Shutdown — main process tells us before hiding. Add .shutting class for 400ms.
  useEffect(() => {
    if (!hasApi) return
    window.api.onBeforeHide?.(() => {
      setShuttingDown(true)
      window.setTimeout(() => setShuttingDown(false), 420)
    })
  }, [])

  useEffect(() => {
    if (!hasApi) return
    const check = () => window.api.checkPermissions().then(setHasPermission).catch(() => {})
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!hasApi) return
    window.api.onProfileChanged((id) => { setActiveProfile(id); flashMeta() })
    window.api.onVolumeChanged(setVolume)
    window.api.onFinishChanged((f) => setFinish(f as Finish))
    window.api.onUiSoundsChanged((enabled) => setUiSounds(enabled))
  }, [flashMeta])

  // UI sound: mute toggle. Driven by the soundEnabled signal coming from
  // useAudioEngine — fires once per state change, after Warmup completes.
  useEffect(() => {
    if (!uiSounds || warmupPhase !== 'idle') {
      lastSoundEnabledRef.current = soundEnabled
      return
    }
    if (lastSoundEnabledRef.current !== soundEnabled) {
      lastSoundEnabledRef.current = soundEnabled
      try { playMuteToggle() } catch { /* AudioContext gated, ignore */ }
    }
  }, [soundEnabled, uiSounds, warmupPhase])

  const handleProfileChange = useCallback(async (id: string) => {
    setActiveProfile(id)
    flashMeta()
    if (hasApi) await window.api.setProfile(id)
  }, [flashMeta])

  const handleVolumeChange = async (v: number) => {
    setVolume(v)
    if (hasApi) await window.api.setVolume(v)
  }

  const handleModeChange = useCallback(async (id: string) => {
    setMode(id)
    if (hasApi) await window.api.setMode(id)
  }, [])

  const handleTuningChange = useCallback(async (next: boolean) => {
    setIsTuning(next)
    if (uiSounds) {
      try { next ? playDrawerOpen() : playDrawerClose() } catch { /* ignore */ }
    }
    if (hasApi) await window.api.setIsTuning(next)
  }, [uiSounds])

  // Hero gets opacity 1→0→1 around finish swap to avoid text-shadow values
  // ghost-strobing through illegible mid-states during the 320ms cross-dissolve.
  const [heroBlackout, setHeroBlackout] = useState(false)
  const handleFinishChange = useCallback(async (next: Finish) => {
    setHeroBlackout(true)
    // Defer the actual finish swap by one frame so the blackout class lands first
    requestAnimationFrame(() => {
      setFinish(next)
      window.setTimeout(() => setHeroBlackout(false), 200)
    })
    if (hasApi) await window.api.setFinish(next)
  }, [])

  const persistCustom = useCallback(async (bed: BedType, bedGainDb: number, style: ModeStyle) => {
    if (!hasApi) return
    await window.api.setCustomConfig({ bed, bedGainDb, style })
  }, [])

  const handleCustomStyleChange = useCallback((style: ModeStyle) => {
    setCustomStyle(style)
    persistCustom(customBed, customBedGainDb, style)
  }, [customBed, customBedGainDb, persistCustom])

  const handleCustomBedChange = useCallback((bed: BedType) => {
    setCustomBed(bed)
    persistCustom(bed, customBedGainDb, customStyle)
  }, [customBedGainDb, customStyle, persistCustom])

  const handleCustomBedGainChange = useCallback((db: number) => {
    setCustomBedGainDb(db)
    persistCustom(customBed, db, customStyle)
  }, [customBed, customStyle, persistCustom])

  const resetCustom = useCallback(() => {
    const bed = DEFAULT_CUSTOM_BED
    const gain = DEFAULT_CUSTOM_BED_GAIN_DB
    const style = { ...DEFAULT_CUSTOM_STYLE }
    setCustomBed(bed)
    setCustomBedGainDb(gain)
    setCustomStyle(style)
    persistCustom(bed, gain, style)
  }, [persistCustom])

  const handleSwitchDspChange = useCallback((override: SwitchDspOverride) => {
    setSwitchDspOverrides((prev) => ({ ...prev, [activeProfile]: override }))
    if (hasApi) window.api.setSwitchDspOverride(activeProfile, override)
  }, [activeProfile])

  const resetSwitchDsp = useCallback(() => {
    setSwitchDspOverrides((prev) => {
      const next = { ...prev }
      delete next[activeProfile]
      return next
    })
    if (hasApi) window.api.setSwitchDspOverride(activeProfile, {})
  }, [activeProfile])

  const activeData = profiles.find(p => p.id === activeProfile)
  const activeIndex = profiles.findIndex(p => p.id === activeProfile)
  const typeBadge = activeData?.type?.toUpperCase()
  const isHQ = activeProfile.startsWith('cherrymx-') || activeProfile.startsWith('topre-purple') || activeProfile === 'nk-cream'
  // warn = anything that should surface inline. Hides DSP arc / ladder / fader
  // until resolved so the user sees the problem AND its recovery action front-and-center.
  const hasWarning = !hasPermission || bluetoothWarning

  const cycleProfile = useCallback((dir: number) => {
    if (profiles.length === 0 || activeIndex === -1) return
    const next = (activeIndex + dir + profiles.length) % profiles.length
    handleProfileChange(profiles[next].id)
  }, [profiles, activeIndex, handleProfileChange])

  const modeIdx = MODE_IDS.indexOf(mode)
  const cycleMode = useCallback((dir: number) => {
    const next = (modeIdx + dir + MODE_IDS.length) % MODE_IDS.length
    handleModeChange(MODE_IDS[next])
  }, [modeIdx, handleModeChange])

  // Keyboard — ← → switch, [ ] mode, T drawer, / or ⌘? help, Esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘? (macOS-native help) — allow even though meta is held
      if ((e.metaKey || e.ctrlKey) && e.key === '?') {
        e.preventDefault()
        setHelpOpen((o) => !o)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Don't hijack keystrokes in inputs (sliders exist; if a text field is added later, still safe)
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
        if (e.key !== 'Escape') return
      }
      // Defer ←/→ to a focused [role="tab"] (drawer tabs handle their own arrow nav).
      // Without this, App would cycle profile while the user tries to switch tabs.
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t?.getAttribute('role') === 'tab') return
      if (e.key === 'ArrowLeft') cycleProfile(-1)
      else if (e.key === 'ArrowRight') cycleProfile(1)
      else if (e.key === '[') cycleMode(-1)
      else if (e.key === ']') cycleMode(1)
      else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        handleTuningChange(!isTuning)
      } else if (e.key === '/' || e.key === '?') {
        e.preventDefault()
        setHelpOpen((o) => !o)
      } else if (e.key === 'Escape') {
        if (helpOpen) setHelpOpen(false)
        else if (isTuning) handleTuningChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleProfile, cycleMode, isTuning, helpOpen, handleTuningChange])

  const appCls = [
    'app',
    warmupPhase === 'running' && 'warming',
    shuttingDown && 'shutting',
  ].filter(Boolean).join(' ')

  return (
    <div className={appCls}>
      {/* Top plate — help button, status LED */}
      <div className="top-plate">
        <div className="help-wrap">
          {/* Slash Notch — the geometric silhouette of the `/` key as a 10×1px
              hairline tilted 22.5°. One visual, transparent feel, teaches its
              own shortcut by rotating to vertical when help is open. Tune has
              no visible hint — T keyboard only (discoverable via help panel). */}
          <button
            className={`slash-notch${helpOpen ? ' on' : ''}`}
            onClick={() => setHelpOpen((o) => !o)}
            aria-label="Shortcuts and finish"
            aria-expanded={helpOpen}
            title="Shortcuts and finish (/)"
          />
          <StatusLed
            active={typingActive && soundEnabled}
            muted={!soundEnabled}
            needsPermission={!hasPermission}
            bluetoothWarning={bluetoothWarning}
            finishName={FINISHES.find(f => f.id === finish)?.name ?? finish}
          />
        </div>
      </div>

      {helpOpen && (
        <HelpPanel
          finish={finish}
          onFinishChange={handleFinishChange}
          onClose={() => setHelpOpen(false)}
        />
      )}

      {!helpOpen && <>
      {/* Mode chip */}
      <div className="mode-block">
        <button className="mode-nav" onClick={() => cycleMode(-1)} aria-label="Previous mode">{'\u2039'}</button>
        <div className="mode-chip">{activeMode.name}</div>
        <button className="mode-nav" onClick={() => cycleMode(1)} aria-label="Next mode">{'\u203a'}</button>
      </div>

      {/* Switch hero */}
      <div className="switch-block">
        {loading ? (
          <div className="loading">Loading</div>
        ) : activeData ? (
          <>
            <div className={`switch-name${heroBlackout ? ' swap-blackout' : ''}`}>{activeData.name}</div>
            <div className="switch-nav-row">
              <button className="switch-nav" onClick={() => cycleProfile(-1)} aria-label="Previous switch (left arrow key)" title="Previous switch (←)">{'\u2039'}</button>
              <div className={`switch-meta ${metaVisible ? 'visible' : ''}`}>
                {[typeBadge, isHQ ? 'HQ' : null, `${activeIndex + 1} / ${profiles.length}`]
                  .filter(Boolean).join('   ·   ')}
              </div>
              <button className="switch-nav" onClick={() => cycleProfile(1)} aria-label="Next switch (right arrow key)" title="Next switch (→)">{'\u203a'}</button>
            </div>
            {!isTuning && !hasWarning && <div className="switch-desc">{activeData.description}</div>}
            {!isTuning && hasWarning && (
              <div className="warn-panel" role="alert">
                {!hasPermission ? (
                  <>
                    <div className="warn-panel-title">Accessibility permission required</div>
                    <div className="warn-panel-body">
                      Pekko needs Accessibility access to detect keystrokes. No keystroke content is read — only key codes.
                    </div>
                    <button
                      className="warn-panel-action"
                      onClick={() => hasApi && window.api.requestPermissions()}
                    >
                      Grant access
                    </button>
                  </>
                ) : (
                  <>
                    <div className="warn-panel-title">Bluetooth output detected</div>
                    <div className="warn-panel-body">
                      Wired output is recommended for the lowest sound latency.
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      {!isTuning && (
        <>
          <DspWarmthArc wpm={wpm} active={typingActive} muted={!soundEnabled} />
          <LedLadder wpm={wpm} active={typingActive} muted={!soundEnabled} />
          <VolumeSlider volume={volume} onChange={handleVolumeChange} />
        </>
      )}

      {isTuning && (
        <>
          <div className="drawer-compact-row">
            <DspWarmthArc wpm={wpm} active={typingActive} muted={!soundEnabled} />
            <VolumeSlider volume={volume} onChange={handleVolumeChange} />
          </div>
          <LedLadder wpm={wpm} active={typingActive} muted={!soundEnabled} />
          <TuneView
            presetDsp={presetDsp}
            effectiveDsp={effectiveDsp}
            dspOverride={overrideForActive ?? {}}
            onSwitchDspChange={handleSwitchDspChange}
            onResetSwitchDsp={resetSwitchDsp}
            modeName={activeMode.name}
            isCustomMode={mode === 'custom'}
            bed={customBed}
            bedGainDb={customBedGainDb}
            style={customStyle}
            onBedChange={handleCustomBedChange}
            onBedGainChange={handleCustomBedGainChange}
            onStyleChange={handleCustomStyleChange}
            onResetMode={resetCustom}
            onClose={() => handleTuningChange(false)}
          />
        </>
      )}
      </>}
    </div>
  )
}
