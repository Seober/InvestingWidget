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

function parseMatch(it: any): KrStockMatch | null {
  const code = String(it?.code ?? '')
  if (!/^\d{6}$/.test(code)) return null
  const typeName = String(it?.typeName ?? it?.marketName ?? '')
  let market: KrMarket = 'KRX'
  if (/KOSDAQ|코스닥/i.test(typeName)) market = 'KOSDAQ'
  else if (/KOSPI|코스피/i.test(typeName)) market = 'KOSPI'
  else if (/KONEX|코넥스/i.test(typeName)) market = 'KONEX'
  const name = String(it?.name ?? code)
  return { code, name, market }
}

export async function resolveKrStock(query: string): Promise<KrStockMatch | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  const url = `${NAVER_AC_URL}?q=${encodeURIComponent(trimmed)}&target=stock`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json'
      }
    })
  } catch (err: any) {
    console.warn(`[kr-resolver] network error for "${trimmed}":`, err?.message ?? err)
    return null
  }
  if (!res.ok) {
    console.warn(`[kr-resolver] HTTP ${res.status} for "${trimmed}"`)
    return null
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    console.warn(`[kr-resolver] JSON parse failed for "${trimmed}"`)
    return null
  }

  // Response shape variations: items can be flat array or [array]
  let items: any[] = []
  if (Array.isArray(data?.items)) {
    items = data.items
    if (items.length > 0 && Array.isArray(items[0])) items = items[0]
  }

  for (const it of items) {
    const m = parseMatch(it)
    if (m) return m
  }
  return null
}
