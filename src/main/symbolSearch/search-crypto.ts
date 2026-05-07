import type { SymbolSuggestion } from '@shared/schema'
import type { PerpPair, SpotPair } from './cryptoIndexManager'

// 암호화폐 spot 자동완성 — 2 단계 매치:
// 1) base 가 query 로 시작 (prefix), 2) baseName 이 query 포함 (substring).
export function searchCryptoSpot(
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

// 암호화폐 perp 자동완성 — prefix match 만 (baseName 출처 X).
export function searchCryptoPerp(
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
