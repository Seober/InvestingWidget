import { app, BrowserWindow, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import { IPC } from '@shared/ipcChannels'
import { t } from '@shared/i18n/messages'
import { parseReleaseSummary, buildReleaseUrl } from '@shared/releaseNotes'
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
      void this.onUpdateAvailable(info?.version ?? '?', info?.releaseNotes)
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
    // silent (/S) + force-run — 업데이트 시 마법사 UI 없이 silent install 후 위젯 자동 재실행.
    // electron-updater 가 setup.exe 에 /S + --updated + --force-run 인자 추가 →
    //   NSIS 가 모든 페이지 skip, installer.nsh 의 Section 들이 ${isUpdated} 가드로 바로가기 보존.
    // 최초 설치(사용자가 setup.exe 더블클릭) 는 /S 없으므로 마법사 정상 표시.
    autoUpdater.quitAndInstall(true, true)
  }

  private async onUpdateAvailable(
    version: string,
    releaseNotes: UpdateInfo['releaseNotes']
  ): Promise<void> {
    // release body 의 <!-- summary --> 마커 사이 3줄 요약 — 없으면 옛 prompt 로 fallback.
    const summary = parseReleaseSummary(releaseNotes)
    const buttons = summary
      ? [t.updater.downloadButton, t.updater.viewBodyButton, t.updater.laterButton]
      : [t.updater.downloadButton, t.updater.laterButton]

    // while 루프 — "본문 보기" 클릭 시 GitHub 띄우고 dialog 즉시 재오픈.
    // native dialog 는 OS 동작상 버튼 누르면 자동 닫힘 → 재오픈으로 "유지" UX 근사.
    while (true) {
      const choice = await this.showChoice({
        title: t.updater.foundTitle,
        message: t.updater.foundMessage(version),
        detail: summary ?? t.updater.downloadPrompt,
        buttons,
      })
      // choice 0 = 다운로드 (summary 유무 무관)
      if (choice === 0) {
        try {
          this.openProgressModal()
          await autoUpdater.downloadUpdate()
        } catch (err: unknown) {
          const msg = (err as { message?: string } | null)?.message ?? String(err)
          this.showInfo(t.updater.error, t.updater.downloadFailed(msg))
        }
        return
      }
      // choice 1 = (summary 있을 때만) 본문 보기 — GitHub 새 탭 열고 루프 재진입
      if (summary && choice === 1) {
        void shell.openExternal(buildReleaseUrl(version))
        continue
      }
      // 그 외 — 나중에 / cancel
      return
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
