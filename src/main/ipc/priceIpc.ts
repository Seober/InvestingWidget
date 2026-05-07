import type { Tick } from '@shared/schema'
import { IPC } from '@shared/ipcChannels'
import type { PriceService } from '../priceService'
import type { WindowManager } from '../windowManager'

interface Deps {
  prices: PriceService
  wm: WindowManager
}

// priceService 이벤트 → renderer IPC forward.
// kind discriminator 추가 — Stage 2 의 StatusEvent narrow.
export function register(deps: Deps): void {
  const { prices, wm } = deps

  prices.on('tick', (itemId, raw) => {
    const tick: Tick = { itemId, price: raw.price, changePct: raw.changePct, ts: raw.ts }
    wm.sendToRenderer(IPC.PRICE_TICK, tick)
  })

  prices.on('itemError', (itemId, message) => {
    wm.sendToRenderer(IPC.PRICE_STATUS, { kind: 'item', itemId, status: 'closed', message })
  })

  prices.on('adapterStatus', (adapterId, status, message) => {
    wm.sendToRenderer(IPC.PRICE_STATUS, { kind: 'adapter', adapterId, status, message })
  })
}
