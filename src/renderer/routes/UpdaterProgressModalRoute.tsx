import { useEffect, useState } from 'react'
import type { UpdateProgressInfo } from '@shared/schema'
import { UpdaterProgressModal } from '../components/UpdaterProgressModal'

export function UpdaterProgressModalRoute() {
  const [progress, setProgress] = useState<UpdateProgressInfo | null>(null)
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
