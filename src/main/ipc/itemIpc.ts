import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AssetType, ItemConfig } from '@shared/schema'
import { IPC } from '@shared/ipcChannels'
import type { ConfigStore } from '../configStore'
import type { PriceService } from '../priceService'
import { resolveKrStock } from '../krStockResolver'
import { searchSymbols } from '../symbolSearch'

interface Deps {
  config: ConfigStore
  prices: PriceService
  broadcastConfig: () => void
}

// 항목 CRUD + validate (with abort) + KR/symbol 자동완성 dispatch.
// activeValidate AbortController 는 module-local — 동시 validate 한 번만 허용
// (새 validate 시작 시 기존 abort).
export function register(deps: Deps): void {
  const { config, prices, broadcastConfig } = deps

  ipcMain.handle(IPC.ITEM_ADD, (_e, draft: Omit<ItemConfig, 'id'>) => {
    const item: ItemConfig = { ...draft, id: randomUUID() }
    const next = [...config.get().items, item]
    config.set({ items: next })
    prices.setItems(next)
    broadcastConfig()
    return item
  })

  ipcMain.handle(IPC.ITEM_EDIT, (_e, item: ItemConfig) => {
    const next = config.get().items.map((i) => (i.id === item.id ? item : i))
    config.set({ items: next })
    prices.refreshItem(item)
    broadcastConfig()
    return item
  })

  ipcMain.handle(IPC.ITEM_REMOVE, (_e, itemId: string) => {
    const next = config.get().items.filter((i) => i.id !== itemId)
    config.set({ items: next })
    prices.setItems(next)
    broadcastConfig()
  })

  let activeValidate: AbortController | null = null
  ipcMain.handle(IPC.ITEM_VALIDATE, async (_e, draft: Omit<ItemConfig, 'id'>) => {
    activeValidate?.abort()
    const controller = new AbortController()
    activeValidate = controller
    try {
      return await prices.validate(draft, controller.signal)
    } finally {
      if (activeValidate === controller) activeValidate = null
    }
  })
  ipcMain.on(IPC.ITEM_CANCEL_VALIDATE, () => {
    activeValidate?.abort()
  })

  ipcMain.handle(IPC.KR_STOCK_RESOLVE, async (_e, query: string) => {
    return resolveKrStock(query)
  })

  ipcMain.handle(
    IPC.SYMBOL_SEARCH,
    async (_e, params: { assetType: AssetType; query: string; quoteCurrency?: string }) => {
      return searchSymbols(params.assetType, params.query, params.quoteCurrency)
    }
  )
}
