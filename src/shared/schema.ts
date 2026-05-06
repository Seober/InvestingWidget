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

export interface WindowConfig {
  x: number | null
  y: number | null
  width: number
  height: number
  opacity: number
  alwaysOnTop: boolean
  autoStart: boolean
}

export interface OpacityBounds {
  min: number
  max: number
}

export type Theme = 'light' | 'dark' | 'auto'

export interface DefaultsConfig {
  clickThroughTemplates: Record<string, string>
  opacityBounds: OpacityBounds
}

export interface AppConfig {
  schemaVersion: number
  window: WindowConfig
  refreshIntervalMs: number
  theme: Theme
  fontSize: number
  finnhubApiKey: string
  tradingViewEnabled: boolean
  items: ItemConfig[]
  defaults: DefaultsConfig
}

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 1,
  window: {
    x: null,
    y: null,
    width: 280,
    height: 200,
    opacity: 0.9,
    alwaysOnTop: true,
    autoStart: false
  },
  refreshIntervalMs: 500,
  theme: 'dark',
  fontSize: 13,
  finnhubApiKey: '',
  tradingViewEnabled: false,
  items: [],
  defaults: {
    clickThroughTemplates: {
      'binance-spot': 'https://www.binance.com/en/trade/{base}_{quote}',
      'binance-perp': 'https://www.binance.com/en/futures/{base}{quote}',
      'gateio-spot': 'https://www.gate.io/trade/{base}_{quote}',
      'gateio-perp': 'https://www.gate.io/futures/usdt/{base}_{quote}',
      'crypto-spot': 'https://www.binance.com/en/trade/{base}_{quote}',
      'crypto-perp': 'https://www.binance.com/en/futures/{base}{quote}',
      'stock-us': 'https://finance.yahoo.com/quote/{symbol}',
      'etf-us': 'https://finance.yahoo.com/quote/{symbol}',
      'stock-kr': 'https://kr.tradingview.com/symbols/KRX-{symbol}/',
      'etf-kr': 'https://kr.tradingview.com/symbols/KRX-{symbol}/'
    },
    opacityBounds: { min: 0.15, max: 1.0 }
  }
}

export interface Tick {
  itemId: string
  price: number
  changePct: number
  ts: number
}

export type AdapterStatus = 'connecting' | 'open' | 'closed' | 'reconnecting'

export interface ItemStatusEvent {
  itemId: string
  status: AdapterStatus
  message?: string
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
