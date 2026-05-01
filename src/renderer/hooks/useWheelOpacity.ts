import { useEffect } from 'react'

export function useWheelOpacity(currentOpacity: number, bounds: { min: number; max: number }) {
  useEffect(() => {
    let pending = currentOpacity
    let ticking = false
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const step = 0.05
      const delta = e.deltaY > 0 ? -step : step
      pending = Math.max(bounds.min, Math.min(bounds.max, pending + delta))
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          ticking = false
          window.api.window.setOpacity(pending)
        })
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [currentOpacity, bounds.min, bounds.max])
}
