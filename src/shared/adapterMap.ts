import type { AssetType } from './schema'

export type AdapterId = 'binance-spot' | 'binance-perp' | 'finnhub' | 'tradingview'

export function adapterFor(assetType: AssetType): AdapterId | null {
  switch (assetType) {
    case 'crypto-spot':
      return 'binance-spot'
    case 'crypto-perp':
      return 'binance-perp'
    case 'stock-us':
    case 'etf-us':
      return 'finnhub'
    case 'stock-kr':
      return 'tradingview'
    default:
      return null
  }
}
