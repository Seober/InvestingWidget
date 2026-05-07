import { Tray, Menu } from 'electron'
import { ConfigStore } from './configStore'
import { WindowManager } from './windowManager'
import { buildContextMenuTemplate } from './menuBuilder'
import { iconPath } from './iconPath'

export class TrayManager {
  private tray: Tray | null = null

  constructor(
    private wm: WindowManager,
    private config: ConfigStore,
    private onChange: () => void
  ) {}

  create(): void {
    if (this.tray) return
    this.tray = new Tray(iconPath())
    this.tray.setToolTip('InvestingWidget')
    this.tray.on('click', () => {
      this.wm.toggleVisibility()
    })
    this.tray.on('right-click', () => {
      const win = this.wm.window
      if (!win) return
      const template = buildContextMenuTemplate(win, this.config, this.wm, this.onChange)
      this.tray!.popUpContextMenu(Menu.buildFromTemplate(template))
    })
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
