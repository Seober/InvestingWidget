import { app } from 'electron'
import { ConfigStore } from './configStore'
import { WindowManager } from './windowManager'
import { PriceService } from './priceService'
import { registerIpc } from './ipcRouter'
import { setAutoStart } from './autostart'
import { TrayManager } from './tray'
import { AppLifecycle } from './appLifecycle'
import { IPC } from '@shared/ipcChannels'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void main()
}

async function main() {
  await app.whenReady()

  const config = new ConfigStore()
  const cfg = config.get()
  setAutoStart(cfg.window.autoStart)

  const wm = new WindowManager(config)
  const prices = new PriceService(cfg)

  const broadcastConfig = () => {
    wm.sendToRenderer(IPC.CONFIG_CHANGED, config.get())
  }

  registerIpc({ config, wm, prices, broadcastConfig })

  wm.create()
  prices.setItems(cfg.items)

  const tray = new TrayManager(wm, config, broadcastConfig)
  tray.create()

  const lifecycle = new AppLifecycle(wm, config, prices, tray)
  lifecycle.register()
}
