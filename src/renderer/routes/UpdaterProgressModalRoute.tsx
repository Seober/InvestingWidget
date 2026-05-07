import { useEffect, useState } from 'react'
import { UpdaterProgressModal } from '../components/UpdaterProgressModal'

interface ProgressInfo {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export function UpdaterProgressModalRoute() {
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null)

  useEffect(() => {
    const offProgress = window.api.updater.onProgress(setProgress)
    const offDownloaded = window.api.updater.onDownloaded((info) => {
      setDownloadedVersion(info.version)
    })
    return () => {
      offProgress()
      offDownloaded()
    }
  }, [])

  return (
    <UpdaterProgressModal
      progress={progress}
      downloadedVersion={downloadedVersion}
      onAccept={() => window.api.updater.acceptInstall()}
      onDismiss={() => window.close()}
    />
  )
}
