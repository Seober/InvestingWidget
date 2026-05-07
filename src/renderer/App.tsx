import { useEffect, useRef } from 'react'
import { useStore } from './store'
import { ItemRow } from './components/ItemRow'
import { useDrag, EDGE_BAND_PX } from './hooks/useDrag'
import { useWheelOpacity } from './hooks/useWheelOpacity'
import type { Tick } from '@shared/schema'

export function App() {
  const { config, items, ticks, setConfig, applyTick, setItemError, setAdapterStatus } = useStore()

  const tickBufferRef = useRef<Map<string, Tick>>(new Map())
  const flushTimerRef = useRef<number | null>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const autofitHeight = () => {
      const rowsH = rowsRef.current?.scrollHeight ?? 0
      const headerH = headerRef.current?.offsetHeight ?? 0
      // .app vertical padding 4px*2 = 8, .header margin-bottom 2 (styles.css)
      const target = 8 + headerH + 2 + rowsH
      void window.api.window.setContentSize({ height: target })
    }

    const autofitWidth = () => {
      const el = appRef.current
      if (!el) return
      el.classList.add('measuring-width')
      // offsetWidth는 padding + border 포함 — 윈도우 contentSize에 그대로 사용 가능
      const naturalW = el.offsetWidth + 2
      el.classList.remove('measuring-width')
      void window.api.window.setContentSize({ width: naturalW })
    }

    const onDblClick = (e: MouseEvent) => {
      const w = window.innerWidth
      const h = window.innerHeight
      const distVert = Math.min(e.clientY, h - e.clientY)
      const distHorz = Math.min(e.clientX, w - e.clientX)
      if (distVert >= EDGE_BAND_PX && distHorz >= EDGE_BAND_PX) return
      if (distVert < EDGE_BAND_PX && distVert <= distHorz) {
        autofitHeight()
      } else {
        autofitWidth()
      }
    }

    window.addEventListener('dblclick', onDblClick)
    return () => window.removeEventListener('dblclick', onDblClick)
  }, [])

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
    <div ref={appRef} className={`app ${themeClass}`} style={{ fontSize: config.fontSize }}>
      <div ref={headerRef} className="header">
        <span>종목</span>
        <span>현재가</span>
        <span>등락률</span>
      </div>
      <div ref={rowsRef} className="rows">
        {items.length === 0 && (
          <div className="empty">우클릭 → "항목 관리 → 항목 추가"로 시작하세요.</div>
        )}
        {items.map((item) => {
          const t = ticks[item.id]
          const needsApiKey =
            (item.assetType === 'stock-us' || item.assetType === 'etf-us') && !config.finnhubApiKey
          const isExperimental = item.assetType === 'stock-kr' || item.assetType === 'etf-kr'
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
