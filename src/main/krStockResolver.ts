// Resolves a Korean company name (Hangul/English) to its 6-digit ticker code
// via Naver Finance's autocomplete endpoint. Unofficial — same backend that
// powers Naver Finance's search box, generally stable but can break without
// notice. If it does, users can still register stocks by 6-digit code or
// `KOSDAQ:nnnnnn`/`KOSPI:nnnnnn` prefixed form (resolver is bypassed).

const NAVER_AC_URL = 'https://ac.stock.naver.com/ac'

export type KrMarket = 'KOSPI' | 'KOSDAQ' | 'KONEX' | 'KRX'

export interface KrStockMatch {
  code: string // 6-digit Korean stock code (e.g., "005930")
  name: string // Korean company name (e.g., "삼성전자")
  market: KrMarket // for TradingView prefix decision
}

// Naver autocomplete item — 부분 type (검증되지 않은 외부 응답).
// 실제 response 의 키 다수 존재하지만 사용 분만 type 화 + 모두 unknown 허용.
interface KrAcItem {
  code?: unknown
  typeName?: unknown
  marketName?: unknown
  name?: unknown
}

interface KrAcResponse {
  items?: unknown
}

function parseMatch(it: KrAcItem): KrStockMatch | null {
  const code = String(it?.code ?? '').toUpperCase()
  // 6자리 코드 — 순수 숫자(005930) 또는 영숫자 혼합(0023A0, 0167A0 등 신규 ETF).
  // KRX가 2024년경 도입한 알파벳 포함 코드 대응.
  if (!/^[0-9A-Z]{6}$/.test(code)) return null
  const typeName = String(it?.typeName ?? it?.marketName ?? '')
  let market: KrMarket = 'KRX'
  if (/KOSDAQ|코스닥/i.test(typeName)) market = 'KOSDAQ'
  else if (/KOSPI|코스피/i.test(typeName)) market = 'KOSPI'
  else if (/KONEX|코넥스/i.test(typeName)) market = 'KONEX'
  const name = String(it?.name ?? code)
  return { code, name, market }
}

export async function searchKrStock(query: string, limit: number = 10): Promise<KrStockMatch[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = `${NAVER_AC_URL}?q=${encodeURIComponent(trimmed)}&target=stock`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    })
  } catch (err: unknown) {
    const msg = (err as { message?: string } | null)?.message ?? String(err)
    console.warn(`[kr-resolver] network error for "${trimmed}":`, msg)
    return []
  }
  if (!res.ok) {
    console.warn(`[kr-resolver] HTTP ${res.status} for "${trimmed}"`)
    return []
  }

  let data: KrAcResponse
  try {
    data = (await res.json()) as KrAcResponse
  } catch {
    console.warn(`[kr-resolver] JSON parse failed for "${trimmed}"`)
    return []
  }

  // Response shape variations: items can be flat array or [array]
  let items: KrAcItem[] = []
  if (Array.isArray(data?.items)) {
    items = data.items as KrAcItem[]
    if (items.length > 0 && Array.isArray(items[0])) items = items[0] as KrAcItem[]
  }

  const out: KrStockMatch[] = []
  const seen = new Set<string>()
  for (const it of items) {
    const m = parseMatch(it)
    if (!m) continue
    if (seen.has(m.code)) continue
    seen.add(m.code)
    out.push(m)
    if (out.length >= limit) break
  }
  return out
}

export async function resolveKrStock(query: string): Promise<KrStockMatch | null> {
  const matches = await searchKrStock(query, 1)
  return matches[0] ?? null
}
