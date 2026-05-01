import { AppConfig, ItemConfig } from '@shared/schema'

export function resolveClickThroughUrl(item: ItemConfig, config: AppConfig): string | null {
  const templates = config.defaults.clickThroughTemplates
  const template =
    item.clickThroughUrl?.trim() ||
    (item.source ? templates[item.source] : '') ||
    templates[item.assetType] ||
    ''
  if (!template) return null

  const symbolUpper = item.symbol.toUpperCase()
  const quote = (item.quoteCurrency ?? 'USDT').toUpperCase()
  const base = symbolUpper
  // KR stocks may be stored with a market prefix ("KOSDAQ:091990") for TradingView
  // subscription, but the click-through URL template (kr.tradingview.com/symbols/KRX-…)
  // only wants the bare 6-digit code.
  const urlSymbol =
    item.assetType === 'stock-kr' && symbolUpper.includes(':')
      ? symbolUpper.split(':')[1]
      : symbolUpper
  const fullSymbol =
    item.assetType === 'crypto-spot' || item.assetType === 'crypto-perp'
      ? `${base}${quote}`
      : urlSymbol

  return template
    .replaceAll('{symbol}', fullSymbol)
    .replaceAll('{base}', base)
    .replaceAll('{quote}', quote)
}
