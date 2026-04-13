import { useEffect, useState, useCallback } from 'react'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useProfiles } from './hooks/useProfiles'
import VolumeSlider from './components/VolumeSlider'
import PermissionBanner from './components/PermissionBanner'
import TypingIndicator from './components/TypingIndicator'
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

export default function App() {
  const { profiles, loading } = useProfiles()
  const [activeProfile, setActiveProfile] = useState('cherrymx-black-abs')
  const [volume, setVolume] = useState(0.7)
  const [hasPermission, setHasPermission] = useState(true)
  const [theme, setTheme] = useState('gruvbox')

  const { bluetoothWarning, soundEnabled, wpm, typingActive } = useAudioEngine(activeProfile, volume)

  // Load persisted settings
  useEffect(() => {
    if (!hasApi) return
    window.api.getSettings().then((s) => {
      setActiveProfile(s.activeProfile)
      setVolume(s.volume)
      if (s.theme) setTheme(s.theme)
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

  // Keyboard: ← → profiles, Q/E themes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') cycleProfile(-1)
      else if (e.key === 'ArrowRight') cycleProfile(1)
      else if (e.key === 'q' || e.key === 'Q') cycleTheme(-1)
      else if (e.key === 'e' || e.key === 'E') cycleTheme(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleProfile, cycleTheme])

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

      {/* Footer */}
      <div className="footer">
        <span className="footer-theme">{THEMES[themeIndex]?.name}</span>
        <span>·</span>
        <span>Q/E</span>
      </div>
    </div>
  )
}
