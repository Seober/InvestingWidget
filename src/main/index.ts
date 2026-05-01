import { app, BrowserWindow } from 'electron'
import { ConfigStore } from './configStore'
import { WindowManager } from './windowManager'
import { PriceService } from './priceService'
import { registerIpc } from './ipcRouter'
import { setAutoStart } from './autostart'

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
  registerIpc({ config, wm, prices })

  const win = wm.create()
  prices.setItems(cfg.items)

  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) wm.create()
  })

  app.on('before-quit', async () => {
    config.flush()
    await prices.destroy()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
