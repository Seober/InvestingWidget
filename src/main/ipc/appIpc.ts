import { BrowserWindow, ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { ConfigStore } from '../configStore'
import type { WindowManager } from '../windowManager'
import type { UpdaterManager } from '../autoUpdater'
import { resolveClickThroughUrl } from '../clickThroughResolver'
import { showContextMenu } from '../menuBuilder'

interface Deps {
  config: ConfigStore
  wm: WindowManager
  updater: UpdaterManager
  broadcastConfig: () => void
}

// 위 분류에 안 들어가는 misc IPC — link 열기, 메뉴 표시, 종료.
export function register(deps: Deps): void {
  const { config, wm, updater, broadcastConfig } = deps

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
    showContextMenu(win, config, wm, updater, broadcastConfig)
  })

  ipcMain.on(IPC.APP_QUIT, () => {
    config.flush()
    BrowserWindow.getAllWindows().forEach((w) => w.close())
  })
}
