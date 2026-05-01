import { EventEmitter } from 'node:events'
import { AdapterStatus, ItemConfig } from '@shared/schema'

export interface RawTick {
  symbol: string
  price: number
  changePct: number
  ts: number
}

export interface PriceAdapter extends EventEmitter {
  readonly id: string
  subscribe(item: ItemConfig): void
  unsubscribe(itemId: string): void
  status(): AdapterStatus
  destroy(): Promise<void> | void
}

export type AdapterEvents = {
  tick: (itemId: string, tick: RawTick) => void
  status: (status: AdapterStatus, message?: string) => void
  itemError: (itemId: string, message: string) => void
}
