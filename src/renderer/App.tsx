import { useCallback, useEffect, useRef } from 'react'
import { useStore } from './store'
import { ItemRow } from './components/ItemRow'
import { ResizeHandles } from './components/ResizeHandles'
import { useDrag } from './hooks/useDrag'
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

  const flashAutofitFeedback = useCallback(() => {
    const el = appRef.current
    if (!el) return
    el.classList.add('autofitting')
    window.setTimeout(() => el.classList.remove('autofitting'), 220)
  }, [])

  const autofitHeight = useCallback(() => {
    flashAutofitFeedback()
    const rowsH = rowsRef.current?.scrollHeight ?? 0
    const headerH = headerRef.current?.offsetHeight ?? 0
    // .app vertical padding 4*2 = 8, .header margin-bottom 2, .app border 1*2 = 2
    const target = 8 + headerH + 2 + rowsH + 2
    void window.api.window.setContentSize({ height: target })
  }, [flashAutofitFeedback])

  const autofitWidth = useCallback(() => {
    flashAutofitFeedback()
    const el = appRef.current
    if (!el) return
    el.classList.add('measuring-width')
    // offsetWidth는 padding + border 포함 — 윈도우 contentSize에 그대로 사용 가능
    const naturalW = el.offsetWidth + 2
    el.classList.remove('measuring-width')
    void window.api.window.setContentSize({ width: naturalW })
  }, [flashAutofitFeedback])

  useEffect(() => {
    // React onDoubleClick prop 대신 글로벌 window dblclick listener 사용 — React 합성 이벤트가
    // 일부 환경(transparent + frameless + handle div 조합)에서 발화 누락 가능성 회피.
    const onDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const handle = target?.closest('.resize-handle')
      if (!handle) return
      const edge = handle.getAttribute('data-resize-edge')
      if (!edge) return
      if (edge === 'top' || edge === 'bottom') {
        autofitHeight()
      } else if (edge === 'left' || edge === 'right') {
        autofitWidth()
      } else {
        autofitHeight()
        autofitWidth()
      }
    }
    window.addEventListener('dblclick', onDblClick)
    return () => window.removeEventListener('dblclick', onDblClick)
  }, [autofitHeight, autofitWidth])

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
    <>
      <ResizeHandles />
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
    </>
  )
}
