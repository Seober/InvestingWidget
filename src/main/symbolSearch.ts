import { AssetType, SourceId, SymbolSuggestion } from '@shared/schema'
import { searchKrStock } from './krStockResolver'

const YAHOO_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search'
const BINANCE_SPOT_URL = 'https://api.binance.com/api/v3/exchangeInfo'
const GATEIO_SPOT_URL = 'https://api.gateio.ws/api/v4/spot/currency_pairs'
const GATEIO_PERP_URL = 'https://api.gateio.ws/api/v4/futures/usdt/contracts'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

interface SpotPair {
  base: string
  quote: string
  baseName?: string
  source: 'binance-spot' | 'gateio-spot'
}

interface PerpPair {
  base: string
  quote: string
}

let spotCache: { data: SpotPair[]; ts: number } | null = null
let perpCache: { data: PerpPair[]; ts: number } | null = null

// app 종료 시 명시적 정리 — 메모리 누수 방지·테스트 격리.
export function clearSearchCache(): void {
  spotCache = null
  perpCache = null
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function getSpotIndex(): Promise<SpotPair[]> {
  if (spotCache && Date.now() - spotCache.ts < CACHE_TTL_MS) return spotCache.data
  const merged: SpotPair[] = []
  // Binance is the largest, listed first → preferred when same (base,quote) appears in both.
  try {
    const bin = await fetchJson(BINANCE_SPOT_URL)
    for (const s of bin?.symbols ?? []) {
      if (s?.status !== 'TRADING') continue
      merged.push({
        base: String(s.baseAsset),
        quote: String(s.quoteAsset),
        source: 'binance-spot',
      })
    }
  } catch (err: any) {
    console.warn('[symbol-search] binance spot:', err?.message ?? err)
  }
  // De-dupe key by base+quote (uppercase) so we know what to skip from Gate.io.
  const seen = new Set<string>(
    merged.map((p) => `${p.base.toUpperCase()}_${p.quote.toUpperCase()}`)
  )
  try {
    const gate = await fetchJson(GATEIO_SPOT_URL)
    if (Array.isArray(gate)) {
      for (const p of gate) {
        if (p?.trade_status !== 'tradable') continue
        const base = String(p?.base ?? '')
        const quote = String(p?.quote ?? '')
        if (!base || !quote) continue
        const key = `${base.toUpperCase()}_${quote.toUpperCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push({
          base,
          quote,
          baseName: p?.base_name ? String(p.base_name) : undefined,
          source: 'gateio-spot',
        })
      }
    }
  } catch (err: any) {
    console.warn('[symbol-search] gateio spot:', err?.message ?? err)
  }
  // 두 거래소 모두 실패해서 빈 결과 → 캐시 안 함 (다음 호출에서 재시도)
  if (merged.length > 0) spotCache = { data: merged, ts: Date.now() }
  return merged
}

async function getPerpIndex(): Promise<PerpPair[]> {
  if (perpCache && Date.now() - perpCache.ts < CACHE_TTL_MS) return perpCache.data
  const out: PerpPair[] = []
  try {
    const gate = await fetchJson(GATEIO_PERP_URL)
    if (Array.isArray(gate)) {
      for (const c of gate) {
        if (c?.in_delisting) continue
        const name = String(c?.name ?? '')
        const m = /^(.+)_(USDT|USDC|USD)$/.exec(name)
        if (!m) continue
        out.push({ base: m[1], quote: m[2] })
      }
    }
  } catch (err: any) {
    console.warn('[symbol-search] gateio perp:', err?.message ?? err)
  }
  if (out.length > 0) perpCache = { data: out, ts: Date.now() }
  return out
}

async function searchUsStock(
  query: string,
  etfOnly: boolean,
  limit: number
): Promise<SymbolSuggestion[]> {
  const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=${limit * 2}&newsCount=0`
  let data: any
  try {
    data = await fetchJson(url)
  } catch (err: any) {
    console.warn('[symbol-search] yahoo:', err?.message ?? err)
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

function searchCryptoSpot(
  index: SpotPair[],
  query: string,
  quote: string,
  limit: number
): SymbolSuggestion[] {
  const qq = query.toUpperCase()
  const ql = query.toLowerCase()
  const qu = quote.toUpperCase()
  const out: SymbolSuggestion[] = []
  // First pass: prefix match on base
  for (const p of index) {
    if (p.quote.toUpperCase() !== qu) continue
    if (!p.base.toUpperCase().startsWith(qq)) continue
    out.push({ symbol: p.base, name: p.baseName ?? p.base, source: p.source })
    if (out.length >= limit) break
  }
  if (out.length >= limit) return out
  // Second pass: name contains query (only items not already in out)
  const seen = new Set(out.map((s) => s.symbol.toUpperCase()))
  for (const p of index) {
    if (p.quote.toUpperCase() !== qu) continue
    if (seen.has(p.base.toUpperCase())) continue
    if (!(p.baseName ?? '').toLowerCase().includes(ql)) continue
    out.push({ symbol: p.base, name: p.baseName ?? p.base, source: p.source })
    seen.add(p.base.toUpperCase())
    if (out.length >= limit) break
  }
  return out
}

function searchCryptoPerp(
  index: PerpPair[],
  query: string,
  quote: string,
  limit: number
): SymbolSuggestion[] {
  const qq = query.toUpperCase()
  const qu = quote.toUpperCase()
  const out: SymbolSuggestion[] = []
  for (const p of index) {
    if (p.quote.toUpperCase() !== qu) continue
    if (!p.base.toUpperCase().startsWith(qq)) continue
    out.push({ symbol: p.base, name: p.base, source: 'gateio-perp' })
    if (out.length >= limit) break
  }
  return out
}

export async function searchSymbols(
  assetType: AssetType,
  query: string,
  quoteCurrency: string = 'USDT',
  limit: number = 10
): Promise<SymbolSuggestion[]> {
  const q = query.trim()
  if (!q) return []

  if (assetType === 'stock-kr' || assetType === 'etf-kr') {
    // Naver autocomplete가 ETF·일반 주식을 같은 typeCode(KOSPI)로 반환해 구분 불가.
    // 사용자가 자산 유형(주식/ETF)을 미리 선택했으므로 동일 검색 결과 노출.
    const matches = await searchKrStock(q, limit)
    return matches.map((m) => ({
      symbol: m.code,
      name: m.name,
      market: m.market,
      source: 'tradingview' as SourceId,
      // KOSPI: store bare code (toTVSymbol adds KRX:). Otherwise prefix explicitly.
      storeAs: m.market === 'KOSPI' ? m.code : `${m.market}:${m.code}`,
    }))
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
