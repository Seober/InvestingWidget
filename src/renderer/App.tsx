import { useEffect, useRef } from 'react'
import { useStore } from './store'
import { ItemRow } from './components/ItemRow'
import { useDrag } from './hooks/useDrag'
import { useWheelOpacity } from './hooks/useWheelOpacity'
import type { Tick } from '@shared/schema'

export function App() {
  const { config, items, ticks, setConfig, applyTick, setItemError, setAdapterStatus } = useStore()

  const tickBufferRef = useRef<Map<string, Tick>>(new Map())
  const flushTimerRef = useRef<number | null>(null)

  useEffect(() => {
    void window.api.config.get().then(setConfig)
    return window.api.config.onChange(setConfig)
  }, [setConfig])

  useEffect(() => {
    const intervalMs = config?.refreshIntervalMs ?? 500
    const flush = () => {
      const buf = tickBufferRef.current
      if (buf.size === 0) return
      for (const tick of buf.values()) applyTick(tick)
      buf.clear()
    }
    if (flushTimerRef.current !== null) window.clearInterval(flushTimerRef.current)
    flushTimerRef.current = window.setInterval(flush, intervalMs)
    return () => {
      if (flushTimerRef.current !== null) window.clearInterval(flushTimerRef.current)
    }
  }, [config?.refreshIntervalMs, applyTick])

  useEffect(() => {
    return window.api.prices.onTick((tick) => {
      if (!tick) return
      tickBufferRef.current.set(tick.itemId, tick)
    })
  }, [])

  useEffect(() => {
    return window.api.prices.onStatus((evt: any) => {
      if (evt.itemId) setItemError(evt.itemId, evt.message ?? '')
      else if (evt.adapterId) setAdapterStatus(evt.adapterId, evt.status, evt.message)
    })
  }, [setItemError, setAdapterStatus])

  useWheelOpacity(
    config?.window.opacity ?? 0.9,
    config?.defaults.opacityBounds ?? { min: 0.15, max: 1.0 }
  )

  const findItemId = (target: EventTarget | null): string | null => {
    let el = target as HTMLElement | null
    while (el) {
      const id = el.getAttribute?.('data-item-id')
      if (id) return id
      el = el.parentElement
    }
    return null
  }

  useDrag({
    onClick: (target) => {
      const id = findItemId(target)
      if (id) window.api.links.open(id)
    },
    onContextMenu: () => {
      window.api.menu.show()
    }
  })

  if (!config) return <div className="loading">로딩 중…</div>

  const themeClass = config.theme === 'auto' ? '' : `theme-${config.theme}`

  return (
    <div className={`app ${themeClass}`} style={{ fontSize: config.fontSize }}>
      <div className="header">
        <span>종목</span>
        <span>현재가</span>
        <span>등락률</span>
      </div>
      <div className="rows">
        {items.length === 0 && (
          <div className="empty">우클릭 → "항목 관리 → 항목 추가"로 시작하세요.</div>
        )}
        {items.map((item) => {
          const t = ticks[item.id]
          const needsApiKey =
            (item.assetType === 'stock-us' || item.assetType === 'etf-us') && !config.finnhubApiKey
          const isExperimental = item.assetType === 'stock-kr'
          return (
            <ItemRow
              key={item.id}
              item={item}
              price={t?.price}
              changePct={t?.changePct}
              status={t?.status}
              errorMessage={t?.errorMessage}
              needsApiKey={needsApiKey}
              isExperimental={isExperimental}
            />
          )
        })}
      </div>
    </div>
  )
}
