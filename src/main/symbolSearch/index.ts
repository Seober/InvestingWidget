// 자산 유형별 자동완성 dispatcher.
import type { AssetType, SymbolSuggestion } from '@shared/schema'
import { getPerpIndex, getSpotIndex } from './cryptoIndexManager'
import { searchCryptoPerp, searchCryptoSpot } from './search-crypto'
import { searchKr } from './search-kr'
import { searchUsStock } from './search-us'

export { clearSearchCache } from './cryptoIndexManager'

export async function searchSymbols(
  assetType: AssetType,
  query: string,
  quoteCurrency: string = 'USDT',
  limit: number = 10
): Promise<SymbolSuggestion[]> {
  const q = query.trim()
  if (!q) return []

  if (assetType === 'stock-kr' || assetType === 'etf-kr') {
    return searchKr(q, limit)
  }

  if (assetType === 'stock-us' || assetType === 'etf-us') {
    return searchUsStock(q, assetType === 'etf-us', limit)
  }

  if (assetType === 'crypto-spot') {
    const idx = await getSpotIndex()
    return searchCryptoSpot(idx, q, quoteCurrency, limit)
  }

  if (assetType === 'crypto-perp') {
    const idx = await getPerpIndex()
    return searchCryptoPerp(idx, q, quoteCurrency, limit)
  }

  return []
}
