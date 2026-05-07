import { useMemo } from 'react'
import type { ItemConfig } from '@shared/schema'
import { AddItemModal } from '../components/AddItemModal'
import { useModalConfig } from '../hooks/useModalConfig'

interface Props {
  itemId?: string
}

export function AddItemModalRoute({ itemId }: Props) {
  const config = useModalConfig()
  // itemId 가 주어진 경우 (edit-item) 해당 항목 찾기 — config 의 items 에서 derived.
  const initial = useMemo(() => {
    if (!config || !itemId) return null
    return config.items.find((i) => i.id === itemId) ?? null
  }, [config, itemId])

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
          clickThroughUrl: draft.clickThroughUrl,
          source: draft.source, // 자동완성 픽에서 온 어댑터 힌트 — validate가 이 어댑터부터 시도
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
