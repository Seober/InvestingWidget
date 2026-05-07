// 암호화폐 spot/perp index 캐시 — 1h TTL.
// Binance + Gate.io 의 거래중인 페어 list 를 합쳐 자동완성용 index 구성.
const BINANCE_SPOT_URL = 'https://api.binance.com/api/v3/exchangeInfo'
const GATEIO_SPOT_URL = 'https://api.gateio.ws/api/v4/spot/currency_pairs'
const GATEIO_PERP_URL = 'https://api.gateio.ws/api/v4/futures/usdt/contracts'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

export interface SpotPair {
  base: string
  quote: string
  baseName?: string
  source: 'binance-spot' | 'gateio-spot'
}

export interface PerpPair {
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

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getSpotIndex(): Promise<SpotPair[]> {
  if (spotCache && Date.now() - spotCache.ts < CACHE_TTL_MS) return spotCache.data
  const merged: SpotPair[] = []
  // Binance is the largest, listed first → preferred when same (base,quote) appears in both.
  try {
    const bin = (await fetchJson(BINANCE_SPOT_URL)) as {
      symbols?: Array<{ status?: string; baseAsset?: string; quoteAsset?: string }>
    }
    for (const s of bin?.symbols ?? []) {
      if (s?.status !== 'TRADING') continue
      merged.push({
        base: String(s.baseAsset),
        quote: String(s.quoteAsset),
        source: 'binance-spot',
      })
    }
  } catch (err: unknown) {
    const msg = (err as { message?: string } | null)?.message ?? String(err)
    console.warn('[symbol-search] binance spot:', msg)
  }
  // De-dupe key by base+quote (uppercase) so we know what to skip from Gate.io.
  const seen = new Set<string>(
    merged.map((p) => `${p.base.toUpperCase()}_${p.quote.toUpperCase()}`)
  )
  try {
    const gate = (await fetchJson(GATEIO_SPOT_URL)) as Array<{
      trade_status?: string
      base?: string
      quote?: string
      base_name?: string
    }>
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
  } catch (err: unknown) {
    const msg = (err as { message?: string } | null)?.message ?? String(err)
    console.warn('[symbol-search] gateio spot:', msg)
  }
  // 두 거래소 모두 실패해서 빈 결과 → 캐시 안 함 (다음 호출에서 재시도)
  if (merged.length > 0) spotCache = { data: merged, ts: Date.now() }
  return merged
}

export async function getPerpIndex(): Promise<PerpPair[]> {
  if (perpCache && Date.now() - perpCache.ts < CACHE_TTL_MS) return perpCache.data
  const out: PerpPair[] = []
  try {
    const gate = (await fetchJson(GATEIO_PERP_URL)) as Array<{
      in_delisting?: boolean
      name?: string
    }>
    if (Array.isArray(gate)) {
      for (const c of gate) {
        if (c?.in_delisting) continue
        const name = String(c?.name ?? '')
        const m = /^(.+)_(USDT|USDC|USD)$/.exec(name)
        if (!m) continue
        out.push({ base: m[1], quote: m[2] })
      }
    }
  } catch (err: unknown) {
    const msg = (err as { message?: string } | null)?.message ?? String(err)
    console.warn('[symbol-search] gateio perp:', msg)
  }
  if (out.length > 0) perpCache = { data: out, ts: Date.now() }
  return out
}
