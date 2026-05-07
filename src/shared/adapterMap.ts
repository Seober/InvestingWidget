import type { AssetType, SourceId } from './schema'

// assetType 의 기본 어댑터 매핑 (Gate.io 는 fallback chain 으로 처리되어 여기 미포함).
export function adapterFor(assetType: AssetType): SourceId | null {
  switch (assetType) {
    case 'crypto-spot':
      return 'binance-spot'
    case 'crypto-perp':
      return 'binance-perp'
    case 'stock-us':
    case 'etf-us':
      return 'finnhub'
    case 'stock-kr':
    case 'etf-kr':
      return 'tradingview'
    default:
      return null
  }
}
