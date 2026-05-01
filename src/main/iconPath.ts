import { app } from 'electron'
import { join } from 'node:path'

// icon.ico location at runtime:
//   - dev: <project-root>/resources/icon.ico (via app.getAppPath())
//   - packaged: <install>/resources/icon.ico (via electron-builder extraResources)
export function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(app.getAppPath(), 'resources', 'icon.ico')
}
