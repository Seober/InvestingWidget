import type { ConfigStore } from './configStore'
import type { WindowManager } from './windowManager'
import type { PriceService } from './priceService'
import type { UpdaterManager } from './autoUpdater'
import * as configIpc from './ipc/configIpc'
import * as itemIpc from './ipc/itemIpc'
import * as priceIpc from './ipc/priceIpc'
import * as windowIpc from './ipc/windowIpc'
import * as modalIpc from './ipc/modalIpc'
import * as updaterIpc from './ipc/updaterIpc'
import * as appIpc from './ipc/appIpc'

// IPC handler thin orchestrator — 도메인별 ipc/* 모듈에 위임.
// 각 모듈은 자기 의존성만 받아 register(deps) — 의존 최소화·테스트 격리 용이.
export function registerIpc(opts: {
  config: ConfigStore
  wm: WindowManager
  prices: PriceService
  updater: UpdaterManager
  broadcastConfig: () => void
}): void {
  const { config, wm, prices, updater, broadcastConfig } = opts

  configIpc.register({ config, prices, broadcastConfig })
  itemIpc.register({ config, prices, broadcastConfig })
  priceIpc.register({ wm, prices })
  windowIpc.register({ config, wm, broadcastConfig })
  modalIpc.register({ wm })
  updaterIpc.register({ updater })
  appIpc.register({ config, wm, updater, broadcastConfig })
}
