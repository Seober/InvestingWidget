import { ipcMain } from 'electron'
import type { ResizeEdge } from '@shared/schema'
import { IPC } from '@shared/ipcChannels'
import type { ConfigStore } from '../configStore'
import type { WindowManager } from '../windowManager'
import { setAutoStart } from '../autostart'

interface Deps {
  config: ConfigStore
  wm: WindowManager
  broadcastConfig: () => void
}

// drag/resize/opacity/always-on-top/autostart/setContentSize — 윈도우 조작 관련 IPC.
export function register(deps: Deps): void {
  const { config, wm, broadcastConfig } = deps

  ipcMain.on(IPC.DRAG_START, () => wm.beginDrag())
  ipcMain.on(IPC.DRAG_MOVE, () => wm.drag())
  ipcMain.on(IPC.DRAG_END, () => wm.endDrag())

  ipcMain.on(IPC.RESIZE_HANDLE_START, (_e, edge: ResizeEdge) => wm.beginEdgeResize(edge))
  ipcMain.on(IPC.RESIZE_HANDLE_MOVE, () => wm.dragEdgeResize())
  ipcMain.on(IPC.RESIZE_HANDLE_END, () => wm.endEdgeResize())

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
    config.updateWindow({ autoStart: enabled })
    broadcastConfig()
    return enabled
  })

  ipcMain.handle(IPC.WINDOW_SET_CONTENT_SIZE, (_e, size: { width?: number; height?: number }) => {
    wm.setContentSize(size)
  })
}
