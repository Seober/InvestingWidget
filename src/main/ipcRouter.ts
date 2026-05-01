import { BrowserWindow, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { AppConfig, ItemConfig, Tick } from '@shared/schema'
import { IPC } from '@shared/ipcChannels'
import { ConfigStore } from './configStore'
import { WindowManager } from './windowManager'
import { PriceService } from './priceService'
import { showContextMenu } from './menuBuilder'
import { resolveClickThroughUrl } from './clickThroughResolver'
import { setAutoStart } from './autostart'
import { openModal } from './modalWindow'
import { resolveKrStock } from './krStockResolver'

export function registerIpc(opts: {
  config: ConfigStore
  wm: WindowManager
  prices: PriceService
}) {
  const { config, wm, prices } = opts

  const broadcastConfig = () => {
    const win = wm.window
    if (!win) return
    win.webContents.send(IPC.CONFIG_CHANGED, config.get())
  }

  ipcMain.handle(IPC.CONFIG_GET, () => config.get())

  ipcMain.handle(IPC.CONFIG_SET, (_e, patch: Partial<AppConfig>) => {
    const before = config.get()
    const next = config.set(patch)
    if (patch.finnhubApiKey !== undefined && patch.finnhubApiKey !== before.finnhubApiKey) {
      prices.setFinnhubApiKey(patch.finnhubApiKey)
    }
    if (patch.tradingViewEnabled !== undefined && patch.tradingViewEnabled !== before.tradingViewEnabled) {
      prices.setTradingViewEnabled(patch.tradingViewEnabled)
      prices.setItems(next.items)
    } else if (patch.items !== undefined) {
      prices.setItems(next.items)
    }
    broadcastConfig()
    return next
  })

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

  ipcMain.on(IPC.DRAG_START, () => wm.beginDrag())
  ipcMain.on(IPC.DRAG_MOVE, () => wm.drag())
  ipcMain.on(IPC.DRAG_END, () => wm.endDrag())

  ipcMain.on(IPC.MODAL_OPEN, (_e, payload: { kind: 'add-item' | 'edit-item' | 'settings'; itemId?: string }) => {
    const win = wm.window
    if (!win) return
    openModal({ parent: win, kind: payload.kind, itemId: payload.itemId })
  })

  ipcMain.handle(IPC.OPACITY_SET, (_e, value: number) => {
    wm.setOpacity(value)
    return config.get().window.opacity
  })

  ipcMain.handle(IPC.ALWAYS_ON_TOP_SET, (_e, enabled: boolean) => {
    wm.setAlwaysOnTop(enabled)
    return enabled
  })

  ipcMain.handle(IPC.AUTOSTART_SET, (_e, enabled: boolean) => {
    setAutoStart(enabled)
    config.set({ window: { ...config.get().window, autoStart: enabled } })
    broadcastConfig()
    return enabled
  })

  ipcMain.on(IPC.LINK_OPEN, (_e, itemId: string) => {
    const cfg = config.get()
    const item = cfg.items.find((i) => i.id === itemId)
    if (!item) return
    const url = resolveClickThroughUrl(item, cfg)
    if (url) shell.openExternal(url).catch(() => {})
  })

  ipcMain.on(IPC.MENU_SHOW, () => {
    const win = wm.window
    if (!win) return
    showContextMenu(win, config, wm, broadcastConfig)
  })

  ipcMain.on(IPC.APP_QUIT, () => {
    config.flush()
    BrowserWindow.getAllWindows().forEach((w) => w.close())
  })

  prices.on('tick', (itemId, raw) => {
    const win = wm.window
    if (!win) return
    const tick: Tick = { itemId, price: raw.price, changePct: raw.changePct, ts: raw.ts }
    win.webContents.send(IPC.PRICE_TICK, tick)
  })

  prices.on('itemError', (itemId, message) => {
    const win = wm.window
    if (!win) return
    win.webContents.send(IPC.PRICE_STATUS, { itemId, status: 'closed', message })
  })

  prices.on('adapterStatus', (adapterId, status, message) => {
    const win = wm.window
    if (!win) return
    win.webContents.send(IPC.PRICE_STATUS, { adapterId, status, message })
  })
}
