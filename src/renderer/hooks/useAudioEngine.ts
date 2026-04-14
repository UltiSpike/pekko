import { useEffect, useState, useCallback } from 'react'
import { audioEngine } from '../audio/AudioEngine'
import type { Mode, SwitchDsp, SwitchDspOverride } from '@shared/modes'

declare global {
  interface Window {
    api: {
      onKeyEvent: (cb: (keycode: number, type: string) => void) => void
      onSoundToggle: (cb: (enabled: boolean) => void) => void
      onProfileChanged: (cb: (id: string) => void) => void
      onVolumeChanged: (cb: (v: number) => void) => void
      onThemeChanged: (cb: (theme: string) => void) => void
      setTheme: (t: string) => Promise<boolean>
      setMode: (m: string) => Promise<boolean>
      setCustomConfig: (cfg: any) => Promise<boolean>
      setSwitchDspOverride: (profileId: string, override: SwitchDspOverride) => Promise<boolean>
      getSettings: () => Promise<any>
      getProfiles: () => Promise<any>
      loadSoundPack: (id: string) => Promise<any>
      setProfile: (id: string) => Promise<boolean>
      setVolume: (v: number) => Promise<boolean>
      checkPermissions: () => Promise<boolean>
      requestPermissions: () => Promise<boolean>
    }
  }
}

export function useAudioEngine(activeProfileId: string, volume: number, mode: Mode, switchDsp: SwitchDsp) {
  const [bluetoothWarning, setBluetoothWarning] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [wpm, setWpm] = useState(0)
  const [typingActive, setTypingActive] = useState(false)

  // Poll WPM from audio engine
  const pollWpm = useCallback(() => {
    setWpm(audioEngine.wpm)
    setTypingActive(audioEngine.typingActive)
  }, [])

  // Key events — runs once
  useEffect(() => {
    if (!window.api) return
    window.api.onKeyEvent((keycode, type) => {
      audioEngine.resume()
      audioEngine.playSound(keycode, type as 'down' | 'up')
      pollWpm()
    })

    // Global toggle: Cmd+Shift+K
    window.api.onSoundToggle((enabled) => {
      audioEngine.setEnabled(enabled)
      setSoundEnabled(enabled)
    })

    // Bluetooth latency check
    const checkBt = setTimeout(() => {
      const { isBluetooth, latencyMs } = audioEngine.checkOutputLatency()
      if (isBluetooth) {
        console.warn(`[Audio] High latency: ${latencyMs}ms (Bluetooth?)`)
        setBluetoothWarning(true)
      }
    }, 3000)

    // WPM poll interval (update UI at ~4fps for typing indicator)
    const wpmInterval = setInterval(pollWpm, 250)

    return () => {
      clearTimeout(checkBt)
      clearInterval(wpmInterval)
      audioEngine.destroy()
    }
  }, [pollWpm])

  // Load profile
  useEffect(() => {
    if (!window.api || !activeProfileId) return
    audioEngine.init().then(() => audioEngine.loadProfile(activeProfileId))
  }, [activeProfileId])

  // Volume
  useEffect(() => {
    audioEngine.setVolume(volume)
  }, [volume])

  // Mode (bed + style). Object identity drives re-apply — caller memoizes.
  useEffect(() => {
    audioEngine.setMode(mode)
  }, [mode])

  // Per-switch DSP — applied whenever the resolved DSP for the active profile changes
  // (profile switch or user override). Engine ramps internally to avoid clicks.
  useEffect(() => {
    audioEngine.applySwitchDsp(switchDsp)
  }, [switchDsp])

  return { bluetoothWarning, soundEnabled, wpm, typingActive }
}
