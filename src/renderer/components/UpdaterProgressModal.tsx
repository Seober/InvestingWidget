import type { UpdateProgressInfo } from '@shared/schema'

interface Props {
  progress: UpdateProgressInfo | null
  downloadedVersion: string | null
  onAccept: () => void
  onDismiss: () => void
}

const MB = 1024 * 1024

export function UpdaterProgressModal({ progress, downloadedVersion, onAccept, onDismiss }: Props) {
  if (downloadedVersion) {
    return (
      <div className="modal-backdrop">
        <div className="modal modal-wide">
          <h2>v{downloadedVersion} 다운로드 완료</h2>
          <p>지금 재시작하고 적용하시겠습니까?</p>
          <div className="modal-actions">
            <button onClick={onDismiss}>나중에</button>
            <button type="submit" onClick={onAccept}>
              재시작·적용
            </button>
          </div>
        </div>
      </div>
    )
  }

  const percent = progress?.percent ?? 0
  const transferredMB = progress ? (progress.transferred / MB).toFixed(1) : '0.0'
  const totalMB = progress ? (progress.total / MB).toFixed(1) : '?'
  const speedMBps = progress ? (progress.bytesPerSecond / MB).toFixed(1) : '0.0'

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <h2>새 버전 다운로드 중</h2>
        <progress className="updater-progress-bar" value={percent} max={100} />
        <p className="updater-progress-text">
          {percent.toFixed(1)}% — {transferredMB} MB / {totalMB} MB
        </p>
        <p className="muted">속도: {speedMBps} MB/s</p>
        <div className="modal-actions">
          <button onClick={onDismiss}>백그라운드로</button>
        </div>
      </div>
    </div>
  )
}
