import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { UpdaterManager } from '../autoUpdater'

interface Deps {
  updater: UpdaterManager
}

// renderer (UpdaterProgressModal) 의 재시작 버튼 → quitAndInstall.
export function register(deps: Deps): void {
  const { updater } = deps

  ipcMain.on(IPC.UPDATE_ACCEPT_INSTALL, () => {
    updater.acceptInstall()
  })
}
