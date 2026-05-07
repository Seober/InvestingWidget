import { useRef } from 'react'
import { useStore } from './store'
import { ItemRow } from './components/ItemRow'
import { ResizeHandles } from './components/ResizeHandles'
import { useDrag } from './hooks/useDrag'
import { useWheelOpacity } from './hooks/useWheelOpacity'
import { useConfigSync } from './hooks/useConfigSync'
import { useTickBuffer } from './hooks/useTickBuffer'
import { usePriceStream } from './hooks/usePriceStream'
import { useAutofit } from './hooks/useAutofit'
import { useEdgeResizeDblClick } from './hooks/useEdgeResizeDblClick'

export function App() {
  const { config, items, ticks, setConfig, applyTick, setItemError, setAdapterStatus } = useStore()

  const appRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  useConfigSync(setConfig)
  const addTick = useTickBuffer(config?.refreshIntervalMs ?? 500, applyTick)
  usePriceStream({
    onTick: addTick,
    onItemError: setItemError,
    onAdapterStatus: setAdapterStatus
  })
  useWheelOpacity(
    config?.window.opacity ?? 0.9,
    config?.defaults.opacityBounds ?? { min: 0.15, max: 1.0 }
  )
  const { autofitHeight, autofitWidth } = useAutofit({ appRef, rowsRef, headerRef })
  useEdgeResizeDblClick(autofitHeight, autofitWidth)

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
