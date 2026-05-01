import { create } from 'zustand'
import type { AppConfig, ItemConfig, Tick } from '@shared/schema'
import { adapterFor, type AdapterId } from '@shared/adapterMap'

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
  setConfig: (cfg: AppConfig) => void
  applyTick: (tick: Tick) => void
  setItemError: (itemId: string, message: string) => void
  setAdapterStatus: (
    adapterId: string,
    status: 'open' | 'closed' | 'connecting' | 'reconnecting',
    message?: string
  ) => void
}

export const useStore = create<AppState>((set) => ({
  config: null,
  items: [],
  ticks: {},
  setConfig: (cfg) => set({ config: cfg, items: cfg.items }),
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
          errorMessage: undefined
        }
      }
    })),
  setItemError: (itemId, message) =>
    set((s) => ({
      ticks: {
        ...s.ticks,
        [itemId]: { ...s.ticks[itemId], status: 'closed', errorMessage: message }
      }
    })),
  setAdapterStatus: (adapterId, status, message) =>
    set((s) => {
      const next = { ...s.ticks }
      for (const item of s.items) {
        if (adapterFor(item.assetType) !== (adapterId as AdapterId)) continue
        if (next[item.id]?.errorMessage) continue
        next[item.id] = { ...next[item.id], status, errorMessage: message }
      }
      return { ticks: next }
    })
}))
