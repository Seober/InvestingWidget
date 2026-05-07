import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { WindowManager } from '../windowManager'
import { openModal } from '../modalWindow'

interface Deps {
  wm: WindowManager
}

// MODAL_OPEN — renderer 에서 modal 열기 요청 (현재 'edit-item' 만 사용).
// add-item·settings·list-edit 은 menuBuilder 에서 직접 openModal 호출.
export function register(deps: Deps): void {
  const { wm } = deps

  ipcMain.on(
    IPC.MODAL_OPEN,
    (_e, payload: { kind: 'add-item' | 'edit-item' | 'settings'; itemId?: string }) => {
      const win = wm.window
      if (!win) return
      openModal({ parent: win, kind: payload.kind, itemId: payload.itemId })
    }
  )
}
