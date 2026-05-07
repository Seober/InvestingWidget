import { useEffect, useRef } from 'react'
import type { AdapterStatus, Tick } from '@shared/schema'

interface Handlers {
  onTick: (tick: Tick) => void
  onItemError: (itemId: string, message: string) => void
  onAdapterStatus: (adapterId: string, status: AdapterStatus, message?: string) => void
}

// main → renderer IPC 의 가격 tick + 상태 이벤트 listener 등록·정리.
// handlers 객체가 매 렌더 새로 생성돼도 effect 재구독 안 일어나도록 ref 로 latest 보관.
export function usePriceStream(handlers: Handlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    return window.api.prices.onTick((tick) => {
      if (!tick) return
      handlersRef.current.onTick(tick)
    })
  }, [])

  useEffect(() => {
    return window.api.prices.onStatus((evt) => {
      if ('itemId' in evt) {
        handlersRef.current.onItemError(evt.itemId, evt.message ?? '')
      } else {
        handlersRef.current.onAdapterStatus(evt.adapterId, evt.status, evt.message)
      }
    })
  }, [])
}
