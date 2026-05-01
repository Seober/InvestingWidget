import { app } from 'electron'

export function setAutoStart(enabled: boolean) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    path: process.execPath,
    args: []
  })
}

export function getAutoStart(): boolean {
  return app.getLoginItemSettings().openAtLogin
}
