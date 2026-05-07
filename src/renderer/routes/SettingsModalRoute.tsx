import { SettingsModal } from '../components/SettingsModal'
import { useModalConfig } from '../hooks/useModalConfig'

export function SettingsModalRoute() {
  const config = useModalConfig()

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
