import { useEffect } from 'react'

const DEBOUNCE_MS = 120

// Watches the given element's scrollHeight and pushes it to main as a
// window-resize IPC. No clamping here — main is the authority on min/max.
// `active` lets the caller pause measurement during shutdown / finish-blackout
// frames; when paused, no IPC fires.
export function useAutoResizeWindow(
  ref: React.RefObject<HTMLElement>,
  active: boolean
): void {
  useEffect(() => {
    const el = ref.current
    if (!el || !active) return
    if (typeof window === 'undefined' || !window.api) return

    let timer: number | null = null
    let lastSent = -1

    const push = () => {
      if (!ref.current) return
      const h = ref.current.scrollHeight
      if (h === lastSent || h <= 0) return
      lastSent = h
      window.api.resizeWindow(h).catch(() => {})
    }

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        push()
      }, DEBOUNCE_MS)
    }

    // Fire once immediately so main can show the window on first paint
    // without waiting the debounce.
    push()

    const ro = new ResizeObserver(schedule)
    ro.observe(el)

    return () => {
      if (timer !== null) window.clearTimeout(timer)
      ro.disconnect()
    }
  }, [ref, active])
}
