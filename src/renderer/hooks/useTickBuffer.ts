import { useCallback, useEffect, useRef } from 'react'
import type { Tick } from '@shared/schema'

// 들어오는 tick 들을 itemId 별로 buffer 에 누적 후 refreshIntervalMs 마다 한 번에 applyTick.
// IPC tick 폭주 시 React state 업데이트 빈도를 throttle 해 리렌더 부담 ↓.
export function useTickBuffer(
  refreshIntervalMs: number,
  applyTick: (tick: Tick) => void
): (tick: Tick) => void {
  const bufferRef = useRef<Map<string, Tick>>(new Map())
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const flush = () => {
      const buf = bufferRef.current
      if (buf.size === 0) return
      for (const tick of buf.values()) applyTick(tick)
      buf.clear()
    }
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = window.setInterval(flush, refreshIntervalMs)
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
    }
  }, [refreshIntervalMs, applyTick])

  return useCallback((tick: Tick) => {
    bufferRef.current.set(tick.itemId, tick)
  }, [])
}
