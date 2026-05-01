import { useEffect, useState } from 'react'
import { SettingsModal } from '../components/SettingsModal'
import type { AppConfig } from '@shared/schema'

export function SettingsModalRoute() {
  const [config, setConfig] = useState<AppConfig | null>(null)

  useEffect(() => {
    void window.api.config.get().then(setConfig)
  }, [])

  if (!config) return <div className="loading">로딩 중…</div>

  return (
    <SettingsModal
      config={config}
      onClose={() => window.close()}
      onSave={async (patch) => {
        await window.api.config.set(patch)
      }}
    />
  )
}
