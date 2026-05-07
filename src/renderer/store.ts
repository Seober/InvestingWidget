import { create } from 'zustand'
import type { AppConfig, ItemConfig, SourceId, Tick } from '@shared/schema'
import { adapterFor } from '@shared/adapterMap'

interface ItemRuntimeState {
  price?: number
  changePct?: number
  ts?: number
  status?: 'open' | 'closed' | 'connecting' | 'reconnecting'
  errorMessage?: string
}

interface AppState {
  config: AppConfig | null
  items: ItemConfig[]
  ticks: Record<string, ItemRuntimeState>
  // adapter 별 itemIds 인덱스 — setAdapterStatus 의 O(items) iter → O(matched) 로 단축.
  // setConfig 시 reindex (items 변경 시점에만 갱신).
  itemIdsByAdapter: Map<SourceId, Set<string>>
  setConfig: (cfg: AppConfig) => void
  applyTick: (tick: Tick) => void
  setItemError: (itemId: string, message: string) => void
  setAdapterStatus: (
    adapterId: string,
    status: 'open' | 'closed' | 'connecting' | 'reconnecting',
    message?: string
  ) => void
}

function buildAdapterIndex(items: ItemConfig[]): Map<SourceId, Set<string>> {
  const index = new Map<SourceId, Set<string>>()
  for (const item of items) {
    const adapter = adapterFor(item.assetType)
    if (!adapter) continue
    let s = index.get(adapter)
    if (!s) {
      s = new Set()
      index.set(adapter, s)
    }
    s.add(item.id)
  }
  return index
}

export const useStore = create<AppState>((set) => ({
  config: null,
  items: [],
  ticks: {},
  itemIdsByAdapter: new Map(),
  setConfig: (cfg) =>
    set({ config: cfg, items: cfg.items, itemIdsByAdapter: buildAdapterIndex(cfg.items) }),
  applyTick: (tick) =>
    set((s) => ({
      ticks: {
        ...s.ticks,
        [tick.itemId]: {
          ...s.ticks[tick.itemId],
          price: tick.price,
          changePct: tick.changePct,
          ts: tick.ts,
          status: 'open',
          errorMessage: undefined,
        },
      },
    })),
  setItemError: (itemId, message) =>
    set((s) => ({
      ticks: {
        ...s.ticks,
        [itemId]: { ...s.ticks[itemId], status: 'closed', errorMessage: message },
      },
    })),
  setAdapterStatus: (adapterId, status, message) =>
    set((s) => {
      const itemIds = s.itemIdsByAdapter.get(adapterId as SourceId)
      if (!itemIds || itemIds.size === 0) return s
      const next = { ...s.ticks }
      for (const itemId of itemIds) {
        if (next[itemId]?.errorMessage) continue
        next[itemId] = { ...next[itemId], status, errorMessage: message }
      }
      return { ticks: next }
    }),
}))
