import { useEffect, useState } from 'react'
import { ListEditModal } from '../components/ListEditModal'
import type { AppConfig, ItemConfig } from '@shared/schema'

export function ListEditModalRoute() {
  const [config, setConfig] = useState<AppConfig | null>(null)

  useEffect(() => {
    void window.api.config.get().then(setConfig)
  }, [])

  if (!config) return <div className="loading">로딩 중…</div>

  return (
    <ListEditModal
      initialItems={config.items}
      onClose={() => window.close()}
      onSave={async (items: ItemConfig[]) => {
        await window.api.config.set({ items })
      }}
      onEditItem={(itemId: string) => {
        window.api.modal.openEditItem(itemId)
      }}
    />
  )
}
