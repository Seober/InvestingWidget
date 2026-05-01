import { useEffect, useState } from 'react'
import { AddItemModal } from '../components/AddItemModal'
import type { AppConfig, ItemConfig } from '@shared/schema'

interface Props {
  itemId?: string
}

export function AddItemModalRoute({ itemId }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [initial, setInitial] = useState<ItemConfig | null>(null)

  useEffect(() => {
    void window.api.config.get().then((cfg) => {
      setConfig(cfg)
      if (itemId) {
        const found = cfg.items.find((i) => i.id === itemId) ?? null
        setInitial(found)
      }
    })
  }, [itemId])

  if (!config) return <div className="loading">로딩 중…</div>

  return (
    <AddItemModal
      initial={initial}
      existingItems={config.items}
      templates={config.defaults.clickThroughTemplates}
      onClose={() => window.close()}
      onSubmit={async (draft) => {
        const validation = await window.api.items.validate({
          symbol: draft.symbol,
          assetType: draft.assetType,
          displayName: draft.displayName,
          quoteCurrency: draft.quoteCurrency,
          clickThroughUrl: draft.clickThroughUrl
        })
        if (!validation.ok) {
          throw new Error(validation.error ?? '시세를 받을 수 없습니다.')
        }
        const enriched = { ...draft, source: validation.source }
        if (draft.id) {
          await window.api.items.edit(enriched as ItemConfig)
        } else {
          await window.api.items.add(enriched)
        }
      }}
    />
  )
}
