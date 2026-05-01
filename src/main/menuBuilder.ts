import { BrowserWindow, Menu, MenuItemConstructorOptions, app } from 'electron'
import { ConfigStore } from './configStore'
import { setAutoStart } from './autostart'
import { WindowManager } from './windowManager'
import { openModal } from './modalWindow'

const REFRESH_PRESETS = [
  { label: '0.25초', value: 250 },
  { label: '0.5초 (기본)', value: 500 },
  { label: '1초', value: 1000 },
  { label: '2초', value: 2000 },
  { label: '5초', value: 5000 }
]

export function showContextMenu(
  win: BrowserWindow,
  config: ConfigStore,
  wm: WindowManager,
  onChange: () => void
) {
  const cfg = config.get()

  const itemMgmtSubmenu: MenuItemConstructorOptions[] = [
    {
      label: '항목 추가…',
      click: () => openModal({ parent: win, kind: 'add-item' })
    },
    {
      label: '목록 편집…',
      enabled: cfg.items.length > 0,
      click: () => openModal({ parent: win, kind: 'list-edit' })
    }
  ]

  const refreshSubmenu: MenuItemConstructorOptions[] = REFRESH_PRESETS.map((p) => ({
    label: p.label,
    type: 'radio',
    checked: cfg.refreshIntervalMs === p.value,
    click: () => {
      config.set({ refreshIntervalMs: p.value })
      onChange()
    }
  }))

  const template: MenuItemConstructorOptions[] = [
    { label: '항목 관리', submenu: itemMgmtSubmenu },
    { type: 'separator' },
    { label: '갱신 간격', submenu: refreshSubmenu },
    {
      label: '고급 설정…',
      click: () => openModal({ parent: win, kind: 'settings' })
    },
    { type: 'separator' },
    {
      label: '항상 위',
      type: 'checkbox',
      checked: cfg.window.alwaysOnTop,
      click: (mi) => {
        wm.setAlwaysOnTop(mi.checked)
        onChange()
      }
    },
    {
      label: '시작 시 자동 실행',
      type: 'checkbox',
      checked: cfg.window.autoStart,
      click: (mi) => {
        setAutoStart(mi.checked)
        config.set({ window: { ...config.get().window, autoStart: mi.checked } })
        onChange()
      }
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ]

  Menu.buildFromTemplate(template).popup({ window: win })
}
