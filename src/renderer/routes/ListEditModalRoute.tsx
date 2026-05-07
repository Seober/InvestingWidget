import type { ItemConfig } from '@shared/schema'
import { ListEditModal } from '../components/ListEditModal'
import { useModalConfig } from '../hooks/useModalConfig'

export function ListEditModalRoute() {
  const config = useModalConfig()

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
