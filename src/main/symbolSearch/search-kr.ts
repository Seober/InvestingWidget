import type { SourceId, SymbolSuggestion } from '@shared/schema'
import { searchKrStock } from '../krStockResolver'

// 한국 주식·ETF 자동완성 — Naver autocomplete delegate 후 storeAs 변환.
// Naver autocomplete가 ETF·일반 주식을 같은 typeCode(KOSPI)로 반환해 구분 불가.
// 사용자가 자산 유형(주식/ETF)을 미리 선택했으므로 동일 검색 결과 노출.
export async function searchKr(query: string, limit: number): Promise<SymbolSuggestion[]> {
  const matches = await searchKrStock(query, limit)
  return matches.map((m) => ({
    symbol: m.code,
    name: m.name,
    market: m.market,
    source: 'tradingview' as SourceId,
    // KOSPI: store bare code (toTVSymbol adds KRX:). Otherwise prefix explicitly.
    storeAs: m.market === 'KOSPI' ? m.code : `${m.market}:${m.code}`,
  }))
}
