export type AssetType =
  | 'crypto-spot'
  | 'crypto-perp'
  | 'stock-us'
  | 'etf-us'
  | 'stock-kr'
  | 'etf-kr'

export type SourceId =
  | 'binance-spot'
  | 'binance-perp'
  | 'gateio-spot'
  | 'gateio-perp'
  | 'finnhub'
  | 'tradingview'

export interface ItemConfig {
  id: string
  symbol: string
  displayName?: string
  assetType: AssetType
  quoteCurrency?: string
  source?: SourceId
  clickThroughUrl?: string
}

export interface ValidateResult {
  ok: boolean
  source?: SourceId
  error?: string
}

export interface SymbolSuggestion {
  symbol: string // 입력 필드에 채워질 값 (예: "BTC", "AAPL", "005930")
  name: string // 표시 이름 (예: "Bitcoin", "Apple Inc.", "삼성전자")
  market?: string // 시장 식별자 (예: "KOSPI", "NASDAQ")
  source?: SourceId // 어댑터 힌트 — validate 시 이 어댑터를 우선 시도 (NUMI 등 한 거래소만 있는 토큰의 지연 회피)
  storeAs?: string // 저장용 심볼 — symbol과 다르면 이 값 우선 (예: KOSDAQ는 "KOSDAQ:091990")
}
