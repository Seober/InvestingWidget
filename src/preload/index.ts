import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { AppConfig, ItemConfig, Tick, ValidateResult } from '@shared/schema'

type StatusEvent =
  | { itemId: string; status: 'closed'; message?: string }
  | { adapterId: string; status: string; message?: string }

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.CONFIG_SET, patch),
    onChange: (cb: (cfg: AppConfig) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, cfg: AppConfig) => cb(cfg)
      ipcRenderer.on(IPC.CONFIG_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC.CONFIG_CHANGED, handler)
      }
    }
  },
  items: {
    add: (draft: Omit<ItemConfig, 'id'>): Promise<ItemConfig> =>
      ipcRenderer.invoke(IPC.ITEM_ADD, draft),
    edit: (item: ItemConfig): Promise<ItemConfig> =>
      ipcRenderer.invoke(IPC.ITEM_EDIT, item),
    remove: (itemId: string): Promise<void> => ipcRenderer.invoke(IPC.ITEM_REMOVE, itemId),
    validate: (draft: Omit<ItemConfig, 'id'>): Promise<ValidateResult> =>
      ipcRenderer.invoke(IPC.ITEM_VALIDATE, draft),
    cancelValidate: () => ipcRenderer.send(IPC.ITEM_CANCEL_VALIDATE)
  },
  kr: {
    resolve: (
      query: string
    ): Promise<{ code: string; name: string; market: string } | null> =>
      ipcRenderer.invoke(IPC.KR_STOCK_RESOLVE, query)
  },
  drag: {
    start: () => ipcRenderer.send(IPC.DRAG_START),
    move: () => ipcRenderer.send(IPC.DRAG_MOVE),
    end: () => ipcRenderer.send(IPC.DRAG_END)
  },
  window: {
    setOpacity: (value: number): Promise<number> => ipcRenderer.invoke(IPC.OPACITY_SET, value),
    setAlwaysOnTop: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.ALWAYS_ON_TOP_SET, enabled),
    setAutoStart: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.AUTOSTART_SET, enabled),
    closeSelf: () => window.close()
  },
  links: {
    open: (itemId: string) => ipcRenderer.send(IPC.LINK_OPEN, itemId)
  },
  menu: {
    show: () => ipcRenderer.send(IPC.MENU_SHOW)
  },
  modal: {
    openEditItem: (itemId: string) =>
      ipcRenderer.send(IPC.MODAL_OPEN, { kind: 'edit-item', itemId })
  },
  prices: {
    onTick: (cb: (tick: Tick | null) => void): (() => void) => {
      const h = (_e: Electron.IpcRendererEvent, tick: Tick | null) => cb(tick)
      ipcRenderer.on(IPC.PRICE_TICK, h)
      return () => {
        ipcRenderer.removeListener(IPC.PRICE_TICK, h)
      }
    },
    onStatus: (cb: (evt: StatusEvent) => void): (() => void) => {
      const h = (_e: Electron.IpcRendererEvent, evt: StatusEvent) => cb(evt)
      ipcRenderer.on(IPC.PRICE_STATUS, h)
      return () => {
        ipcRenderer.removeListener(IPC.PRICE_STATUS, h)
      }
    }
  },
  app: {
    quit: () => ipcRenderer.send(IPC.APP_QUIT)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
