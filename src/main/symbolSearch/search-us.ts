import type { SymbolSuggestion } from '@shared/schema'

const YAHOO_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search'

interface YahooQuote {
  symbol?: string
  quoteType?: string
  longname?: string
  shortname?: string
  exchDisp?: string
  exchange?: string
}

// 미국 주식·ETF 자동완성 — Yahoo Finance search 활용.
// etfOnly=true 면 quoteType === 'ETF' 만 필터, false 면 'EQUITY' 만.
export async function searchUsStock(
  query: string,
  etfOnly: boolean,
  limit: number
): Promise<SymbolSuggestion[]> {
  const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=${limit * 2}&newsCount=0`
  let data: { quotes?: YahooQuote[] } | null = null
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = (await res.json()) as { quotes?: YahooQuote[] }
  } catch (err: unknown) {
    const msg = (err as { message?: string } | null)?.message ?? String(err)
    console.warn('[symbol-search] yahoo:', msg)
    return []
  }
  const quotes = Array.isArray(data?.quotes) ? data.quotes : []
  const out: SymbolSuggestion[] = []
  for (const q of quotes) {
    const sym = String(q?.symbol ?? '')
    if (!sym) continue
    const type = String(q?.quoteType ?? '')
    if (etfOnly ? type !== 'ETF' : type !== 'EQUITY') continue
    const name = String(q?.longname ?? q?.shortname ?? sym)
    const exch = String(q?.exchDisp ?? q?.exchange ?? '')
    out.push({ symbol: sym, name, market: exch || undefined })
    if (out.length >= limit) break
  }
  return out
}
