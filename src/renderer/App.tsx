import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useProfiles } from './hooks/useProfiles'
import VolumeSlider from './components/VolumeSlider'
import PermissionBanner from './components/PermissionBanner'
import TypingIndicator from './components/TypingIndicator'
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
import './App.css'

const hasApi = typeof window !== 'undefined' && !!window.api

const THEMES = [
  { id: 'catppuccin', name: 'Catppuccin' },
  { id: 'tokyo-night', name: 'Tokyo Night' },
  { id: 'rose-pine', name: 'Rosé Pine' },
  { id: 'nord', name: 'Nord' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'gruvbox', name: 'Gruvbox' },
] as const

// mode IDs for cycling: all presets + custom at the end
const MODE_IDS = [...MODES.map(m => m.id), 'custom']

export default function App() {
  const { profiles, loading } = useProfiles()
  const [activeProfile, setActiveProfile] = useState('cherrymx-black-abs')
  const [volume, setVolume] = useState(0.7)
  const [hasPermission, setHasPermission] = useState(true)
  const [theme, setTheme] = useState('gruvbox')
  const [mode, setMode] = useState<string>(DEFAULT_MODE_ID)

  // Custom mode state (persisted)
  const [customBed, setCustomBed] = useState<BedType>(DEFAULT_CUSTOM_BED)
  const [customBedGainDb, setCustomBedGainDb] = useState<number>(DEFAULT_CUSTOM_BED_GAIN_DB)
  const [customStyle, setCustomStyle] = useState<ModeStyle>({ ...DEFAULT_CUSTOM_STYLE })

  // Per-switch DSP overrides keyed by profileId. Sparse: only fields the user touched.
  const [switchDspOverrides, setSwitchDspOverrides] = useState<Record<string, SwitchDspOverride>>({})

  const [isTuning, setIsTuning] = useState(false)

  // Resolved active Mode (object) — memoized so the engine effect doesn't re-run on every render
  const activeMode = useMemo(() => {
    if (mode === 'custom') return buildCustomMode(customStyle, customBed, customBedGainDb)
    return MODES.find(m => m.id === mode) ?? MODES[0]
  }, [mode, customStyle, customBed, customBedGainDb])

  const activeProfileObj = profiles.find(p => p.id === activeProfile)
  const presetDsp = activeProfileObj?.dsp ?? DEFAULT_SWITCH_DSP
  const overrideForActive = switchDspOverrides[activeProfile]
  // Memoized so the engine effect only fires when the resolved DSP actually changes.
  const effectiveDsp = useMemo(
    () => resolveSwitchDsp(activeProfileObj?.dsp, overrideForActive),
    [activeProfileObj, overrideForActive]
  )

  const { bluetoothWarning, soundEnabled, wpm, typingActive } = useAudioEngine(activeProfile, volume, activeMode, effectiveDsp)

  // Load persisted settings
  useEffect(() => {
    if (!hasApi) return
    window.api.getSettings().then((s) => {
      setActiveProfile(s.activeProfile)
      setVolume(s.volume)
      if (s.theme) setTheme(s.theme)
      if (s.mode) setMode(s.mode)
      if (s.customBed) setCustomBed(s.customBed)
      if (typeof s.customBedGainDb === 'number') setCustomBedGainDb(s.customBedGainDb)
      if (s.customStyle) setCustomStyle(s.customStyle)
      if (s.switchDspOverrides) setSwitchDspOverrides(s.switchDspOverrides)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (!hasApi) return
    const check = () => window.api.checkPermissions().then(setHasPermission).catch(() => {})
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [])

  // Listen for tray menu changes
  useEffect(() => {
    if (!hasApi) return
    window.api.onProfileChanged(setActiveProfile)
    window.api.onVolumeChanged(setVolume)
    window.api.onThemeChanged(setTheme)
  }, [])

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const handleProfileChange = useCallback(async (id: string) => {
    setActiveProfile(id)
    if (hasApi) await window.api.setProfile(id)
  }, [])

  const handleVolumeChange = async (v: number) => {
    setVolume(v)
    if (hasApi) await window.api.setVolume(v)
  }

  const handleThemeChange = useCallback(async (id: string) => {
    setTheme(id)
    if (hasApi) await window.api.setTheme(id)
  }, [])

  const handleModeChange = useCallback(async (id: string) => {
    setMode(id)
    if (hasApi) await window.api.setMode(id)
  }, [])

  // Custom config persistence — debounced is overkill; writes are tiny JSON
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

  // Per-switch DSP override handlers. Override is sparse — only includes fields the user has changed.
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
  const isHQ = activeProfile.startsWith('cherrymx-') || activeProfile.startsWith('topre-purple') || activeProfile === 'nk-cream'
  const themeIndex = THEMES.findIndex(t => t.id === theme)

  const cycleProfile = useCallback((dir: number) => {
    if (profiles.length === 0 || activeIndex === -1) return
    const next = (activeIndex + dir + profiles.length) % profiles.length
    handleProfileChange(profiles[next].id)
  }, [profiles, activeIndex, handleProfileChange])

  const cycleTheme = useCallback((dir: number) => {
    const next = (themeIndex + dir + THEMES.length) % THEMES.length
    handleThemeChange(THEMES[next].id)
  }, [themeIndex, handleThemeChange])

  const modeIdx = MODE_IDS.indexOf(mode)
  const cycleMode = useCallback((dir: number) => {
    const next = (modeIdx + dir + MODE_IDS.length) % MODE_IDS.length
    handleModeChange(MODE_IDS[next])
  }, [modeIdx, handleModeChange])

  // Keyboard: ← → profiles, Q/E themes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTuning) return // don't hijack keys while tuning
      if (e.key === 'ArrowLeft') cycleProfile(-1)
      else if (e.key === 'ArrowRight') cycleProfile(1)
      else if (e.key === 'q' || e.key === 'Q') cycleTheme(-1)
      else if (e.key === 'e' || e.key === 'E') cycleTheme(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleProfile, cycleTheme, isTuning])

  if (isTuning) {
    return (
      <div className="app">
        <TuneView
          profileName={activeData?.name ?? activeProfile}
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
          onClose={() => setIsTuning(false)}
        />
      </div>
    )
  }

  return (
    <div className="app">
      {/* Title bar */}
      <div className="titlebar">
        <div className="titlebar-left">
          <svg className="titlebar-mascot" width="16" height="16" viewBox="0 0 256 256">
            <path fill="currentColor" d="M236.44,73.34 L213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88a104.11,104.11,0,0,0,104-104V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12,12,12,0,0,1-12,12Z"/>
          </svg>
          <h1>Pekko</h1>
        </div>
        <div className="titlebar-right">
          {!soundEnabled && <span className="muted-badge">MUTE</span>}
          <span>⌘⇧K</span>
        </div>
      </div>

      {/* Alerts */}
      {!hasPermission && (
        <PermissionBanner onRequest={() => hasApi && window.api.requestPermissions()} />
      )}
      {bluetoothWarning && (
        <div className="bluetooth-warning">
          Bluetooth detected — wired output recommended
        </div>
      )}

      {/* Mode — the primary axis (bed + style) */}
      <div className="mode-group" aria-label="Soundscape mode">
        <div className="mode-nav">
          <button className="nav-btn" onClick={() => cycleMode(-1)} aria-label="Previous mode">{'\u2039'}</button>
          <div className="mode-name">{activeMode.name}</div>
          <button className="nav-btn" onClick={() => cycleMode(1)} aria-label="Next mode">{'\u203a'}</button>
        </div>
        <div className="mode-description" aria-live="polite">{activeMode.description}</div>
      </div>

      {/* Current profile */}
      <div className={`current-profile ${activeData ? `accent-${activeData.type}` : ''}`}>
        {loading ? (
          <div className="loading">Loading</div>
        ) : activeData ? (
          <>
            <div className="profile-nav">
              <button className="nav-btn" onClick={() => cycleProfile(-1)}>{'\u2039'}</button>
              <div className="profile-current-name">{activeData.name}</div>
              <button className="nav-btn" onClick={() => cycleProfile(1)}>{'\u203a'}</button>
            </div>
            <div className="profile-current-meta">
              <span className={`type-badge type-${activeData.type}`}>
                {activeData.type.toUpperCase()}
              </span>
              {isHQ && <span className="hq-badge">HQ</span>}
              <button className="tune-chip" onClick={() => setIsTuning(true)} aria-label="Tune switch sound">
                <span className="tune-chip-icon" aria-hidden="true">{'\u2261'}</span>
                TUNE
              </button>
            </div>
            <div className="profile-current-desc">{activeData.description}</div>
            <div className="profile-counter">{activeIndex + 1} / {profiles.length}</div>
          </>
        ) : null}
      </div>

      {/* Controls */}
      <div className="controls">
        <VolumeSlider volume={volume} onChange={handleVolumeChange} />
        <TypingIndicator wpm={wpm} active={typingActive} />
      </div>

      {/* Footer — theme switcher */}
      <div className="footer">
        <button className="footer-nav-btn" onClick={() => cycleTheme(-1)} aria-label="Previous theme">{'\u2039'}</button>
        <span className="footer-theme">{THEMES[themeIndex]?.name}</span>
        <button className="footer-nav-btn" onClick={() => cycleTheme(1)} aria-label="Next theme">{'\u203a'}</button>
      </div>
    </div>
  )
}
