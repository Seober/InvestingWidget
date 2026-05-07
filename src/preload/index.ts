import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type {
  AppConfig,
  AssetType,
  ItemConfig,
  ResizeEdge,
  StatusEvent,
  SymbolSuggestion,
  Tick,
  UpdateDownloadedInfo,
  UpdateProgressInfo,
  ValidateResult,
} from '@shared/schema'

// IPC listener 등록·정리 단일 helper — main → renderer 이벤트 5종 (config-changed,
// price-tick, price-status, update-progress, update-downloaded) 의 동일 패턴 통합.
// 반환된 unsubscriber 함수 호출 시 listener 제거 (effect cleanup 패턴).
function subscribe<T>(channel: string, cb: (data: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, data: T) => cb(data)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api = {
  config: {
    get: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
    set: (patch: Partial<AppConfig>): Promise<AppConfig> =>
      ipcRenderer.invoke(IPC.CONFIG_SET, patch),
    onChange: (cb: (cfg: AppConfig) => void): (() => void) => subscribe(IPC.CONFIG_CHANGED, cb),
  },
  items: {
    add: (draft: Omit<ItemConfig, 'id'>): Promise<ItemConfig> =>
      ipcRenderer.invoke(IPC.ITEM_ADD, draft),
    edit: (item: ItemConfig): Promise<ItemConfig> => ipcRenderer.invoke(IPC.ITEM_EDIT, item),
    remove: (itemId: string): Promise<void> => ipcRenderer.invoke(IPC.ITEM_REMOVE, itemId),
    validate: (draft: Omit<ItemConfig, 'id'>): Promise<ValidateResult> =>
      ipcRenderer.invoke(IPC.ITEM_VALIDATE, draft),
    cancelValidate: () => ipcRenderer.send(IPC.ITEM_CANCEL_VALIDATE),
  },
  kr: {
    resolve: (query: string): Promise<{ code: string; name: string; market: string } | null> =>
      ipcRenderer.invoke(IPC.KR_STOCK_RESOLVE, query),
  },
  symbols: {
    search: (params: {
      assetType: AssetType
      query: string
      quoteCurrency?: string
    }): Promise<SymbolSuggestion[]> => ipcRenderer.invoke(IPC.SYMBOL_SEARCH, params),
  },
  drag: {
    start: () => ipcRenderer.send(IPC.DRAG_START),
    move: () => ipcRenderer.send(IPC.DRAG_MOVE),
    end: () => ipcRenderer.send(IPC.DRAG_END),
  },
  resize: {
    start: (edge: ResizeEdge) => ipcRenderer.send(IPC.RESIZE_HANDLE_START, edge),
    move: () => ipcRenderer.send(IPC.RESIZE_HANDLE_MOVE),
    end: () => ipcRenderer.send(IPC.RESIZE_HANDLE_END),
  },
  window: {
    setOpacity: (value: number): Promise<number> => ipcRenderer.invoke(IPC.OPACITY_SET, value),
    setAlwaysOnTop: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.ALWAYS_ON_TOP_SET, enabled),
    setAutoStart: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC.AUTOSTART_SET, enabled),
    setContentSize: (size: { width?: number; height?: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.WINDOW_SET_CONTENT_SIZE, size),
    closeSelf: () => window.close(),
  },
  links: {
    open: (itemId: string) => ipcRenderer.send(IPC.LINK_OPEN, itemId),
  },
  menu: {
    show: () => ipcRenderer.send(IPC.MENU_SHOW),
  },
  modal: {
    openEditItem: (itemId: string) =>
      ipcRenderer.send(IPC.MODAL_OPEN, { kind: 'edit-item', itemId }),
  },
  prices: {
    onTick: (cb: (tick: Tick | null) => void): (() => void) => subscribe(IPC.PRICE_TICK, cb),
    onStatus: (cb: (evt: StatusEvent) => void): (() => void) => subscribe(IPC.PRICE_STATUS, cb),
  },
  updater: {
    onProgress: (cb: (info: UpdateProgressInfo) => void): (() => void) =>
      subscribe(IPC.UPDATE_PROGRESS, cb),
    onDownloaded: (cb: (info: UpdateDownloadedInfo) => void): (() => void) =>
      subscribe(IPC.UPDATE_DOWNLOADED, cb),
    acceptInstall: () => ipcRenderer.send(IPC.UPDATE_ACCEPT_INSTALL),
  },
  app: {
    quit: () => ipcRenderer.send(IPC.APP_QUIT),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
