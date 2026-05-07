export interface Tick {
  itemId: string
  price: number
  changePct: number
  ts: number
}

export type AdapterStatus = 'connecting' | 'open' | 'closed' | 'reconnecting'

// 항목 단위 에러 (특정 item 의 어댑터가 데이터 못 받는 케이스). status 는 항상 'closed'.
// kind 'item' 으로 AdapterStatusEvent 와 discriminate — type narrow 안전성·런타임 오인 방지.
export interface ItemStatusEvent {
  kind: 'item'
  itemId: string
  status: 'closed'
  message?: string
}

// 어댑터 단위 상태 변화 (해당 어댑터가 잡은 모든 item 에 영향).
export interface AdapterStatusEvent {
  kind: 'adapter'
  adapterId: string
  status: AdapterStatus
  message?: string
}

export type StatusEvent = ItemStatusEvent | AdapterStatusEvent
