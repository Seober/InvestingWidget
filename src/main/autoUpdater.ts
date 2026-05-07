import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo } from 'electron-updater'
import { IPC } from '@shared/ipcChannels'
import { t } from '@shared/i18n/messages'
import { openModal } from './modalWindow'

// 자동 업데이트 매니저 — electron-updater 의 GitHub Releases 기반 자동 업데이트.
// 사용자 동의 우선 — autoDownload·autoInstallOnAppQuit 모두 false. 다운로드·재시작·적용 모두 사용자 명시 동의.
//
// 흐름:
// 1. update-available 이벤트 → native showMessageBox "다운로드?" 동의 시 progress modal 열고 downloadUpdate
// 2. download-progress 이벤트 → progress modal 살아있으면 IPC 전달, 없으면 무시 (백그라운드 다운로드 계속)
// 3. update-downloaded 이벤트 → modal 살아있으면 IPC 로 ready 상태 전환, 없으면 native dialog 안전망
// 4. modal 의 재시작 버튼 또는 native dialog 의 재시작 → quitAndInstall
export class UpdaterManager {
  private progressModal: BrowserWindow | null = null

  constructor(private getMainWindow: () => BrowserWindow | null) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('update-available', (info) => {
      void this.onUpdateAvailable(info?.version ?? '?')
    })
    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.sendProgressToModal(progress)
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
      this.showInfo(t.updater.info, t.updater.devModeBlocked)
      return
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      const latest = result?.updateInfo?.version
      if (!result || !latest || latest === app.getVersion()) {
        this.showInfo(t.updater.info, t.updater.upToDate(app.getVersion()))
      }
      // 새 버전 — update-available 이벤트가 자동 발화해 onUpdateAvailable 처리
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? String(err)
      this.showInfo(t.updater.error, t.updater.checkFailed(msg))
    }
  }

  // renderer (progress modal) 에서 IPC.UPDATE_ACCEPT_INSTALL 받았을 때 호출.
  acceptInstall(): void {
    autoUpdater.quitAndInstall()
  }

  private async onUpdateAvailable(version: string): Promise<void> {
    const choice = await this.showChoice({
      title: t.updater.foundTitle,
      message: t.updater.foundMessage(version),
      detail: t.updater.downloadPrompt,
      buttons: [t.updater.downloadButton, t.updater.laterButton],
    })
    if (choice !== 0) return
    try {
      this.openProgressModal()
      await autoUpdater.downloadUpdate()
    } catch (err: unknown) {
      const msg = (err as { message?: string } | null)?.message ?? String(err)
      this.showInfo(t.updater.error, t.updater.downloadFailed(msg))
    }
  }

  private async onUpdateDownloaded(version: string): Promise<void> {
    if (this.progressModal && !this.progressModal.isDestroyed()) {
      // modal 살아있음 — IPC 로 ready 상태 전환, 사용자가 modal 의 재시작 버튼으로 결정
      this.progressModal.webContents.send(IPC.UPDATE_DOWNLOADED, { version })
      return
    }
    // modal 이 close 됐을 경우 안전망 — native dialog
    const choice = await this.showChoice({
      title: t.updater.downloadedTitle,
      message: t.updater.downloadedMessage(version),
      detail: t.updater.restartPrompt,
      buttons: [t.updater.restartButton, t.updater.laterButton],
    })
    if (choice === 0) {
      this.acceptInstall()
    }
  }

  private openProgressModal(): void {
    const parent = this.getMainWindow()
    if (!parent) return
    const modal = openModal({ parent, kind: 'updater-progress' })
    this.progressModal = modal
    modal.on('closed', () => {
      if (this.progressModal === modal) this.progressModal = null
    })
  }

  private sendProgressToModal(progress: ProgressInfo): void {
    if (!this.progressModal || this.progressModal.isDestroyed()) return
    this.progressModal.webContents.send(IPC.UPDATE_PROGRESS, {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
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
      cancelId: opts.buttons.length - 1,
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
