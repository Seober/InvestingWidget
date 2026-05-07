import { app, BrowserWindow } from 'electron'
import { ConfigStore } from './configStore'
import { WindowManager } from './windowManager'
import { PriceService } from './priceService'
import { TrayManager } from './tray'
import { UpdaterManager } from './autoUpdater'
import { closeAllModals } from './modalWindow'
import { clearSearchCache } from './symbolSearch'

// 앱 시작 후 자동 업데이트 체크 지연 — 사용자 첫 인상에 dialog 안 뜨게.
const UPDATER_INITIAL_CHECK_DELAY_MS = 10_000

// Electron app 라이프사이클 핸들러 등록·정리. index.ts 가 부트스트랩에만 집중하도록 분리.
export class AppLifecycle {
  constructor(
    private wm: WindowManager,
    private config: ConfigStore,
    private prices: PriceService,
    private tray: TrayManager,
    private updater: UpdaterManager
  ) {}

  register(): void {
    app.on('second-instance', () => this.onSecondInstance())
    app.on('activate', () => this.onActivate())
    app.on('before-quit', async () => {
      await this.onBeforeQuit()
    })
    app.on('window-all-closed', () => {
      app.quit()
    })

    // 백그라운드 업데이트 체크 — 위젯 표시·실시간 가격 등 우선 동작 후 체크 시작.
    setTimeout(() => {
      void this.updater.checkForUpdates()
    }, UPDATER_INITIAL_CHECK_DELAY_MS)
  }

  private onSecondInstance(): void {
    const w = this.wm.window
    if (!w) return
    if (w.isMinimized()) w.restore()
    w.focus()
  }

  private onActivate(): void {
    if (BrowserWindow.getAllWindows().length === 0) this.wm.create()
  }

  // 종료 직전 모든 부수 자원 정리 — modal 윈도우·검색 캐시·config 디스크 flush·priceService 어댑터.
  private async onBeforeQuit(): Promise<void> {
    this.tray.destroy()
    closeAllModals()
    clearSearchCache()
    this.config.flush()
    await this.prices.destroy()
  }
}
