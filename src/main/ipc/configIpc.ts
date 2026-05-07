import { ipcMain } from 'electron'
import type { AppConfig } from '@shared/schema'
import { IPC } from '@shared/ipcChannels'
import type { ConfigStore } from '../configStore'
import type { PriceService } from '../priceService'

interface Deps {
  config: ConfigStore
  prices: PriceService
  broadcastConfig: () => void
}

// CONFIG_GET / CONFIG_SET handlers — set 시 finnhub api key·tradingview enabled 변경에
// 따라 priceService 의 setFinnhubApiKey/setTradingViewEnabled 자동 반영.
export function register(deps: Deps): void {
  const { config, prices, broadcastConfig } = deps

  ipcMain.handle(IPC.CONFIG_GET, () => config.get())

  ipcMain.handle(IPC.CONFIG_SET, (_e, patch: Partial<AppConfig>) => {
    const before = config.get()
    const next = config.set(patch)
    if (patch.finnhubApiKey !== undefined && patch.finnhubApiKey !== before.finnhubApiKey) {
      prices.setFinnhubApiKey(patch.finnhubApiKey)
    }
    if (
      patch.tradingViewEnabled !== undefined &&
      patch.tradingViewEnabled !== before.tradingViewEnabled
    ) {
      prices.setTradingViewEnabled(patch.tradingViewEnabled)
      prices.setItems(next.items)
    } else if (patch.items !== undefined) {
      prices.setItems(next.items)
    }
    broadcastConfig()
    return next
  })
}
