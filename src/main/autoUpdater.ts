import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

// 자동 업데이트 매니저 — electron-updater 의 GitHub Releases 기반 자동 업데이트.
// 사용자 동의 우선 — autoDownload·autoInstallOnAppQuit 모두 false. 다운로드·재시작·적용 모두 사용자 명시 동의.
//
// 본 stage(3)에서는 native showMessageBox 두 단계로 구현. progress modal UI 는 Stage 5 에서 추가됨 (다운로드 진행률 시각화).
export class UpdaterManager {
  constructor(private getMainWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('update-available', (info) => {
      void this.onUpdateAvailable(info?.version ?? '?')
    })
    autoUpdater.on('update-downloaded', (info) => {
      void this.onUpdateDownloaded(info?.version ?? '?')
    })
    autoUpdater.on('error', (err) => {
      // 무음 로그 — 자동 체크 실패가 위젯 동작에 영향 X. 사용자 침습 회피.
      console.warn('[updater] error:', err?.message ?? err)
    })
  }

  // 자동 trigger — 앱 시작 후 백그라운드 호출. 결과 dialog 는 update-available 이벤트가 처리.
  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) return // dev 모드 skip
    try {
      await autoUpdater.checkForUpdates()
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? String(err)
      console.warn('[updater] checkForUpdates failed:', msg)
    }
  }

  // 수동 trigger (우클릭 메뉴) — 결과 없으면 "최신 버전입니다" dialog 추가. 새 버전이면 자동 흐름.
  async manualCheck(): Promise<void> {
    if (!app.isPackaged) {
      this.showInfo('정보', '개발 모드에서는 업데이트 확인이 동작하지 않습니다.')
      return
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      const latest = result?.updateInfo?.version
      if (!result || !latest || latest === app.getVersion()) {
        this.showInfo('정보', `현재 최신 버전을 사용 중입니다 (v${app.getVersion()}).`)
      }
      // 새 버전 — update-available 이벤트가 자동 발화해 onUpdateAvailable 처리
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? String(err)
      this.showInfo('오류', `업데이트 확인 실패: ${msg}`)
    }
  }

  private async onUpdateAvailable(version: string): Promise<void> {
    const choice = await this.showChoice({
      title: '업데이트 발견',
      message: `새 버전 v${version} 이 있습니다.`,
      detail: '지금 다운로드할까요? (다운로드 중에도 위젯 사용 가능)',
      buttons: ['다운로드', '나중에']
    })
    if (choice === 0) {
      try {
        await autoUpdater.downloadUpdate()
      } catch (err: unknown) {
        const msg = (err as { message?: string } | null)?.message ?? String(err)
        this.showInfo('오류', `다운로드 실패: ${msg}`)
      }
    }
  }

  private async onUpdateDownloaded(version: string): Promise<void> {
    const choice = await this.showChoice({
      title: '업데이트 다운로드 완료',
      message: `v${version} 다운로드가 완료되었습니다.`,
      detail: '지금 재시작하고 적용하시겠습니까?',
      buttons: ['재시작·적용', '나중에']
    })
    if (choice === 0) {
      autoUpdater.quitAndInstall()
    }
  }

  private async showChoice(opts: {
    title: string
    message: string
    detail: string
    buttons: string[]
  }): Promise<number> {
    const win = this.getMainWindow()
    const baseOpts = {
      type: 'info' as const,
      title: opts.title,
      message: opts.message,
      detail: opts.detail,
      buttons: opts.buttons,
      defaultId: 0,
      cancelId: opts.buttons.length - 1
    }
    const result = win
      ? await dialog.showMessageBox(win, baseOpts)
      : await dialog.showMessageBox(baseOpts)
    return result.response
  }

  private showInfo(title: string, message: string): void {
    const win = this.getMainWindow()
    const opts = { type: 'info' as const, title, message }
    if (win) {
      void dialog.showMessageBox(win, opts)
    } else {
      void dialog.showMessageBox(opts)
    }
  }
}
